"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { dateKey, generateMonthlyRoster, type ScheduleEmployee, type ScheduleProcess } from "@/lib/scheduling-engine";
import { requireRoles } from "@/lib/auth";
import { UserRole } from "@prisma/client";

export async function generateRoster(formData: FormData) {
  await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER]);
  const input = z.object({
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2024).max(2100),
  }).parse(Object.fromEntries(formData));

  const [employees, processes, holidays, leaves, availabilities, weeklyOffs, rules] = await Promise.all([
    prisma.employee.findMany({
      where: { status: "ACTIVE" },
      include: {
        brandAssignments: true,
        processAssignments: true,
        weeklyOffs: true,
        leaves: { where: { status: "APPROVED" } },
        availabilities: true,
      },
    }),
    prisma.process.findMany({
      include: { brand: true, operatingRules: true, coverageRequirements: true },
    }),
    prisma.holiday.findMany(),
    prisma.leaveRequest.findMany({ where: { status: "APPROVED" } }),
    prisma.availability.findMany({ where: { available: false } }),
    prisma.weeklyOff.findMany(),
    prisma.operatingRule.findMany(),
  ]);

  const employeeData: ScheduleEmployee[] = employees.map((employee) => ({
    id: employee.id,
    fullName: employee.fullName,
    preferredOff: employee.preferredOff,
    weeklyOffWeekdays: [],
    weeklyOffs: [...employee.weeklyOffs, ...weeklyOffs.filter((off) => off.employeeId === employee.id)].map((off) => ({
      weekday: off.weekday,
      effectiveFrom: dateKey(off.effectiveFrom),
      effectiveTo: off.effectiveTo ? dateKey(off.effectiveTo) : undefined,
    })),
    unavailableDates: availabilities.filter((availability) => availability.employeeId === employee.id).map((availability) => dateKey(availability.date)),
    approvedLeaveDates: leaves.filter((leave) => leave.employeeId === employee.id && leave.leaveType !== "COMP_OFF").flatMap((leave) => expandDates(leave.startDate, leave.endDate)),
    approvedCompOffDates: leaves.filter((leave) => leave.employeeId === employee.id && leave.leaveType === "COMP_OFF").flatMap((leave) => expandDates(leave.startDate, leave.endDate)),
    processIds: employee.processAssignments.map((assignment) => assignment.processId),
    brandIds: employee.brandAssignments.map((assignment) => assignment.brandId),
  }));

  const processData: ScheduleProcess[] = processes
    .filter((process) => process.active)
    .map((process) => {
      const applicableRules = rules.filter((item) => item.processId === process.id || item.brandId === process.brandId);
      const monthStart = new Date(Date.UTC(input.year, input.month - 1, 1));
      const rule = applicableRules
        .filter((item) => item.effectiveFrom <= monthStart && (!item.effectiveTo || item.effectiveTo >= monthStart))
        .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime() || Number(b.processId === process.id) - Number(a.processId === process.id))[0];
      const operatingType = rule?.operatingType ?? "TYPE_A_365";
      const weeklyDays = rule?.weeklyDays?.length ? rule.weeklyDays : [0,1,2,3,4,5,6];
      const brandHolidayDates = holidays.filter((holiday) => !holiday.brandId || holiday.brandId === process.brandId).map((holiday) => dateKey(holiday.date));
      const processRules = applicableRules.map((item) => ({
        operatingType: item.operatingType,
        weeklyDays: item.weeklyDays,
        effectiveFrom: dateKey(item.effectiveFrom),
        effectiveTo: item.effectiveTo ? dateKey(item.effectiveTo) : undefined,
        priority: item.processId === process.id ? 1 : 0,
      }));
      return {
        id: process.id,
        name: process.name,
        brandId: process.brandId,
        brandCode: process.brand.brandCode,
        minimumStaffing: process.minimumStaffing,
        operatingType,
        weeklyDays,
        holidayDates: brandHolidayDates,
        operatingRules: processRules,
        coverageRequirements: process.coverageRequirements.map((requirement) => ({
          weekday: requirement.weekday,
          minimumStaff: requirement.minimumStaff,
          effectiveFrom: dateKey(requirement.effectiveFrom),
          effectiveTo: requirement.effectiveTo ? dateKey(requirement.effectiveTo) : undefined,
        })),
      };
    });

  const result = generateMonthlyRoster(input.year, input.month, employeeData, processData);

  const roster = await prisma.roster.upsert({
    where: { month_year_status: { month: input.month, year: input.year, status: "DRAFT" } },
    update: {},
    create: { month: input.month, year: input.year, status: "DRAFT" },
  });
  await prisma.rosterEntry.deleteMany({ where: { rosterId: roster.id } });
  await prisma.conflict.deleteMany({ where: { rosterId: roster.id } });
  await prisma.rosterEntry.createMany({
    data: result.assignments.map((assignment) => ({
      rosterId: roster.id,
      employeeId: assignment.employeeId,
      processId: assignment.processId,
      date: new Date(`${assignment.date}T00:00:00Z`),
      status: "WORKING",
      brandCode: assignment.brandCode,
    })),
  });
  await prisma.conflict.createMany({
    data: result.conflicts.map((conflict) => ({
      rosterId: roster.id,
      processId: conflict.processId,
      date: new Date(`${conflict.date}T00:00:00Z`),
      severity: "CRITICAL",
      status: "OPEN",
      conflictType: conflict.conflictType,
      description: conflict.description,
      reason: conflict.reason,
      suggestion: conflict.suggestion,
      brandCode: conflict.brandCode,
    })),
  });
  await prisma.rosterVersion.create({
    data: {
      rosterId: roster.id,
      version: await nextVersion(roster.id),
      snapshotJson: {
        requiredSlots: result.requiredSlots,
        filledSlots: result.filledSlots,
        valid: result.valid,
        assignments: JSON.parse(JSON.stringify(result.assignments)),
        conflicts: JSON.parse(JSON.stringify(result.conflicts)),
      },
    },
  });

  revalidatePath("/roster");
  revalidatePath("/conflicts");
  revalidatePath("/");
}

export async function publishRoster(formData: FormData) {
  await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER]);
  const month = z.coerce.number().int().parse(formData.get("month"));
  const year = z.coerce.number().int().parse(formData.get("year"));
  const roster = await prisma.roster.findUnique({ where: { month_year_status: { month, year, status: "DRAFT" } } });
  if (!roster) throw new Error("Generate and save a roster draft before publishing.");
  const criticalConflicts = await prisma.conflict.count({ where: { rosterId: roster.id, status: "OPEN", severity: "CRITICAL" } });
  if (criticalConflicts > 0) throw new Error(`Cannot publish this roster: resolve ${criticalConflicts} critical coverage conflict(s) first.`);
  await prisma.roster.update({ where: { id: roster.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  revalidatePath("/roster");
}

async function nextVersion(rosterId: string) {
  const latest = await prisma.rosterVersion.findFirst({ where: { rosterId }, orderBy: { version: "desc" } });
  return (latest?.version ?? 0) + 1;
}

function expandDates(start: Date, end: Date): string[] {
  const dates: string[] = [];
  for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    dates.push(dateKey(date));
  }
  return dates;
}
