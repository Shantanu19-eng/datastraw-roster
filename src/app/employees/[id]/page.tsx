import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { canAccessEmployee, requireUser } from "@/lib/auth";

type EmployeeParams = Promise<{ id: string }>;

export default async function EmployeeProfile({ params }: { params: EmployeeParams }) {
  await connection();
  const actor = await requireUser();
  const { id } = await params;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const currentRoster = await prisma.roster.findFirst({
    where: { month: now.getMonth() + 1, year: now.getFullYear() },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      pod: true,
      brandAssignments: {
        where: actor.role === "POD_LEAD" ? { brand: { podId: actor.employee?.podId ?? "__none__" } } : {},
        include: { brand: true },
      },
      processAssignments: {
        where: actor.role === "POD_LEAD" ? { process: { podId: actor.employee?.podId ?? "__none__" } } : {},
        include: { process: { include: { brand: true } } },
      },
      weeklyOffs: true,
      leaves: { orderBy: { startDate: "desc" } },
      availabilities: { orderBy: { date: "desc" }, take: 10 },
      rosterEntries: {
        where: {
          rosterId: currentRoster?.id ?? "no-current-roster",
          date: { gte: monthStart, lt: nextMonthStart },
        },
        include: { process: true, roster: true },
        orderBy: { date: "asc" },
      },
    },
  });
  if (!employee || !canAccessEmployee(actor, employee.id, employee.podId)) notFound();

  const workload = employee.rosterEntries.filter((entry) => entry.status === "WORKING").length;
  return (
    <div className="p-4 md:p-6">
      <Link href="/employees" className="mb-4 inline-flex items-center gap-2 text-xs font-medium text-[#697586] hover:text-[#315EAA]"><ArrowLeft size={14}/>Back to employees</Link>
      <div className="mb-5 flex items-center gap-4 border border-[#E5E9F0] bg-white p-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E8EEF8] text-sm font-semibold text-[#315EAA]">{employee.fullName.split(" ").map((part)=>part[0]).slice(0,2).join("")}</div>
        <div className="min-w-0 flex-1"><h2 className="text-lg font-semibold text-[#172033]">{employee.fullName}</h2><p className="mt-0.5 text-xs text-[#697586]">{employee.employeeCode} · {employee.role} · {employee.pod?.name ?? "No pod"}</p></div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${employee.status==="ACTIVE"?"bg-[#E8F4EE] text-[#26755A]":"bg-[#EEF1F5] text-[#697586]"}`}>{employee.status}</span>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <section className="border border-[#E5E9F0] bg-white p-4"><h3 className="mb-3 text-sm font-semibold text-[#172033]">Employee information</h3><dl className="space-y-3 text-xs"><div><dt className="text-[#697586]">Email</dt><dd className="mt-0.5 text-[#172033]">{employee.email}</dd></div><div><dt className="text-[#697586]">Phone</dt><dd className="mt-0.5 text-[#172033]">{employee.phone ?? "Not provided"}</dd></div><div><dt className="text-[#697586]">Joined</dt><dd className="mt-0.5 text-[#172033]">{employee.joiningDate.toISOString().slice(0,10)}</dd></div><div><dt className="text-[#697586]">Preferred weekly off</dt><dd className="mt-0.5 text-[#172033]">{["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][employee.preferredOff]}</dd></div></dl></section>
        <section className="border border-[#E5E9F0] bg-white p-4"><h3 className="mb-3 text-sm font-semibold text-[#172033]">Assignments</h3><div className="space-y-3"><div><p className="mb-1 text-[10px] uppercase text-[#697586]">Brands</p>{employee.brandAssignments.length?employee.brandAssignments.map((assignment)=><div key={assignment.id} className="text-xs text-[#172033]">{assignment.brand.name}</div>):<p className="text-xs text-[#697586]">No brand assignments</p>}</div><div><p className="mb-1 text-[10px] uppercase text-[#697586]">Processes</p>{employee.processAssignments.length?employee.processAssignments.map((assignment)=><div key={assignment.id} className="text-xs text-[#172033]">{assignment.process.brand.name} · {assignment.process.name}</div>):<p className="text-xs text-[#697586]">No process assignments</p>}</div></div></section>
        <section className="border border-[#E5E9F0] bg-white p-4"><h3 className="mb-3 text-sm font-semibold text-[#172033]">Current month roster</h3><div className="mb-3 text-xs text-[#697586]">{workload} process assignment(s) this month</div><div className="max-h-56 space-y-2 overflow-auto">{employee.rosterEntries.map((entry)=><div key={entry.id} className="flex items-center justify-between border-b border-[#EEF1F5] pb-2 text-[11px]"><span className="text-[#172033]">{entry.date.toISOString().slice(0,10)}</span><span className="text-[#697586]">{entry.status==="WORKING"?entry.process?.name??"Working":entry.status.replaceAll("_"," ")}</span></div>)}{employee.rosterEntries.length===0&&<p className="text-xs text-[#697586]">No roster entries for this month.</p>}</div></section>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="border border-[#E5E9F0] bg-white p-4"><h3 className="mb-3 text-sm font-semibold text-[#172033]">Leave history</h3><div className="space-y-2">{employee.leaves.map((leave)=><div key={leave.id} className="flex justify-between gap-3 text-xs"><span className="text-[#172033]">{leave.leaveType.replaceAll("_"," ")} · {leave.startDate.toISOString().slice(0,10)} – {leave.endDate.toISOString().slice(0,10)}</span><span className="text-[#697586]">{leave.status}</span></div>)}{employee.leaves.length===0&&<p className="text-xs text-[#697586]">No leave history.</p>}</div></section>
        <section className="border border-[#E5E9F0] bg-white p-4"><h3 className="mb-3 text-sm font-semibold text-[#172033]">Availability changes</h3><div className="space-y-2">{employee.availabilities.map((availability)=><div key={availability.id} className="flex justify-between gap-3 text-xs"><span className="text-[#172033]">{availability.date.toISOString().slice(0,10)} · {availability.reason ?? "No reason"}</span><span className={availability.available?"text-[#26755A]":"text-[#B42318]"}>{availability.available?"Available":"Unavailable"}</span></div>)}{employee.availabilities.length===0&&<p className="text-xs text-[#697586]">No date-specific availability changes.</p>}</div></section>
      </div>
    </div>
  );
}
