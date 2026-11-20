import { prisma } from "@/lib/prisma";
import { createBrand, setBrandStatus } from "@/actions/management";
import { ManagementHeader } from "@/components/management-shell";
import { connection } from "next/server";
import { UserRole } from "@prisma/client";
import { requireRoles } from "@/lib/auth";

export default async function Page() {
  await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER]);
  await connection();
  const [brands, pods] = await Promise.all([
    prisma.brand.findMany({ include: { pod: true, assignments: true, processes: true }, orderBy: { name: "asc" } }),
    prisma.pod.findMany({ orderBy: { name: "asc" } }),
  ]);
  return <>
    <ManagementHeader title="Brands" description={`${brands.length} brand workspaces`} action="Add brand">
      <form action={createBrand} className="grid grid-cols-2 gap-3">
        <input name="brandCode" required placeholder="Brand ID" className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs"/>
        <input name="name" required placeholder="Brand name" className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs"/>
        <input name="description" placeholder="Description" className="col-span-2 h-9 rounded-md border border-[#E5E9F0] px-3 text-xs"/>
        <select name="podId" className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs"><option value="">No pod</option>{pods.map((pod)=><option key={pod.id} value={pod.id}>{pod.name}</option>)}</select>
        <select name="active" className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs"><option value="true">Active</option><option value="false">Inactive</option></select>
        <button className="col-span-2 h-9 rounded-md bg-[#315EAA] text-xs font-semibold text-white">Create brand</button>
      </form>
    </ManagementHeader>
    <div className="px-4 md:px-6"><div className="overflow-hidden border border-[#E5E9F0] bg-white"><table className="w-full text-left"><thead className="h-10 border-b border-[#E5E9F0] bg-[#FAFBFC] text-[10px] uppercase text-[#697586]"><tr><th className="px-4">Brand</th><th>Pod</th><th>Employees</th><th>Processes</th><th>Status</th><th className="px-4 text-right">Action</th></tr></thead><tbody className="divide-y divide-[#EEF1F5]">{brands.map((brand)=><tr key={brand.id} className="h-14 text-xs"><td className="px-4"><div className="font-medium text-[#172033]">{brand.name}</div><div className="mt-0.5 text-[10px] text-[#697586]">{brand.brandCode}</div></td><td>{brand.pod?.name ?? "Unassigned"}</td><td>{brand.assignments.length}</td><td>{brand.processes.length}</td><td><span className={`rounded-full px-2 py-1 text-[10px] ${brand.active ? "bg-[#E8F4EE] text-[#26755A]" : "bg-[#EEF1F5] text-[#697586]"}`}>{brand.active ? "ACTIVE" : "INACTIVE"}</span></td><td className="px-4 text-right"><form action={setBrandStatus}><input type="hidden" name="brandId" value={brand.id}/><input type="hidden" name="active" value={String(!brand.active)}/><button className="text-[11px] font-medium text-[#315EAA]">{brand.active ? "Deactivate" : "Activate"}</button></form></td></tr>)}</tbody></table></div></div>
  </>;
}
