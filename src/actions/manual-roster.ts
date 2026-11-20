"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { dateKey, processOperates, type ScheduleProcess } from "@/lib/scheduling-engine";
import { UserRole } from "@prisma/client";
import { canAccessPod, isManager, requireRoles } from "@/lib/auth";

export async function manuallyAssignEmployee(formData: FormData) {
  const actor = await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER, UserRole.POD_LEAD]);
  const input = z.object({
    rosterId: z.string().min(1),
    employeeId: z.string().min(1),
    processId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(Object.fromEntries(formData));
  const date = new Date(`${input.date}T00:00:00Z`);
  const [roster, employee, process] = await Promise.all([
    prisma.roster.findUnique({ where: { id: input.rosterId }, select: { id: true, status: true } }),
    prisma.employee.findUnique({
      where: { id: input.employeeId },
      include: {
        processAssignments: true,
        brandAssignments: true,
        weeklyOffs: true,
        leaves: { where: { status: "APPROVED" } },
        availabilities: true,
      },
    }),
    prisma.process.findUnique({
      where: { id: input.processId },
      include: { brand: { include: { operatingRules: true } }, operatingRules: true },
    }),
  ]);
  if (!roster || roster.status !== "DRAFT") throw new Error("Manual assignments can only update an existing draft roster.");
  if (!employee || !process) throw new Error("Employee or process no longer exists.");
  if (!isManager(actor.role)) {
    const processPodId = process.podId ?? process.brand.podId;
    if (!canAccessPod(actor, processPodId) || employee.podId !== actor.employee?.podId) {
      throw new Error("You can only manage assignments within your own pod.");
    }
  }

  const weekday = date.getUTCDay();
  const reasons: string[] = [];
  if (employee.status !== "ACTIVE") reasons.push("Employee is inactive.");
  if (!employee.processAssignments.some((assignment) => assignment.processId === process.id)) reasons.push("Employee is not assigned to this process.");
  if (!employee.brandAssignments.some((assignment) => assignment.brandId === process.brandId)) reasons.push("Employee is not assigned to this brand.");
  if (employee.weeklyOffs.some((off) =>
    off.weekday === weekday && off.effectiveFrom <= date && (!off.effectiveTo || off.effectiveTo >= date),
  )) reasons.push("The date is a weekly off.");
  if (employee.availabilities.some((availability) => availability.date.toISOString().slice(0, 10) === input.date && !availability.available)) reasons.push("Employee marked unavailable.");
  if (employee.leaves.some((leave) => leave.startDate <= date && leave.endDate >= date)) reasons.push("Employee has approved leave or a comp-off.");
  const availability = employee.availabilities.find((item) => item.date.toISOString().slice(0, 10) === input.date);
  if (availability?.available === false) reasons.push("Employee is marked unavailable.");
  if (availability?.available === true) {
    const position = reasons.indexOf("Employee is marked unavailable.");
    if (position >= 0) reasons.splice(position, 1);
  }
  const holidays = await prisma.holiday.findMany({ where: { OR: [{ brandId: null }, { brandId: process.brandId }], date } });
  const opRules = [...process.brand.operatingRules.map((rule) => ({ ...rule, priority: 0 })), ...process.operatingRules.map((rule) => ({ ...rule, priority: 1 }))];
  const activeRule = opRules
    .filter((rule) => rule.effectiveFrom <= date && (!rule.effectiveTo || rule.effectiveTo >= date))
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime() || b.priority - a.priority)[0];
  const scheduleProcess: ScheduleProcess = {
    id: process.id,
    name: process.name,
    brandId: process.brandId,
    brandCode: process.brand.brandCode,
    minimumStaffing: process.minimumStaffing,
    operatingType: activeRule?.operatingType ?? "TYPE_A_365",
    weeklyDays: activeRule?.weeklyDays ?? [0, 1, 2, 3, 4, 5, 6],
    holidayDates: holidays.map((holiday) => dateKey(holiday.date)),
  };
  if (!processOperates(scheduleProcess, date)) reasons.push("The process is closed under its operating calendar on this date.");
  const overlappingEntry = await prisma.rosterEntry.findFirst({
    where: { rosterId: input.rosterId, employeeId: employee.id, date, status: "WORKING", processId: { not: process.id } },
  });
  if (overlappingEntry) reasons.push("Employee already has another process assignment that day.");

  if (reasons.length) {
    await prisma.conflict.create({
      data: {
        rosterId: input.rosterId,
        employeeId: employee.id,
        processId: process.id,
        date,
        severity: "CRITICAL",
        status: "OPEN",
        conflictType: "INVALID_MANUAL_ASSIGNMENT",
        description: "Manual roster assignment violates a hard constraint.",
        reason: reasons.join(" "),
        suggestion: "Cancel the assignment or choose an eligible employee.",
        brandCode: process.brand.brandCode,
      },
    });
  } else {
    const duplicate = await prisma.rosterEntry.findFirst({
      where: { rosterId: input.rosterId, employeeId: employee.id, date, processId: process.id },
    });
    if (duplicate) throw new Error("This employee is already assigned to the process on this date.");
    await prisma.rosterEntry.create({
      data: {
        rosterId: input.rosterId,
        employeeId: employee.id,
        processId: process.id,
        date,
        status: "WORKING",
        brandCode: process.brand.brandCode,
      },
    });
  }

  const latest = await prisma.rosterVersion.findFirst({ where: { rosterId: input.rosterId }, orderBy: { version: "desc" } });
  await prisma.rosterVersion.create({
    data: {
      rosterId: input.rosterId,
      version: (latest?.version ?? 0) + 1,
      snapshotJson: { action: "manual_assignment", employeeId: employee.id, processId: process.id, date: input.date, rejected: reasons.length > 0 },
      createdBy: actor.id,
    },
  });
  await prisma.auditEvent.create({
    data: {
      actorUserId: actor.id,
      actorName: actor.fullName,
      action: reasons.length ? "ROSTER_ASSIGNMENT_REJECTED" : "ROSTER_ASSIGNMENT_CREATED",
      entityType: "RosterEntry",
      entityId: `${input.rosterId}:${employee.id}:${input.processId}:${input.date}`,
      details: { employeeId: employee.id, processId: process.id, date: input.date, reasons },
    },
  });
  revalidatePath("/roster");
  revalidatePath("/conflicts");
}
