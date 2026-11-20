"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canAccessPod, isManager, requireRoles } from "@/lib/auth";
import { createBackupRecommendationsForEntry, isEmployeeEligibleForEntry } from "@/lib/backup-recommendations";

export async function recommendBackupsForConflict(formData: FormData) {
  const actor = await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER, UserRole.POD_LEAD]);
  const conflictId = z.string().min(1).parse(formData.get("conflictId"));
  const conflict = await prisma.conflict.findUnique({
    where: { id: conflictId },
    include: {
      employee: { select: { id: true, podId: true } },
      process: { include: { brand: { select: { podId: true } } } },
    },
  });
  if (!conflict || conflict.status !== "OPEN") throw new Error("This open conflict no longer exists.");
  if (!["APPROVED_LEAVE_VIOLATION", "APPROVED_COMP_OFF_VIOLATION", "AVAILABILITY_CONFLICT"].includes(conflict.conflictType)) {
    throw new Error("Backup recommendations are only available for employee unavailability conflicts.");
  }
  const { rosterId, employeeId, processId } = z.object({
    rosterId: z.string().min(1),
    employeeId: z.string().min(1),
    processId: z.string().min(1),
  }).parse({ rosterId: conflict.rosterId, employeeId: conflict.employeeId, processId: conflict.processId });
  const podId = conflict.process?.podId ?? conflict.process?.brand.podId ?? conflict.employee?.podId ?? null;
  if (!isManager(actor.role) && !canAccessPod(actor, podId)) throw new Error("You can only request backups for your own pod.");
  const entry = await prisma.rosterEntry.findFirst({
    where: {
      rosterId,
      employeeId,
      processId,
      date: conflict.date,
      status: "WORKING",
    },
    select: { id: true },
  });
  if (!entry) throw new Error("No active roster assignment remains for this conflict.");
  await createBackupRecommendationsForEntry(entry.id, actor);
  revalidatePath("/conflicts");
}

export async function decideBackupRecommendation(formData: FormData) {
  const actor = await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER, UserRole.POD_LEAD]);
  const input = z.object({
    recommendationId: z.string().min(1),
    decision: z.enum(["APPROVED", "REJECTED"]),
    decisionReason: z.string().trim().max(500).optional(),
  }).parse({
    recommendationId: formData.get("recommendationId"),
    decision: formData.get("decision"),
    decisionReason: formData.get("decisionReason") || undefined,
  });
  const recommendation = await prisma.backupRecommendation.findUnique({
    where: { id: input.recommendationId },
    include: {
      rosterEntry: true,
      unavailableEmployee: { select: { id: true, fullName: true, podId: true } },
      replacementEmployee: { select: { id: true, fullName: true, podId: true } },
      process: { include: { brand: { select: { name: true, podId: true } } } },
    },
  });
  if (!recommendation) throw new Error("Backup recommendation no longer exists.");
  if (!isManager(actor.role) && !canAccessPod(actor, recommendation.process.podId ?? recommendation.process.brand.podId)) {
    throw new Error("You can only decide backup changes for your own pod.");
  }
  if (recommendation.status !== "PENDING") throw new Error("This recommendation has already been decided.");

  if (input.decision === "REJECTED") {
    await prisma.$transaction([
      prisma.backupRecommendation.update({
        where: { id: recommendation.id },
        data: { status: "REJECTED", decidedByUserId: actor.id, decisionReason: input.decisionReason ?? null, decidedAt: new Date() },
      }),
      prisma.auditEvent.create({
        data: {
          actorUserId: actor.id,
          actorName: actor.fullName,
          action: "BACKUP_RECOMMENDATION_REJECTED",
          entityType: "BackupRecommendation",
          entityId: recommendation.id,
          details: {
            replacementEmployeeId: recommendation.replacementEmployeeId,
            processId: recommendation.processId,
            date: recommendation.date.toISOString().slice(0, 10),
            reason: input.decisionReason ?? "No reason provided.",
          },
        },
      }),
    ]);
  } else {
    await approveBackup(recommendation.id, actor.id, actor.fullName, input.decisionReason);
  }

  revalidatePath("/conflicts");
  revalidatePath("/coverage");
  revalidatePath("/roster");
  revalidatePath("/");
}

async function approveBackup(recommendationId: string, actorId: string, actorName: string, decisionReason?: string) {
  await prisma.$transaction(async (transaction) => {
    const recommendation = await transaction.backupRecommendation.findUnique({
      where: { id: recommendationId },
      include: { rosterEntry: true, process: true, unavailableEmployee: true, replacementEmployee: true },
    });
    if (!recommendation || recommendation.status !== "PENDING") throw new Error("This recommendation has already been decided.");
    if (recommendation.rosterEntry.status !== "WORKING" || recommendation.rosterEntry.processId !== recommendation.processId) {
      throw new Error("The affected roster assignment has changed; regenerate recommendations before approving.");
    }

    const date = new Date(Date.UTC(
      recommendation.date.getUTCFullYear(),
      recommendation.date.getUTCMonth(),
      recommendation.date.getUTCDate(),
    ));
    const [approvedLeave, unavailable] = await Promise.all([
      transaction.leaveRequest.findFirst({
        where: {
          employeeId: recommendation.unavailableEmployeeId,
          status: "APPROVED",
          startDate: { lte: date },
          endDate: { gte: date },
        },
        select: { id: true },
      }),
      transaction.availability.findFirst({
        where: { employeeId: recommendation.unavailableEmployeeId, date, available: false },
        select: { id: true },
      }),
    ]);
    if (!approvedLeave && !unavailable) throw new Error("The original employee is no longer unavailable on this date.");
    if (!recommendation.process.active) throw new Error("This process is inactive.");
    if (!await isEmployeeEligibleForEntry(recommendation.replacementEmployeeId, recommendation.rosterEntry, transaction)) {
      throw new Error("The recommended employee is no longer eligible or available; reject this recommendation and review alternatives.");
    }

    const weekday = date.getUTCDay();
    const requirement = await transaction.coverageRequirement.findFirst({
      where: {
        processId: recommendation.processId,
        weekday,
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
      },
      orderBy: { effectiveFrom: "desc" },
      select: { minimumStaff: true },
    });
    const minimumStaff = requirement?.minimumStaff ?? recommendation.process.minimumStaffing;

    const originalAssignment = await transaction.rosterEntry.updateMany({
      where: { id: recommendation.rosterEntryId, status: "WORKING" },
      data: {
        status: "UNASSIGNED",
        notes: `Unavailable employee replaced by ${recommendation.replacementEmployee.fullName} after manager approval.`,
      },
    });
    if (originalAssignment.count !== 1) throw new Error("The affected roster assignment has already changed.");
    const replacementEntry = await transaction.rosterEntry.create({
      data: {
        rosterId: recommendation.rosterId,
        employeeId: recommendation.replacementEmployeeId,
        processId: recommendation.processId,
        date,
        status: "WORKING",
        brandCode: recommendation.rosterEntry.brandCode,
        notes: `Approved backup for ${recommendation.unavailableEmployee.fullName}.`,
      },
    });
    await transaction.backupRecommendation.update({
      where: { id: recommendation.id },
      data: { status: "APPROVED", decidedByUserId: actorId, decisionReason: decisionReason ?? null, decidedAt: new Date() },
    });

    await transaction.conflict.updateMany({
      where: {
        rosterId: recommendation.rosterId,
        employeeId: recommendation.unavailableEmployeeId,
        processId: recommendation.processId,
        date,
        status: "OPEN",
        conflictType: { in: ["APPROVED_LEAVE_VIOLATION", "APPROVED_COMP_OFF_VIOLATION", "AVAILABILITY_CONFLICT"] },
      },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
    const assigned = await transaction.rosterEntry.count({
      where: { rosterId: recommendation.rosterId, processId: recommendation.processId, date, status: "WORKING" },
    });
    const coverageConflicts = await transaction.conflict.findMany({
      where: {
        rosterId: recommendation.rosterId,
        processId: recommendation.processId,
        date,
        status: "OPEN",
        conflictType: { in: ["INSUFFICIENT_PROCESS_STAFFING", "NO_AVAILABLE_EMPLOYEE"] },
      },
      select: { id: true },
    });
    if (assigned >= minimumStaff) {
      if (coverageConflicts.length) {
        await transaction.conflict.updateMany({
          where: { id: { in: coverageConflicts.map((conflict) => conflict.id) } },
          data: { status: "RESOLVED", resolvedAt: new Date() },
        });
      }
    } else if (!coverageConflicts.length) {
      await transaction.conflict.create({
        data: {
          rosterId: recommendation.rosterId,
          processId: recommendation.processId,
          date,
          severity: "CRITICAL",
          status: "OPEN",
          conflictType: "INSUFFICIENT_PROCESS_STAFFING",
          description: `Approved backup leaves this process below its minimum staffing requirement (${assigned}/${minimumStaff}).`,
          reason: "The approved replacement did not satisfy the full process coverage requirement.",
          suggestion: "Review other eligible recommendations or adjust staffing before publishing.",
          brandCode: recommendation.rosterEntry.brandCode,
        },
      });
    }

    const latestVersion = await transaction.rosterVersion.findFirst({
      where: { rosterId: recommendation.rosterId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    await transaction.rosterVersion.create({
      data: {
        rosterId: recommendation.rosterId,
        version: (latestVersion?.version ?? 0) + 1,
        createdBy: actorId,
        snapshotJson: {
          action: "approved_backup",
          recommendationId: recommendation.id,
          replacedEntryId: recommendation.rosterEntryId,
          replacementEntryId: replacementEntry.id,
          replacementEmployeeId: recommendation.replacementEmployeeId,
          processId: recommendation.processId,
          date: date.toISOString().slice(0, 10),
          assigned,
          minimumStaff,
        },
      },
    });
    await transaction.auditEvent.create({
      data: {
        actorUserId: actorId,
        actorName,
        action: "BACKUP_RECOMMENDATION_APPROVED",
        entityType: "BackupRecommendation",
        entityId: recommendation.id,
        details: {
          unavailableEmployeeId: recommendation.unavailableEmployeeId,
          replacementEmployeeId: recommendation.replacementEmployeeId,
          replacementEntryId: replacementEntry.id,
          processId: recommendation.processId,
          date: date.toISOString().slice(0, 10),
          assigned,
          minimumStaff,
          decisionReason: decisionReason ?? null,
        },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
