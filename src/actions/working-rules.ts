"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertEmployeeAccess, assertPodManager, requireRoles, requireUser } from "@/lib/auth";
import { cancelPendingBackupRecommendations, createBackupRecommendationsForEntry } from "@/lib/backup-recommendations";

const id = z.string().min(1);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function applyLeave(formData: FormData) {
  const actor = await requireUser();
  const input = z.object({
    employeeId: id,
    leaveType: z.enum(["PLANNED", "SICK", "COMP_OFF", "UNAVAILABILITY"]),
    startDate: dateSchema,
    endDate: dateSchema,
    reason: z.string().trim().min(3),
  }).parse(Object.fromEntries(formData));

  if (input.endDate < input.startDate) throw new Error("Leave end date cannot be before the start date.");
  await assertEmployeeAccess(actor, input.employeeId);
  const leave = await prisma.leaveRequest.create({
    data: {
      employeeId: input.employeeId,
      leaveType: input.leaveType,
      startDate: new Date(`${input.startDate}T00:00:00Z`),
      endDate: new Date(`${input.endDate}T00:00:00Z`),
      reason: input.reason,
      status: "PENDING",
    },
  });
  await prisma.auditEvent.create({
    data: {
      actorUserId: actor.id,
      actorName: actor.fullName,
      action: "LEAVE_REQUEST_CREATED",
      entityType: "LeaveRequest",
      entityId: leave.id,
      details: { employeeId: leave.employeeId, leaveType: leave.leaveType, startDate: input.startDate, endDate: input.endDate },
    },
  });
  revalidatePath("/leaves");
}

export async function decideLeave(formData: FormData) {
  const actor = await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER, UserRole.POD_LEAD]);
  const leaveId = id.parse(formData.get("leaveId"));
  const status = z.enum(["APPROVED", "REJECTED"]).parse(formData.get("status"));
  const existingLeave = await prisma.leaveRequest.findUnique({
    where: { id: leaveId },
    include: { employee: { select: { id: true, podId: true } } },
  });
  if (!existingLeave) throw new Error("Leave request no longer exists.");
  if (existingLeave.status !== "PENDING") throw new Error("This leave request has already been decided.");
  await assertPodManager(actor, existingLeave.employee.podId);
  const leave = await prisma.leaveRequest.update({
    where: { id: leaveId },
    data: { status, approvedBy: actor.fullName },
  });

  if (status === "APPROVED") {
    const affectedEntries = await prisma.rosterEntry.findMany({
      where: {
        employeeId: leave.employeeId,
        date: { gte: leave.startDate, lte: leave.endDate },
        status: "WORKING",
      },
      include: { roster: true, process: true },
    });
    for (const entry of affectedEntries) {
      const conflictType = leave.leaveType === "COMP_OFF" ? "APPROVED_COMP_OFF_VIOLATION" : "APPROVED_LEAVE_VIOLATION";
      const existingConflict = await prisma.conflict.findFirst({
        where: { rosterId: entry.rosterId, employeeId: leave.employeeId, processId: entry.processId, date: entry.date, conflictType, status: "OPEN" },
        select: { id: true },
      });
      if (!existingConflict) {
        await prisma.conflict.create({
          data: {
            rosterId: entry.rosterId,
            employeeId: leave.employeeId,
            processId: entry.processId,
            date: entry.date,
            severity: "CRITICAL",
            status: "OPEN",
            conflictType,
            description: "Employee is assigned while approved unavailability is in effect.",
            reason: `${leave.leaveType} was approved for this date.`,
            suggestion: "Review the eligible backup recommendations and approve a replacement.",
            brandCode: entry.brandCode,
          },
        });
      }
      await createBackupRecommendationsForEntry(entry.id, actor);
    }
  }
  await prisma.auditEvent.create({
    data: {
      actorUserId: actor.id,
      actorName: actor.fullName,
      action: `LEAVE_${status}`,
      entityType: "LeaveRequest",
      entityId: leave.id,
      details: { employeeId: leave.employeeId, leaveType: leave.leaveType, startDate: leave.startDate.toISOString(), endDate: leave.endDate.toISOString() },
    },
  });
  revalidatePath("/leaves");
  revalidatePath("/conflicts");
  revalidatePath("/roster");
}

export async function setAvailability(formData: FormData) {
  const actor = await requireUser();
  if (actor.role === UserRole.EMPLOYEE) throw new Error("Employees cannot change roster availability directly.");
  const employeeId = id.parse(formData.get("employeeId"));
  const date = dateSchema.parse(formData.get("date"));
  const available = z.enum(["true", "false"]).parse(formData.get("available")) === "true";
  const reason = formData.get("reason")?.toString().trim() || null;
  await assertEmployeeAccess(actor, employeeId);
  const availability = await prisma.availability.upsert({
    where: { employeeId_date: { employeeId, date: new Date(`${date}T00:00:00Z`) } },
    update: { available, reason },
    create: { employeeId, date: new Date(`${date}T00:00:00Z`), available, reason },
  });
  if (!available) {
    const assigned = await prisma.rosterEntry.findMany({
      where: { employeeId, date: new Date(`${date}T00:00:00Z`), status: "WORKING" },
      include: { process: true },
    });
    for (const entry of assigned) {
      const existingConflict = await prisma.conflict.findFirst({
        where: { rosterId: entry.rosterId, employeeId, processId: entry.processId, date: entry.date, conflictType: "AVAILABILITY_CONFLICT", status: "OPEN" },
        select: { id: true },
      });
      if (!existingConflict) {
        await prisma.conflict.create({
          data: {
            rosterId: entry.rosterId,
            employeeId,
            processId: entry.processId,
            date: entry.date,
            severity: "CRITICAL",
            status: "OPEN",
            conflictType: "AVAILABILITY_CONFLICT",
            description: "Employee is rostered on a date they are marked unavailable.",
            reason: reason ?? "A date-specific availability change was recorded.",
            suggestion: "Review the eligible backup recommendations and approve a replacement.",
            brandCode: entry.brandCode,
          },
        });
      }
      await createBackupRecommendationsForEntry(entry.id, actor);
    }
  } else {
    const targetDate = new Date(`${date}T00:00:00Z`);
    await prisma.conflict.updateMany({
      where: { employeeId, date: targetDate, conflictType: "AVAILABILITY_CONFLICT", status: "OPEN" },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
    await cancelPendingBackupRecommendations(employeeId, targetDate, actor);
  }
  await prisma.auditEvent.create({
    data: {
      actorUserId: actor.id,
      actorName: actor.fullName,
      action: "EMPLOYEE_AVAILABILITY_CHANGED",
      entityType: "Availability",
      entityId: availability.id,
      details: { employeeId, date, available, reason },
    },
  });
  revalidatePath("/leaves");
  revalidatePath("/conflicts");
}

export async function createHoliday(formData: FormData) {
  const actor = await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER]);
  const input = z.object({
    name: z.string().trim().min(2),
    date: dateSchema,
    brandId: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  const holiday = await prisma.holiday.create({
    data: { name: input.name, date: new Date(`${input.date}T00:00:00Z`), brandId: input.brandId || null },
  });
  await prisma.auditEvent.create({
    data: { actorUserId: actor.id, actorName: actor.fullName, action: "HOLIDAY_CREATED", entityType: "Holiday", entityId: holiday.id, details: { name: holiday.name, date: input.date } },
  });
  revalidatePath("/settings");
}

export async function createOperatingRule(formData: FormData) {
  const actor = await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER]);
  const input = z.object({
    processId: id,
    operatingType: z.enum(["TYPE_A_365", "TYPE_B_DAILY_NO_HOLIDAY", "TYPE_C_WEEKDAY_WEEKEND"]),
    weeklyDays: z.string(),
    effectiveFrom: dateSchema,
  }).parse(Object.fromEntries(formData));
  const weeklyDays = input.weeklyDays.split(",").map(Number).filter((day) => day >= 0 && day <= 6);
  const rule = await prisma.operatingRule.create({
    data: {
      processId: input.processId,
      operatingType: input.operatingType,
      weeklyDays,
      effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00Z`),
    },
  });
  await prisma.auditEvent.create({
    data: { actorUserId: actor.id, actorName: actor.fullName, action: "OPERATING_RULE_CREATED", entityType: "OperatingRule", entityId: rule.id, details: { processId: input.processId, operatingType: input.operatingType, weeklyDays } },
  });
  revalidatePath("/settings");
}

export async function setWeeklyOff(formData: FormData) {
  const actor = await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER, UserRole.POD_LEAD]);
  const input = z.object({
    employeeId: id,
    weekday: z.coerce.number().int().min(0).max(6),
  }).parse(Object.fromEntries(formData));
  const employee = await prisma.employee.findUnique({ where: { id: input.employeeId }, select: { id: true, podId: true } });
  if (!employee) throw new Error("Employee no longer exists.");
  await assertPodManager(actor, employee.podId);
  await prisma.$transaction([
    prisma.weeklyOff.deleteMany({ where: { employeeId: input.employeeId } }),
    prisma.weeklyOff.create({
      data: { employeeId: input.employeeId, weekday: input.weekday, effectiveFrom: new Date("2026-01-01T00:00:00Z") },
    }),
    prisma.employee.update({ where: { id: input.employeeId }, data: { preferredOff: input.weekday } }),
  ]);
  revalidatePath("/leaves");
  revalidatePath("/settings");
}
