import { prisma } from "@/lib/prisma";
import { createPod, updatePod } from "@/actions/management";
import { ManagementHeader } from "@/components/management-shell";
import { connection } from "next/server";
import { UserRole } from "@prisma/client";
import { requireRoles } from "@/lib/auth";

export default async function Page() {
  await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER]);
  await connection();
  const [pods, employees] = await Promise.all([
    prisma.pod.findMany({ include: { lead: true, employees: true, brands: true, processes: true }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { status: "ACTIVE" }, orderBy: { fullName: "asc" } }),
  ]);
  return <>
    <ManagementHeader title="Pods" description={`${pods.length} operational pods`} action="Create pod">
      <form action={createPod} className="grid grid-cols-2 gap-3">
        <input name="podCode" required placeholder="Pod ID" className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs"/>
        <input name="name" required placeholder="Pod name" className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs"/>
        <select name="leadId" className="col-span-2 h-9 rounded-md border border-[#E5E9F0] px-3 text-xs"><option value="">No pod lead</option>{employees.map((employee)=><option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select>
        <button className="col-span-2 h-9 rounded-md bg-[#315EAA] text-xs font-semibold text-white">Create pod</button>
      </form>
    </ManagementHeader>
    <div className="px-4 md:px-6"><div className="overflow-hidden border border-[#E5E9F0] bg-white"><table className="w-full text-left"><thead className="h-10 border-b border-[#E5E9F0] bg-[#FAFBFC] text-[10px] uppercase text-[#697586]"><tr><th className="px-4">Pod</th><th>Pod lead</th><th>Employees</th><th>Brands</th><th>Processes</th><th className="px-4 text-right">Action</th></tr></thead><tbody className="divide-y divide-[#EEF1F5]">{pods.map((pod)=><tr key={pod.id} className="h-14 text-xs"><td className="px-4"><div className="font-medium text-[#172033]">{pod.name}</div><div className="mt-0.5 text-[10px] text-[#697586]">{pod.podCode}</div></td><td>{pod.lead?.fullName ?? "Unassigned"}</td><td>{pod.employees.length}</td><td>{pod.brands.length}</td><td>{pod.processes.length}</td><td className="px-4 text-right"><form action={updatePod} className="flex justify-end gap-2"><input type="hidden" name="podId" value={pod.id}/><input type="hidden" name="name" value={pod.name}/><select name="leadId" defaultValue={pod.leadId ?? ""} className="h-8 rounded-md border border-[#E5E9F0] px-2 text-[11px]"><option value="">No lead</option>{employees.map((employee)=><option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select><button className="text-[11px] font-medium text-[#315EAA]">Save</button></form></td></tr>)}</tbody></table></div></div>
  </>;
}
