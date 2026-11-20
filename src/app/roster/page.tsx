import { prisma } from "@/lib/prisma";
import { connection } from "next/server";
import { generateRoster, publishRoster } from "@/actions/scheduling";
import { dateKey, processOperates, type OperatingType, type ScheduleProcess } from "@/lib/scheduling-engine";
import { ChevronDown, Download, RefreshCw, Send } from "lucide-react";
import { ManualAssignmentDialog } from "@/components/manual-assignment-dialog";
import { UserRole } from "@prisma/client";
import { isManager, requireRoles } from "@/lib/auth";

type RosterSearchParams = Promise<{
  month?: string;
  year?: string;
  podId?: string;
  brandId?: string;
  processId?: string;
  employeeId?: string;
}>;

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const statusClass: Record<string, string> = {
  W: "bg-[#E8F4EE] text-[#26755A]",
  WO: "bg-[#EEF1F5] text-[#697586]",
  L: "bg-[#FFF3D6] text-[#9A6700]",
  H: "bg-[#DCEAF8] text-[#315EAA]",
  CO: "bg-[#EFE6F9] text-[#7241A6]",
  U: "bg-white text-[#A0A8B5]",
  "!": "bg-[#FDE8E8] text-[#B42318]",
};

export default async function RosterPage({ searchParams }: { searchParams: RosterSearchParams }) {
  await connection();
  const actor = await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER, UserRole.POD_LEAD, UserRole.EMPLOYEE]);
  const params = await searchParams;
  const now = new Date();
  const monthInput = Number(params.month);
  const yearInput = Number(params.year);
  const month = Number.isInteger(monthInput) && monthInput >= 1 && monthInput <= 12 ? monthInput : now.getMonth() + 1;
  const year = Number.isInteger(yearInput) && yearInput >= 2024 && yearInput <= 2100 ? yearInput : now.getFullYear();
  const podId = actor.role === UserRole.POD_LEAD ? actor.employee?.podId ?? "__unassigned_pod_lead__" : null;
  const employeeScope = actor.role === UserRole.EMPLOYEE
    ? { id: actor.employeeId ?? "__unlinked_employee__" }
    : podId
      ? { podId }
      : {};
  const rosterScope = actor.role === UserRole.EMPLOYEE
    ? { employeeId: actor.employeeId ?? "__unlinked_employee__" }
    : podId
      ? { OR: [{ employee: { podId } }, { process: { podId } }, { process: { brand: { podId } } }] }
      : {};

  const [roster, employees, processes, pods, brands, holidays] = await Promise.all([
    prisma.roster.findFirst({
      where: { month, year },
      include: {
        entries: { where: rosterScope, include: { process: true } },
        conflicts: { where: actor.role === UserRole.EMPLOYEE ? { employeeId: actor.employeeId ?? "__unlinked_employee__" } : rosterScope },
        versions: { orderBy: { version: "desc" }, take: 1 },
      },
    }),
    prisma.employee.findMany({
      where: { status: "ACTIVE", ...employeeScope },
      include: {
        pod: true,
        brandAssignments: true,
        processAssignments: { include: { process: { include: { brand: { include: { operatingRules: true } }, operatingRules: true } } } },
        weeklyOffs: true,
        leaves: { where: { status: "APPROVED" } },
        availabilities: true,
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.process.findMany({
      where: {
        active: true,
        ...(podId ? { OR: [{ podId }, { brand: { podId } }] } : actor.role === UserRole.EMPLOYEE
          ? { assignments: { some: { employeeId: actor.employeeId ?? "__unlinked_employee__" } } }
          : {}),
      },
      include: { brand: { include: { operatingRules: true } }, operatingRules: true },
      orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.pod.findMany({ where: podId ? { id: podId } : {}, orderBy: { name: "asc" } }),
    prisma.brand.findMany({
      where: {
        active: true,
        ...(podId ? { podId } : actor.role === UserRole.EMPLOYEE
          ? { assignments: { some: { employeeId: actor.employeeId ?? "__unlinked_employee__" } } }
          : {}),
      },
      orderBy: { name: "asc" },
    }),
    prisma.holiday.findMany({ where: podId ? { OR: [{ brandId: null }, { brand: { podId } }] } : {} }),
  ]);

  const processMap = new Map<string, ScheduleProcess>();
  for (const process of processes) {
    const rules = [
      ...process.brand.operatingRules.map((rule) => ({ ...rule, priority: 0 })),
      ...process.operatingRules.map((rule) => ({ ...rule, priority: 1 })),
    ];
    const activeRule = rules
      .filter((rule) => rule.effectiveFrom <= new Date(Date.UTC(year, month - 1, 1)) && (!rule.effectiveTo || rule.effectiveTo >= new Date(Date.UTC(year, month - 1, 1))))
      .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime() || b.priority - a.priority)[0];
    processMap.set(process.id, {
      id: process.id,
      name: process.name,
      brandId: process.brandId,
      brandCode: process.brand.brandCode,
      minimumStaffing: process.minimumStaffing,
      operatingType: (activeRule?.operatingType ?? "TYPE_A_365") as OperatingType,
      weeklyDays: activeRule?.weeklyDays ?? [0, 1, 2, 3, 4, 5, 6],
      holidayDates: holidays.filter((holiday) => !holiday.brandId || holiday.brandId === process.brandId).map((holiday) => dateKey(holiday.date)),
    });
  }

  const visibleEmployees = employees.filter((employee) =>
    (!params.podId || employee.podId === params.podId)
    && (!params.brandId || employee.brandAssignments.some((assignment) => assignment.brandId === params.brandId))
    && (!params.processId || employee.processAssignments.some((assignment) => assignment.processId === params.processId))
    && (!params.employeeId || employee.id === params.employeeId),
  );
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days = Array.from({ length: dayCount }, (_, index) => index + 1);
  const entries = new Map((roster?.entries ?? []).map((entry) => [`${entry.employeeId}-${dateKey(entry.date)}`, entry]));
  const conflicts = new Map<string, number>();
  for (const conflict of roster?.conflicts.filter((item) => item.status === "OPEN") ?? []) {
    const key = dateKey(conflict.date);
    conflicts.set(key, (conflicts.get(key) ?? 0) + 1);
  }
  const monthLabel = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
  const openCriticalConflicts = roster?.conflicts.filter((conflict) => conflict.status === "OPEN" && conflict.severity === "CRITICAL").length ?? 0;

  function getStatus(employee: (typeof employees)[number], day: number): string {
    const date = new Date(Date.UTC(year, month - 1, day));
    const key = dateKey(date);
    const rosterEntry = entries.get(`${employee.id}-${key}`);
    if (rosterEntry?.status === "WORKING") return "W";
    if (roster?.conflicts.some((conflict) => conflict.status === "OPEN" && conflict.employeeId === employee.id && dateKey(conflict.date) === key)) return "!";
    if (rosterEntry?.status === "UNASSIGNED") return "U";
    if (rosterEntry?.status === "WEEKLY_OFF") return "WO";
    if (rosterEntry?.status === "PUBLIC_HOLIDAY") return "H";
    if (rosterEntry?.status === "LEAVE") return "L";
    if (rosterEntry?.status === "COMP_OFF") return "CO";
    const leave = employee.leaves.find((item) => item.startDate <= date && item.endDate >= date);
    if (leave) return leave.leaveType === "COMP_OFF" ? "CO" : "L";
    const weeklyOff = employee.weeklyOffs.some((off) =>
      off.weekday === date.getUTCDay()
      && off.effectiveFrom <= date
      && (!off.effectiveTo || off.effectiveTo >= date),
    );
    if (weeklyOff) return "WO";
    const unavailable = employee.availabilities.some((item) => dateKey(item.date) === key && !item.available);
    if (unavailable) return "!";
    const assignedProcesses = employee.processAssignments
      .map((assignment) => processMap.get(assignment.processId))
      .filter((process): process is ScheduleProcess => process !== undefined);
    const relevantHoliday = holidays.some((holiday) =>
      dateKey(holiday.date) === key
      && (!holiday.brandId || employee.brandAssignments.some((assignment) => assignment.brandId === holiday.brandId)),
    );
    if (relevantHoliday && assignedProcesses.every((process) => !processOperates(process, date))) return "H";
    return "U";
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#172033]">Monthly roster</h2>
          <p className="mt-0.5 text-xs text-[#697586]">{monthLabel} · {roster?.status ?? "Not generated"}{roster ? ` · Version ${roster.versions[0]?.version ?? 0}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isManager(actor.role) && <form action={generateRoster} className="flex gap-2">
            <input type="hidden" name="month" value={month}/><input type="hidden" name="year" value={year}/>
            <button className="flex h-9 items-center gap-2 rounded-md border border-[#E5E9F0] bg-white px-3 text-xs font-semibold text-[#172033]"><RefreshCw size={14}/>Generate</button>
          </form>}
          {roster?.status === "DRAFT" && actor.role !== UserRole.EMPLOYEE && <ManualAssignmentDialog
            rosterId={roster.id}
            month={month}
            year={year}
            employees={employees.map((employee) => ({ id: employee.id, label: employee.fullName }))}
            processes={processes.map((process) => ({ id: process.id, label: `${process.brand.name} · ${process.name}` }))}
          />}
          <a href={`/api/exports/roster?month=${month}&year=${year}`} className="flex h-9 items-center gap-2 rounded-md border border-[#E5E9F0] bg-white px-3 text-xs font-medium text-[#697586]"><Download size={14}/>Export CSV</a>
          {isManager(actor.role) && <form action={publishRoster}>
            <input type="hidden" name="month" value={month}/><input type="hidden" name="year" value={year}/>
            <button disabled={!roster || openCriticalConflicts > 0} title={openCriticalConflicts ? "Resolve critical conflicts before publishing" : undefined} className="flex h-9 items-center gap-2 rounded-md bg-[#315EAA] px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Send size={14}/>Publish roster</button>
          </form>}
        </div>
      </div>

      <form method="get" className="mb-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="roster-month">Month</label>
        <select id="roster-month" name="month" defaultValue={String(month)} className="h-8 rounded-md border border-[#E5E9F0] bg-white px-3 text-xs text-[#697586]">
          {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(Date.UTC(2026, index, 1)))}</option>)}
        </select>
        <label className="sr-only" htmlFor="roster-year">Year</label>
        <select id="roster-year" name="year" defaultValue={String(year)} className="h-8 rounded-md border border-[#E5E9F0] bg-white px-3 text-xs text-[#697586]">
          {Array.from({ length: 5 }, (_, index) => year - 2 + index).map((optionYear) => <option key={optionYear} value={optionYear}>{optionYear}</option>)}
        </select>
        <select name="podId" defaultValue={params.podId ?? ""} className="h-8 rounded-md border border-[#E5E9F0] bg-white px-3 text-xs text-[#697586]"><option value="">All pods</option>{pods.map((pod)=><option key={pod.id} value={pod.id}>{pod.name}</option>)}</select>
        <select name="brandId" defaultValue={params.brandId ?? ""} className="h-8 rounded-md border border-[#E5E9F0] bg-white px-3 text-xs text-[#697586]"><option value="">All brands</option>{brands.map((brand)=><option key={brand.id} value={brand.id}>{brand.name}</option>)}</select>
        <select name="processId" defaultValue={params.processId ?? ""} className="h-8 rounded-md border border-[#E5E9F0] bg-white px-3 text-xs text-[#697586]"><option value="">All processes</option>{processes.map((process)=><option key={process.id} value={process.id}>{process.name}</option>)}</select>
        <select name="employeeId" defaultValue={params.employeeId ?? ""} className="h-8 rounded-md border border-[#E5E9F0] bg-white px-3 text-xs text-[#697586]"><option value="">All employees</option>{employees.map((employee)=><option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select>
        <button className="flex h-8 items-center gap-1 rounded-md bg-[#315EAA] px-3 text-xs font-semibold text-white">Apply filters <ChevronDown size={12}/></button>
        <div className="ml-auto flex flex-wrap gap-2 text-[10px] text-[#697586]">{Object.entries(statusClass).map(([label, classes])=><span key={label} className="flex items-center gap-1"><i className={`h-3 min-w-3 rounded-sm ${classes}`}/>{label}</span>)}</div>
      </form>

      <div className="mb-2 flex gap-2 text-[11px]">
        {!roster && <span className="border border-[#E5E9F0] bg-white px-3 py-2 text-[#697586]">No roster saved for this month. Generate a draft to populate assignments.</span>}
        {roster && openCriticalConflicts > 0 && <span className="border border-[#F2C6C6] bg-[#FFF7F7] px-3 py-2 text-[#B42318]">{openCriticalConflicts} critical conflicts block publishing. Review the <a className="underline" href="/conflicts">conflict list</a>.</span>}
        {roster && conflicts.size > 0 && <span className="border border-[#E5E9F0] bg-white px-3 py-2 text-[#697586]">{conflicts.size} date(s) have conflicts.</span>}
      </div>
      <div className="overflow-hidden border border-[#E5E9F0] bg-white">
        <div className="overflow-auto">
          <table className="border-collapse">
            <thead><tr className="h-12 bg-[#FAFBFC]">
              <th className="sticky left-0 z-10 w-[210px] min-w-[210px] border-b border-r border-[#E5E9F0] px-4 text-left text-[11px] font-semibold uppercase text-[#697586]">Employee</th>
              {days.map((day) => <th key={day} className="w-10 min-w-10 border-b border-r border-[#EEF1F5] text-center text-[11px] font-medium text-[#697586]"><div>{weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]}</div><div className="mt-0.5">{day}</div></th>)}
            </tr></thead>
            <tbody>
              {visibleEmployees.map((employee) => <tr key={employee.id} className="h-[54px]">
                <td className="sticky left-0 z-10 border-b border-r border-[#E5E9F0] bg-white px-4"><div className="text-[13px] font-medium text-[#172033]">{employee.fullName}</div><div className="mt-0.5 text-[10px] text-[#697586]">{employee.pod?.name ?? "Unassigned"}</div></td>
                {days.map((day) => {
                  const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const status = getStatus(employee, day);
                  const entry = entries.get(`${employee.id}-${key}`);
                  const title = entry?.process?.name ?? (status === "U" ? "Unassigned" : status);
                  return <td key={day} className="border-b border-r border-[#EEF1F5] p-1 text-center"><span title={title} className={`mx-auto flex h-7 w-7 items-center justify-center rounded text-[9px] font-semibold ${statusClass[status]}`}>{status}</span></td>;
                })}
              </tr>)}
              {visibleEmployees.length === 0 && <tr><td colSpan={dayCount + 1} className="p-12 text-center text-xs text-[#697586]">No employees match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-[#697586]">W Working · WO Weekly off · L Approved leave · H Public holiday · CO Comp-off · U Unassigned · ! Conflict or unavailable</p>
    </div>
  );
}
