import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { dateKey, processOperates, type OperatingType, type ScheduleProcess } from "@/lib/scheduling-engine";
import { UserRole } from "@prisma/client";
import { requireRoles } from "@/lib/auth";

type SearchParams = Promise<{ month?: string; year?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const actor = await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER, UserRole.POD_LEAD]);
  const params = await searchParams;
  const now = new Date();
  const parsedMonth = Number(params.month);
  const parsedYear = Number(params.year);
  const month = Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : now.getMonth() + 1;
  const year = Number.isInteger(parsedYear) && parsedYear >= 2024 && parsedYear <= 2100 ? parsedYear : now.getFullYear();
  const podId = actor.role === UserRole.POD_LEAD ? actor.employee?.podId ?? "__unassigned_pod_lead__" : null;
  const podScope = podId ? { OR: [{ podId }, { brand: { podId } }] } : {};
  const scheduleScope = podId
    ? { OR: [{ employee: { podId } }, { process: { podId } }, { process: { brand: { podId } } }] }
    : {};

  const [records, rosters, holidays] = await Promise.all([
    prisma.process.findMany({
      where: { active: true, ...podScope },
      include: {
        brand: { include: { operatingRules: true } },
        pod: true,
        operatingRules: true,
        coverageRequirements: true,
        assignments: { include: { employee: { include: { brandAssignments: true } } } },
      },
      orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.roster.findMany({
      where: { month, year },
      include: {
        entries: { where: scheduleScope },
        conflicts: { where: scheduleScope },
      },
      orderBy: { updatedAt: "desc" },
      take: 1,
    }),
    prisma.holiday.findMany({ where: podId ? { OR: [{ brandId: null }, { brand: { podId } }] } : {} }),
  ]);
  const roster = rosters[0];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const summaries = records.map((record) => {
    const rules = [
      ...record.brand.operatingRules.map((rule) => ({ ...rule, priority: 0 })),
      ...record.operatingRules.map((rule) => ({ ...rule, priority: 1 })),
    ];
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const activeRule = rules
      .filter((rule) => rule.effectiveFrom <= monthStart && (!rule.effectiveTo || rule.effectiveTo >= monthStart))
      .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime() || b.priority - a.priority)[0];
    const process: ScheduleProcess = {
      id: record.id,
      name: record.name,
      brandId: record.brandId,
      brandCode: record.brand.brandCode,
      minimumStaffing: record.minimumStaffing,
      operatingType: (activeRule?.operatingType ?? "TYPE_A_365") as OperatingType,
      weeklyDays: activeRule?.weeklyDays ?? [0, 1, 2, 3, 4, 5, 6],
      holidayDates: holidays.filter((holiday) => !holiday.brandId || holiday.brandId === record.brandId).map((holiday) => dateKey(holiday.date)),
      operatingRules: rules.map((rule) => ({
        operatingType: rule.operatingType,
        weeklyDays: rule.weeklyDays,
        effectiveFrom: dateKey(rule.effectiveFrom),
        effectiveTo: rule.effectiveTo ? dateKey(rule.effectiveTo) : undefined,
        priority: rule.priority,
      })),
      coverageRequirements: record.coverageRequirements.map((requirement) => ({
        weekday: requirement.weekday,
        minimumStaff: requirement.minimumStaff,
        effectiveFrom: dateKey(requirement.effectiveFrom),
        effectiveTo: requirement.effectiveTo ? dateKey(requirement.effectiveTo) : undefined,
      })),
    };
    let required = 0;
    let operatingDays = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(Date.UTC(year, month - 1, day));
      if (!processOperates(process, date)) continue;
      operatingDays++;
      const key = dateKey(date);
      const requirement = process.coverageRequirements
        ?.filter((item) =>
          item.weekday === date.getUTCDay()
          && item.effectiveFrom <= key
          && (!item.effectiveTo || item.effectiveTo >= key),
        )
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
      required += requirement?.minimumStaff ?? record.minimumStaffing;
    }
    const assigned = roster?.entries.filter((entry) => entry.processId === record.id && entry.status === "WORKING").length ?? 0;
    const qualified = record.assignments.filter((assignment) =>
      assignment.employee.status === "ACTIVE"
      && assignment.employee.brandAssignments.some((brandAssignment) => brandAssignment.brandId === record.brandId),
    ).length;
    return {
      id: record.id,
      name: record.name,
      brandId: record.brandId,
      brandName: record.brand.name,
      podId: record.podId,
      podName: record.pod?.name ?? "Unassigned",
      minimumStaffing: record.minimumStaffing,
      operatingDays,
      qualified,
      required,
      assigned,
      gap: Math.max(0, required - assigned),
      percent: required ? Math.min(100, Math.round(assigned / required * 100)) : 100,
    };
  });
  const requiredTotal = summaries.reduce((sum, item) => sum + item.required, 0);
  const assignedTotal = summaries.reduce((sum, item) => sum + item.assigned, 0);
  const uncoveredTotal = summaries.reduce((sum, item) => sum + item.gap, 0);
  const overallCoverage = requiredTotal ? Math.min(100, Math.round(assignedTotal / requiredTotal * 100)) : 100;
  const groupSummaries = (key: "brandId" | "podId", labelKey: "brandName" | "podName") => {
    const groups = new Map<string, { label: string; required: number; assigned: number }>();
    for (const summary of summaries) {
      const id = summary[key] ?? "unassigned";
      const group = groups.get(id) ?? { label: summary[labelKey], required: 0, assigned: 0 };
      group.required += summary.required;
      group.assigned += summary.assigned;
      groups.set(id, group);
    }
    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
  };
  const brandSummaries = groupSummaries("brandId", "brandName");
  const podSummaries = groupSummaries("podId", "podName");
  const groupedSections = [
    { title: "Brand-wise coverage", groups: brandSummaries },
    { title: "Pod-wise coverage", groups: podSummaries },
  ];
  const metricCards: { label: string; value: string }[] = [
    { label: "Required employee-days", value: String(requiredTotal) },
    { label: "Assigned employee-days", value: String(assignedTotal) },
    { label: "Coverage", value: `${overallCoverage}%` },
    { label: "Uncovered employee-days", value: String(uncoveredTotal) },
  ];
  const monthLabel = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-lg font-semibold text-[#172033]">Coverage Analysis</h2><p className="mt-0.5 text-xs text-[#697586]">{monthLabel} · Operating calendars and persisted roster</p></div>
        <form method="get" className="flex gap-2">
          <select name="month" defaultValue={String(month)} className="h-8 rounded-md border border-[#E5E9F0] bg-white px-3 text-xs">{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(Date.UTC(2026, index, 1)))}</option>)}</select>
          <select name="year" defaultValue={String(year)} className="h-8 rounded-md border border-[#E5E9F0] bg-white px-3 text-xs">{Array.from({ length: 5 }, (_, index) => year - 2 + index).map((optionYear) => <option key={optionYear}>{optionYear}</option>)}</select>
          <button className="h-8 rounded-md bg-[#315EAA] px-3 text-xs font-semibold text-white">Apply</button>
        </form>
      </div>
      <div className="grid grid-cols-2 border-y border-[#E5E9F0] bg-white lg:grid-cols-4">
        {metricCards.map((metric,index)=><div key={metric.label} className={`px-5 py-4 ${index>0?"border-l border-[#E5E9F0]":""}`}><div className="text-[11px] uppercase text-[#697586]">{metric.label}</div><div className="mt-1 text-2xl font-semibold text-[#172033]">{metric.value}</div></div>)}
      </div>
      {!roster && <p className="mt-3 border border-[#E5E9F0] bg-white px-4 py-3 text-xs text-[#697586]">No roster is saved for this month. Assigned coverage is zero until a draft is generated.</p>}
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        {groupedSections.map(({title,groups})=><section key={title} className="border border-[#E5E9F0] bg-white"><div className="border-b border-[#E5E9F0] px-4 py-3 text-sm font-semibold text-[#172033]">{title}</div><div className="divide-y divide-[#EEF1F5]">{groups.map((group)=><div key={group.label} className="flex items-center gap-3 px-4 py-3"><span className="min-w-0 flex-1 truncate text-xs text-[#172033]">{group.label}</span><span className="text-[11px] text-[#697586]">{group.assigned}/{group.required}</span><span className="w-10 text-right text-xs font-semibold text-[#172033]">{group.required?Math.min(100,Math.round(group.assigned/group.required*100)):100}%</span></div>)}</div></section>)}
      </div>
      <div className="mt-5 overflow-hidden border border-[#E5E9F0] bg-white">
        <table className="w-full text-left">
          <thead className="h-10 border-b border-[#E5E9F0] bg-[#FAFBFC] text-[10px] uppercase text-[#697586]"><tr><th className="px-4">Process</th><th>Brand</th><th>Pod</th><th>Operating days</th><th>Required</th><th>Qualified</th><th>Assigned</th><th>Gap</th><th>Coverage</th></tr></thead>
          <tbody className="divide-y divide-[#EEF1F5]">{summaries.map((process)=><tr key={process.id} className="h-14 text-xs"><td className="px-4 font-medium text-[#172033]">{process.name}</td><td>{process.brandName}</td><td>{process.podName}</td><td>{process.operatingDays}</td><td>{process.required}</td><td>{process.qualified}</td><td>{process.assigned}</td><td className={process.gap?"font-semibold text-[#B42318]":"text-[#26755A]"}>{process.gap}</td><td><div className="flex items-center gap-2"><div className="h-1.5 w-20 rounded-full bg-[#EEF1F5]"><div className="h-full rounded-full bg-[#4F86C6]" style={{width:`${process.percent}%`}}/></div><span>{process.percent}%</span></div></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
