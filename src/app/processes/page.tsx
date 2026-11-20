import { prisma } from "@/lib/prisma";
import { createProcess, setProcessStatus } from "@/actions/management";
import { ManagementHeader } from "@/components/management-shell";
import { connection } from "next/server";
import { UserRole } from "@prisma/client";
import { requireRoles } from "@/lib/auth";

export default async function Page() {
  await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER]);
  await connection();
  const [processes, brands, pods] = await Promise.all([
    prisma.process.findMany({ include: { brand: true, pod: true, assignments: true }, orderBy: { name: "asc" } }),
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
    prisma.pod.findMany({ orderBy: { name: "asc" } }),
  ]);
  return <>
    <ManagementHeader title="Processes" description={`${processes.length} configured operational processes`} action="Add process">
      <form action={createProcess} className="grid grid-cols-2 gap-3">
        <input name="processCode" required placeholder="Process ID" className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs"/>
        <input name="name" required placeholder="Process name" className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs"/>
        <select name="brandId" required className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs">{brands.map((brand)=><option key={brand.id} value={brand.id}>{brand.name}</option>)}</select>
        <select name="podId" className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs"><option value="">No pod</option>{pods.map((pod)=><option key={pod.id} value={pod.id}>{pod.name}</option>)}</select>
        <input name="minimumStaffing" type="number" min="1" defaultValue="1" className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs"/>
        <select name="active" className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs"><option value="true">Active</option><option value="false">Inactive</option></select>
        <button className="col-span-2 h-9 rounded-md bg-[#315EAA] text-xs font-semibold text-white">Create process</button>
      </form>
    </ManagementHeader>
    <div className="px-4 md:px-6"><div className="overflow-hidden border border-[#E5E9F0] bg-white"><table className="w-full text-left"><thead className="h-10 border-b border-[#E5E9F0] bg-[#FAFBFC] text-[10px] uppercase text-[#697586]"><tr><th className="px-4">Process</th><th>Brand</th><th>Pod</th><th>Minimum staff</th><th>Assigned</th><th className="px-4 text-right">Action</th></tr></thead><tbody className="divide-y divide-[#EEF1F5]">{processes.map((process)=><tr key={process.id} className="h-14 text-xs"><td className="px-4"><div className="font-medium text-[#172033]">{process.name}</div><div className="mt-0.5 text-[10px] text-[#697586]">{process.processCode}</div></td><td>{process.brand.name}</td><td>{process.pod?.name ?? "Unassigned"}</td><td>{process.minimumStaffing}</td><td>{process.assignments.length}</td><td className="px-4 text-right"><form action={setProcessStatus}><input type="hidden" name="processId" value={process.id}/><input type="hidden" name="active" value={String(!process.active)}/><button className="text-[11px] font-medium text-[#315EAA]">{process.active ? "Deactivate" : "Activate"}</button></form></td></tr>)}</tbody></table></div></div>
  </>;
}
