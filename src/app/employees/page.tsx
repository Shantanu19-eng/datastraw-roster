import Link from "next/link";
import { connection } from "next/server";
import { Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { setEmployeeStatus } from "@/actions/management";
import { ManagementHeader } from "@/components/management-shell";
import { EmployeeForm } from "@/components/employee-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";
import { isManager, requireRoles } from "@/lib/auth";

type SearchParams = Promise<{ q?: string; podId?: string; brandId?: string; processId?: string; status?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const actor = await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER, UserRole.POD_LEAD]);
  const params = await searchParams;
  const query = params.q?.trim();
  const status = params.status === "ACTIVE" || params.status === "INACTIVE" ? params.status : undefined;
  const podId = actor.role === UserRole.POD_LEAD
    ? actor.employee?.podId ?? "__unassigned_pod_lead__"
    : params.podId;
  const where: Prisma.EmployeeWhereInput = {
    ...(query ? { OR: [
      { fullName: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
      { employeeCode: { contains: query, mode: "insensitive" } },
    ] } : {}),
    ...(status ? { status } : {}),
    ...(podId ? { podId } : {}),
    ...(params.brandId ? { brandAssignments: { some: { brandId: params.brandId } } } : {}),
    ...(params.processId ? { processAssignments: { some: { processId: params.processId } } } : {}),
  };
  const [employees, pods, brands, processes] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: {
        pod: true,
        brandAssignments: {
          where: actor.role === UserRole.POD_LEAD ? { brand: { podId: podId ?? "__unassigned_pod_lead__" } } : {},
          include: { brand: true },
        },
        processAssignments: {
          where: actor.role === UserRole.POD_LEAD ? { process: { OR: [{ podId: podId ?? "__unassigned_pod_lead__" }, { brand: { podId: podId ?? "__unassigned_pod_lead__" } }] } } : {},
          include: { process: true },
        },
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.pod.findMany({ where: actor.role === UserRole.POD_LEAD ? { id: podId ?? "__unassigned_pod_lead__" } : {}, orderBy: { name: "asc" } }),
    prisma.brand.findMany({ where: { active: true, ...(actor.role === UserRole.POD_LEAD ? { podId: podId ?? "__unassigned_pod_lead__" } : {}) }, orderBy: { name: "asc" } }),
    prisma.process.findMany({ where: { active: true, ...(actor.role === UserRole.POD_LEAD ? { podId: podId ?? "__unassigned_pod_lead__" } : {}) }, include: { brand: true }, orderBy: { name: "asc" } }),
  ]);
  const formProcesses = processes.map((process)=>({ id: process.id, name: process.name, brandId: process.brandId, brandName: process.brand.name }));

  return (
    <>
      <ManagementHeader title="Employees" description={`${employees.length} matching workforce records`} action={isManager(actor.role) ? "Add employee" : undefined}>
        {isManager(actor.role) && <EmployeeForm pods={pods} brands={brands} processes={formProcesses}/>}
      </ManagementHeader>
      <div className="px-4 md:px-6">
        <form method="get" className="mb-3 flex flex-wrap items-center gap-2">
          <label className="flex h-8 items-center gap-2 rounded-md border border-[#E5E9F0] bg-white px-3 text-xs text-[#697586]"><Search size={13}/><input name="q" defaultValue={query} placeholder="Search name, email or ID" className="w-44 outline-none"/></label>
          {actor.role !== UserRole.POD_LEAD && <select name="podId" defaultValue={params.podId??""} className="h-8 rounded-md border border-[#E5E9F0] bg-white px-3 text-xs"><option value="">All pods</option>{pods.map((pod)=><option key={pod.id} value={pod.id}>{pod.name}</option>)}</select>}
          <select name="brandId" defaultValue={params.brandId??""} className="h-8 rounded-md border border-[#E5E9F0] bg-white px-3 text-xs"><option value="">All brands</option>{brands.map((brand)=><option key={brand.id} value={brand.id}>{brand.name}</option>)}</select>
          <select name="processId" defaultValue={params.processId??""} className="h-8 rounded-md border border-[#E5E9F0] bg-white px-3 text-xs"><option value="">All processes</option>{processes.map((process)=><option key={process.id} value={process.id}>{process.name}</option>)}</select>
          <select name="status" defaultValue={status??""} className="h-8 rounded-md border border-[#E5E9F0] bg-white px-3 text-xs"><option value="">Any status</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
          <button className="h-8 rounded-md bg-[#315EAA] px-3 text-xs font-semibold text-white">Filter</button>
        </form>
        <div className="overflow-hidden border border-[#E5E9F0] bg-white">
          <table className="w-full text-left">
            <thead className="h-10 border-b border-[#E5E9F0] bg-[#FAFBFC] text-[10px] uppercase text-[#697586]"><tr><th className="px-4">Employee</th><th>Pod</th><th>Brands</th><th>Processes</th><th>Status</th><th className="px-4 text-right">Action</th></tr></thead>
            <tbody className="divide-y divide-[#EEF1F5]">{employees.map((employee) => (
              <tr key={employee.id} className="h-14 text-xs">
                <td className="px-4"><Link href={`/employees/${employee.id}`} className="font-medium text-[#172033] hover:text-[#315EAA]">{employee.fullName}</Link><div className="mt-0.5 text-[10px] text-[#697586]">{employee.employeeCode} · {employee.role}</div></td>
                <td>{employee.pod?.name ?? "Unassigned"}</td>
                <td>{employee.brandAssignments.map((assignment)=>assignment.brand.name).join(", ") || "—"}</td>
                <td>{employee.processAssignments.length}</td>
                <td><span className={`rounded-full px-2 py-1 text-[10px] font-medium ${employee.status==="ACTIVE"?"bg-[#E8F4EE] text-[#26755A]":"bg-[#EEF1F5] text-[#697586]"}`}>{employee.status}</span></td>
                <td className="px-4 text-right">
                  {isManager(actor.role) &&
                  <div className="flex items-center justify-end gap-3">
                    <Dialog>
                      <DialogTrigger render={<button className="text-[11px] font-medium text-[#315EAA]">Edit</button>}/>
                      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                        <DialogHeader><DialogTitle>Edit {employee.fullName}</DialogTitle></DialogHeader>
                        <EmployeeForm
                          employee={{
                            id: employee.id,
                            employeeCode: employee.employeeCode,
                            fullName: employee.fullName,
                            email: employee.email,
                            phone: employee.phone,
                            role: employee.role,
                            podId: employee.podId,
                            preferredOff: employee.preferredOff,
                            status: employee.status,
                            brandIds: employee.brandAssignments.map((assignment)=>assignment.brandId),
                            processIds: employee.processAssignments.map((assignment)=>assignment.processId),
                          }}
                          pods={pods}
                          brands={brands}
                          processes={formProcesses}
                        />
                      </DialogContent>
                    </Dialog>
                    <form action={setEmployeeStatus}>
                      <input type="hidden" name="employeeId" value={employee.id}/>
                      <input type="hidden" name="status" value={employee.status==="ACTIVE"?"INACTIVE":"ACTIVE"}/>
                      <button className="text-[11px] font-medium text-[#697586]">{employee.status==="ACTIVE"?"Deactivate":"Activate"}</button>
                    </form>
                  </div>
                  }
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </>
  );
}
