import { prisma } from "@/lib/prisma";
import { connection } from "next/server";
import { UserRole } from "@prisma/client";
import { requireRoles } from "@/lib/auth";
import { canAccessPod, isManager } from "@/lib/auth";
import { decideBackupRecommendation, recommendBackupsForConflict } from "@/actions/backups";

export default async function Page() {
  await connection();
  const actor = await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER, UserRole.POD_LEAD]);
  const podId = actor.role === UserRole.POD_LEAD ? actor.employee?.podId ?? "__unassigned_pod_lead__" : null;
  const recommendationScope = podId ? {
    OR: [
      { process: { podId } },
      { process: { brand: { podId } } },
    ],
  } : {};
  const [conflicts, recommendations, scopedRecommendationIds] = await Promise.all([
    prisma.conflict.findMany({
      where: podId ? {
        OR: [
          { employee: { podId } },
          { process: { podId } },
          { process: { brand: { podId } } },
        ],
      } : {},
      include: { employee: true, process: { include: { brand: true } }, roster: true },
      orderBy: [{ severity: "desc" }, { date: "asc" }],
    }),
    prisma.backupRecommendation.findMany({
      where: { status: "PENDING", ...recommendationScope },
      include: {
        unavailableEmployee: true,
        replacementEmployee: true,
        process: { include: { brand: true } },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    prisma.backupRecommendation.findMany({
      where: recommendationScope,
      select: { id: true },
    }),
  ]);
  const auditHistory = scopedRecommendationIds.length
    ? await prisma.auditEvent.findMany({
        where: { entityType: "BackupRecommendation", entityId: { in: scopedRecommendationIds.map((item) => item.id) } },
        orderBy: { createdAt: "desc" },
        take: 30,
      })
    : [];
  return (
    <div className="p-4 md:p-6">
      <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold text-[#172033]">Conflicts</h2><p className="mt-0.5 text-xs text-[#697586]">{conflicts.filter((conflict)=>conflict.status==="OPEN").length} open conflicts</p></div><a href="/api/exports/conflicts" className="h-9 rounded-md border border-[#E5E9F0] bg-white px-3 pt-2 text-xs font-medium text-[#697586]">Export report</a></div>
      <section className="mb-5 border border-[#E5E9F0] bg-white">
        <div className="border-b border-[#E5E9F0] px-4 py-3"><h3 className="text-sm font-semibold text-[#172033]">Backup recommendations</h3><p className="mt-1 text-xs text-[#697586]">Recommendations never alter a roster until a manager approves one.</p></div>
        <div className="divide-y divide-[#EEF1F5]">
          {recommendations.map((recommendation)=><div key={recommendation.id} className="grid gap-3 p-4 xl:grid-cols-[1fr_1.2fr_1.4fr]">
            <div className="text-xs"><div className="font-semibold text-[#172033]">{recommendation.process.brand.name} · {recommendation.process.name}</div><div className="mt-1 text-[#697586]">{recommendation.date.toISOString().slice(0,10)} · {recommendation.unavailableEmployee.fullName} unavailable</div><div className="mt-1 text-[#697586]">Suggested: {recommendation.replacementEmployee.fullName}</div></div>
            <p className="text-[11px] leading-5 text-[#475467]">{recommendation.reason}</p>
            {isManager(actor.role) || canAccessPod(actor, recommendation.process.podId ?? recommendation.process.brand.podId)
              ? <div className="flex flex-col gap-2">
                  <input form={`decision-${recommendation.id}`} name="decisionReason" maxLength={500} placeholder="Decision note (optional)" className="h-8 rounded-md border border-[#E5E9F0] px-2 text-xs"/>
                  <div className="flex gap-2">
                    <form id={`decision-${recommendation.id}`} action={decideBackupRecommendation}><input type="hidden" name="recommendationId" value={recommendation.id}/><input type="hidden" name="decision" value="APPROVED"/><button className="rounded-md bg-[#26755A] px-3 py-2 text-[11px] font-semibold text-white">Approve replacement</button></form>
                    <form action={decideBackupRecommendation}><input type="hidden" name="recommendationId" value={recommendation.id}/><input type="hidden" name="decision" value="REJECTED"/><button className="rounded-md border border-[#E5E9F0] px-3 py-2 text-[11px] font-medium text-[#B42318]">Reject</button></form>
                  </div>
                </div>
              : <span className="text-xs text-[#697586]">Pod lead approval required</span>}
          </div>)}
          {recommendations.length===0&&<p className="p-4 text-xs text-[#697586]">No pending backup recommendations.</p>}
        </div>
      </section>
      <div className="overflow-hidden border border-[#E5E9F0] bg-white"><table className="w-full text-left"><thead className="h-10 border-b border-[#E5E9F0] bg-[#FAFBFC] text-[10px] uppercase text-[#697586]"><tr><th className="px-4">Severity</th><th>Type</th><th>Brand / Process</th><th>Date</th><th>Employee</th><th className="px-4">Resolution</th></tr></thead><tbody className="divide-y divide-[#EEF1F5]">{conflicts.map((conflict)=><tr key={conflict.id} className="align-top text-xs"><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${conflict.severity==="CRITICAL"?"bg-[#FDE8E8] text-[#B42318]":"bg-[#FFF3D6] text-[#9A6700]"}`}>{conflict.severity}</span></td><td className="py-3 font-medium text-[#172033]">{conflict.conflictType.replaceAll("_"," ")}</td><td className="py-3"><div>{conflict.brandCode ?? "—"}</div><div className="mt-0.5 text-[10px] text-[#697586]">{conflict.process?.name ?? "No process"}</div></td><td className="py-3 text-[#697586]">{conflict.date.toISOString().slice(0,10)}</td><td className="py-3">{conflict.employee?.fullName ?? "Unassigned"}</td><td className="max-w-[260px] px-4 py-3 text-[11px] text-[#697586]"><p>{conflict.suggestion}</p>{conflict.status==="OPEN"&&conflict.employeeId&&conflict.processId&&["APPROVED_LEAVE_VIOLATION","APPROVED_COMP_OFF_VIOLATION","AVAILABILITY_CONFLICT"].includes(conflict.conflictType)&&(isManager(actor.role)||canAccessPod(actor,conflict.process?.podId??conflict.process?.brand.podId??conflict.employee?.podId??null))&&<form action={recommendBackupsForConflict} className="mt-2"><input type="hidden" name="conflictId" value={conflict.id}/><button className="font-semibold text-[#315EAA] underline">Find backup candidates</button></form>}</td></tr>)}</tbody></table>{conflicts.length===0&&<div className="py-16 text-center text-xs text-[#697586]">No conflicts detected.</div>}</div>
      <section className="mt-5 border border-[#E5E9F0] bg-white">
        <h3 className="border-b border-[#E5E9F0] px-4 py-3 text-sm font-semibold text-[#172033]">Backup decision audit history</h3>
        <div className="divide-y divide-[#EEF1F5]">{auditHistory.map((event)=><div key={event.id} className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-3 text-xs"><span className="font-medium text-[#172033]">{event.actorName}</span><span className="text-[#697586]">{event.action.replaceAll("_"," ")}</span><time className="ml-auto text-[#697586]">{event.createdAt.toISOString().replace("T"," ").slice(0,16)} UTC</time></div>)}{auditHistory.length===0&&<p className="p-4 text-xs text-[#697586]">No backup decisions recorded.</p>}</div>
      </section>
    </div>
  );
}
