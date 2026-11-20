import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function createBackupRecommendationsForEntry(
  rosterEntryId: string,
  actor: { id: string; fullName: string },
) {
  const entry = await prisma.rosterEntry.findUnique({
    where: { id: rosterEntryId },
    include: {
      employee: true,
      process: { include: { brand: true } },
      roster: true,
    },
  });
  if (!entry || entry.status !== "WORKING" || !entry.process) return 0;

  const date = new Date(Date.UTC(entry.date.getUTCFullYear(), entry.date.getUTCMonth(), entry.date.getUTCDate()));
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  const candidates = await prisma.employee.findMany({
    where: {
      id: { not: entry.employeeId },
      status: "ACTIVE",
      brandAssignments: { some: { brandId: entry.process.brandId } },
      processAssignments: { some: { processId: entry.processId! } },
    },
    include: {
      weeklyOffs: true,
      leaves: { where: { status: "APPROVED" } },
      availabilities: { where: { date } },
      rosterEntries: {
        where: { rosterId: entry.rosterId, date: { gte: monthStart, lt: nextMonthStart }, status: "WORKING" },
        select: { id: true, date: true },
      },
    },
  });

  const weekday = date.getUTCDay();
  const eligible = candidates
    .filter((candidate) => {
      const onWeeklyOff = candidate.weeklyOffs.some((off) =>
        off.weekday === weekday
        && off.effectiveFrom <= date
        && (!off.effectiveTo || off.effectiveTo >= date),
      );
      const onLeave = candidate.leaves.some((leave) => leave.startDate <= date && leave.endDate >= date);
      const unavailable = candidate.availabilities.some((availability) => !availability.available);
      const alreadyWorking = candidate.rosterEntries.some((rosterEntry) => rosterEntry.date.getTime() === date.getTime());
      return !onWeeklyOff && !onLeave && !unavailable && !alreadyWorking;
    })
    .sort((a, b) => a.rosterEntries.length - b.rosterEntries.length || a.fullName.localeCompare(b.fullName))
    .slice(0, 3);

  if (!eligible.length) {
    await prisma.auditEvent.create({
      data: {
        actorUserId: actor.id,
        actorName: actor.fullName,
        action: "BACKUP_RECOMMENDATION_NONE_ELIGIBLE",
        entityType: "RosterEntry",
        entityId: entry.id,
        details: { processId: entry.processId, date: date.toISOString().slice(0, 10) },
      },
    });
    return 0;
  }

  let created = 0;
  for (const candidate of eligible) {
    const reason = `Eligible for ${entry.process.name} at ${entry.process.brand.name}: active employee with explicit brand and process assignments, no weekly off, approved leave, comp-off, unavailable status, or other roster assignment on ${date.toISOString().slice(0, 10)}. Current monthly working-assignment workload: ${candidate.rosterEntries.length}.`;
    const existing = await prisma.backupRecommendation.findUnique({
      where: { rosterEntryId_replacementEmployeeId: { rosterEntryId: entry.id, replacementEmployeeId: candidate.id } },
    });
    if (existing?.status === "APPROVED" || existing?.status === "REJECTED") continue;
    if (existing) {
      await prisma.backupRecommendation.update({ where: { id: existing.id }, data: { reason } });
      continue;
    }

    const recommendation = await prisma.backupRecommendation.create({
      data: {
        rosterId: entry.rosterId,
        rosterEntryId: entry.id,
        unavailableEmployeeId: entry.employeeId,
        replacementEmployeeId: candidate.id,
        processId: entry.processId!,
        date,
        reason,
        createdByUserId: actor.id,
      },
    });
    await prisma.auditEvent.create({
      data: {
        actorUserId: actor.id,
        actorName: actor.fullName,
        action: "BACKUP_RECOMMENDATION_CREATED",
        entityType: "BackupRecommendation",
        entityId: recommendation.id,
        details: {
          rosterId: entry.rosterId,
          unavailableEmployeeId: entry.employeeId,
          replacementEmployeeId: candidate.id,
          processId: entry.processId,
          date: date.toISOString().slice(0, 10),
          reason,
        },
      },
    });
    created++;
  }
  return created;
}

export async function cancelPendingBackupRecommendations(
  employeeId: string,
  date: Date,
  actor: { id: string; fullName: string },
) {
  const recommendations = await prisma.backupRecommendation.findMany({
    where: {
      date,
      status: "PENDING",
      OR: [{ unavailableEmployeeId: employeeId }, { replacementEmployeeId: employeeId }],
    },
    select: { id: true, unavailableEmployeeId: true, replacementEmployeeId: true },
  });
  if (!recommendations.length) return;
  await prisma.$transaction(async (transaction) => {
    await transaction.backupRecommendation.updateMany({
      where: { id: { in: recommendations.map((item) => item.id) } },
      data: {
        status: "REJECTED",
        decidedByUserId: actor.id,
        decisionReason: "Availability changed before the recommendation was approved.",
        decidedAt: new Date(),
      },
    });
    await transaction.auditEvent.createMany({
      data: recommendations.map((item) => ({
        actorUserId: actor.id,
        actorName: actor.fullName,
        action: "BACKUP_RECOMMENDATION_CANCELLED",
        entityType: "BackupRecommendation",
        entityId: item.id,
        details: { employeeId, unavailableEmployeeId: item.unavailableEmployeeId, replacementEmployeeId: item.replacementEmployeeId },
      })),
    });
  });
}

export async function isEmployeeEligibleForEntry(
  employeeId: string,
  entry: { id: string; rosterId: string; employeeId: string; processId: string | null; date: Date },
  database: Pick<Prisma.TransactionClient, "employee" | "process"> = prisma,
) {
  if (!entry.processId || employeeId === entry.employeeId) return false;
  const date = new Date(Date.UTC(entry.date.getUTCFullYear(), entry.date.getUTCMonth(), entry.date.getUTCDate()));
  const weekday = date.getUTCDay();
  const employee = await database.employee.findUnique({
    where: { id: employeeId },
    include: {
      processAssignments: true,
      brandAssignments: true,
      weeklyOffs: true,
      leaves: { where: { status: "APPROVED" } },
      availabilities: { where: { date } },
      rosterEntries: { where: { rosterId: entry.rosterId, date, status: "WORKING" }, select: { id: true } },
    },
  });
  if (!employee || employee.status !== "ACTIVE") return false;
  const process = await database.process.findUnique({ where: { id: entry.processId }, select: { brandId: true } });
  if (!process) return false;
  return employee.processAssignments.some((item) => item.processId === entry.processId)
    && employee.brandAssignments.some((item) => item.brandId === process.brandId)
    && !employee.weeklyOffs.some((off) =>
      off.weekday === weekday && off.effectiveFrom <= date && (!off.effectiveTo || off.effectiveTo >= date),
    )
    && !employee.leaves.some((leave) => leave.startDate <= date && leave.endDate >= date)
    && !employee.availabilities.some((availability) => !availability.available)
    && employee.rosterEntries.length === 0;
}
