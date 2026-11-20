import { prisma } from "@/lib/prisma";
import { connection } from "next/server";
import { applyLeave, decideLeave, setAvailability } from "@/actions/working-rules";
import { CalendarOff, Clock3 } from "lucide-react";
import { UserRole } from "@prisma/client";
import { canAccessPod, isManager, requireUser } from "@/lib/auth";

export default async function Page() {
  await connection();
  const actor = await requireUser();
  const employeeFilter = actor.role === UserRole.EMPLOYEE
    ? { id: actor.employeeId ?? "__unlinked_employee__" }
    : actor.role === UserRole.POD_LEAD
      ? { podId: actor.employee?.podId ?? "__unassigned_pod_lead__" }
      : {};
  const leaveFilter = actor.role === UserRole.EMPLOYEE
    ? { employeeId: actor.employeeId ?? "__unlinked_employee__" }
    : actor.role === UserRole.POD_LEAD
      ? { employee: { podId: actor.employee?.podId ?? "__unassigned_pod_lead__" } }
      : {};
  const [employees, leaves] = await Promise.all([
    prisma.employee.findMany({ where: { status: "ACTIVE", ...employeeFilter }, orderBy: { fullName: "asc" } }),
    prisma.leaveRequest.findMany({ where: leaveFilter, include: { employee: true }, orderBy: [{ status: "asc" }, { startDate: "desc" }] }),
  ]);
  const canDecide = isManager(actor.role) || actor.role === UserRole.POD_LEAD;
  return (
    <div className="p-4 md:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div><h2 className="text-lg font-semibold text-[#172033]">Leave Management</h2><p className="mt-0.5 text-xs text-[#697586]">{leaves.filter((l) => l.status === "PENDING").length} requests pending approval</p></div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="border border-[#E5E9F0] bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#172033]">Apply for leave</h3>
            <form action={applyLeave} className="space-y-2">
              {actor.role===UserRole.EMPLOYEE?<input type="hidden" name="employeeId" value={actor.employeeId??""}/>:<select name="employeeId" required className="h-9 w-full rounded-md border border-[#E5E9F0] px-3 text-xs">{employees.map((employee)=><option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select>}
              <select name="leaveType" className="h-9 w-full rounded-md border border-[#E5E9F0] px-3 text-xs"><option value="PLANNED">Planned leave</option><option value="SICK">Sick leave</option><option value="COMP_OFF">Comp-off</option><option value="UNAVAILABILITY">Unavailability</option></select>
              <div className="grid grid-cols-2 gap-2"><input name="startDate" type="date" required className="h-9 rounded-md border border-[#E5E9F0] px-2 text-xs"/><input name="endDate" type="date" required className="h-9 rounded-md border border-[#E5E9F0] px-2 text-xs"/></div>
              <textarea name="reason" required minLength={3} placeholder="Reason" className="h-20 w-full resize-none rounded-md border border-[#E5E9F0] p-3 text-xs"/>
              <button className="h-9 w-full rounded-md bg-[#315EAA] text-xs font-semibold text-white">Submit request</button>
            </form>
          </section>
          {actor.role!==UserRole.EMPLOYEE&&<section className="border border-[#E5E9F0] bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#172033]">Record availability</h3>
            <form action={setAvailability} className="space-y-2">
              <select name="employeeId" required className="h-9 w-full rounded-md border border-[#E5E9F0] px-3 text-xs">{employees.map((employee)=><option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select>
              <input name="date" type="date" required className="h-9 w-full rounded-md border border-[#E5E9F0] px-3 text-xs"/>
              <select name="available" className="h-9 w-full rounded-md border border-[#E5E9F0] px-3 text-xs"><option value="false">Unavailable</option><option value="true">Available</option></select>
              <input name="reason" placeholder="Reason" className="h-9 w-full rounded-md border border-[#E5E9F0] px-3 text-xs"/>
              <button className="h-9 w-full rounded-md border border-[#E5E9F0] text-xs font-semibold text-[#315EAA]">Save availability</button>
            </form>
          </section>}
        </aside>
        <section className="overflow-hidden border border-[#E5E9F0] bg-white">
          <div className="flex h-12 items-center border-b border-[#E5E9F0] px-4"><h3 className="text-sm font-semibold text-[#172033]">Leave history</h3></div>
          <div className="divide-y divide-[#EEF1F5]">
            {leaves.map((leave)=>(
              <div key={leave.id} className="grid min-h-16 items-center gap-3 px-4 py-3 sm:grid-cols-[32px_1fr_170px_110px]">
                <div className={`flex h-8 w-8 items-center justify-center rounded-md ${leave.status==="APPROVED"?"bg-[#E8F4EE] text-[#26755A]":leave.status==="REJECTED"?"bg-[#FDE8E8] text-[#B42318]":"bg-[#FFF3D6] text-[#9A6700]"}`}>{leave.leaveType==="COMP_OFF"?<Clock3 size={15}/>:<CalendarOff size={15}/>}</div>
                <div><div className="text-[13px] font-medium text-[#172033]">{leave.employee.fullName}</div><div className="mt-0.5 text-[11px] text-[#697586]">{leave.leaveType.replaceAll("_"," ")} · {leave.reason ?? "No reason"}</div></div>
                <div className="text-[11px] text-[#697586]">{leave.startDate.toISOString().slice(0,10)} → {leave.endDate.toISOString().slice(0,10)}</div>
                {leave.status==="PENDING"&&canDecide&&canAccessPod(actor, leave.employee.podId)?<div className="flex gap-2"><form action={decideLeave}><input type="hidden" name="leaveId" value={leave.id}/><input type="hidden" name="status" value="APPROVED"/><button className="text-[11px] font-semibold text-[#26755A]">Approve</button></form><form action={decideLeave}><input type="hidden" name="leaveId" value={leave.id}/><input type="hidden" name="status" value="REJECTED"/><button className="text-[11px] font-medium text-[#B42318]">Reject</button></form></div>:<span className="text-[10px] font-semibold text-[#697586]">{leave.status}</span>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
