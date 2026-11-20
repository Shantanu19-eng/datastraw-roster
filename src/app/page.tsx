import Link from "next/link";
import { ArrowRight, CircleAlert, Clock3, Users } from "lucide-react";
import { MetricStrip } from "./dashboard";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { dateKey, processOperates, type ScheduleProcess } from "@/lib/scheduling-engine";
import { UserRole } from "@prisma/client";
import { requireRoles } from "@/lib/auth";

export default async function Home() {
  await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER]);
  await connection();
  const now = new Date();
  const todayKey = dateKey(now);
  const weekday = now.getDay();
  const [employees, active, brands, processes, pods, gaps, leaves, roster, processRecords, holidays] = await Promise.all([
    prisma.employee.count(),
    prisma.employee.count({ where: { status: "ACTIVE" } }),
    prisma.brand.count({ where: { active: true } }),
    prisma.process.count({ where: { active: true } }),
    prisma.pod.count(),
    prisma.conflict.count({ where: { status: "OPEN", severity: "CRITICAL" } }),
    prisma.leaveRequest.count({ where: { status: "PENDING" } }),
    prisma.roster.findFirst({
      where: { month: now.getMonth() + 1, year: now.getFullYear() },
      include: { entries: true, conflicts: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.process.findMany({
      where: { active: true },
      include: { brand: { include: { operatingRules: true } }, operatingRules: true, coverageRequirements: true },
      orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.holiday.findMany(),
  ]);
  const todayEntries = roster?.entries.filter((entry) => dateKey(entry.date) === todayKey && entry.status === "WORKING") ?? [];
  const todayConflicts = roster?.conflicts.filter((conflict) => dateKey(conflict.date) === todayKey && conflict.status === "OPEN") ?? [];
  const todayCoverage = processRecords.map((record) => {
    const rules = [
      ...record.brand.operatingRules.map((rule) => ({ ...rule, priority: 0 })),
      ...record.operatingRules.map((rule) => ({ ...rule, priority: 1 })),
    ];
    const activeRule = rules
      .filter((rule) => rule.effectiveFrom <= now && (!rule.effectiveTo || rule.effectiveTo >= now))
      .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime() || b.priority - a.priority)[0];
    const process: ScheduleProcess = {
      id: record.id,
      name: record.name,
      brandId: record.brandId,
      brandCode: record.brand.brandCode,
      minimumStaffing: record.coverageRequirements
        .filter((requirement) => requirement.weekday === weekday && requirement.effectiveFrom <= now && (!requirement.effectiveTo || requirement.effectiveTo >= now))
        .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0]?.minimumStaff ?? record.minimumStaffing,
      operatingType: activeRule?.operatingType ?? "TYPE_A_365",
      weeklyDays: activeRule?.weeklyDays ?? [0, 1, 2, 3, 4, 5, 6],
      holidayDates: holidays.filter((holiday) => !holiday.brandId || holiday.brandId === record.brandId).map((holiday) => dateKey(holiday.date)),
    };
    const operating = processOperates(process, now);
    const assigned = todayEntries.filter((entry) => entry.processId === record.id).length;
    return { ...process, operating, assigned, percent: operating && process.minimumStaffing > 0 ? Math.min(100, Math.round(assigned / process.minimumStaffing * 100)) : 100 };
  }).filter((process) => process.operating);
  const workingToday = new Set(todayEntries.map((entry) => entry.employeeId)).size;
  const offToday = Math.max(0, active - workingToday);
  return (
    <div className="p-4 md:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[#172033]">Operations overview</h2>
          <p className="mt-0.5 text-xs text-[#697586]">{now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })} · Live roster status</p>
        </div>
        <Link href="/roster" className="flex h-9 items-center gap-2 rounded-md bg-[#315EAA] px-3 text-xs font-semibold text-white shadow-sm hover:bg-[#294F91]">
          Open monthly roster <ArrowRight size={14} />
        </Link>
      </div>
      <MetricStrip stats={{ employees, active, brands, processes, pods }} />
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.75fr)]">
        <section className="border border-[#E5E9F0] bg-white">
          <div className="flex h-12 items-center border-b border-[#E5E9F0] px-4">
            <h3 className="text-sm font-semibold text-[#172033]">Today&apos;s coverage</h3>
            <span className="ml-auto text-xs text-[#697586]">Real-time</span>
          </div>
          <div className="divide-y divide-[#EEF1F5]">
            {todayCoverage.map((process) => {
              const pct = `${process.percent}%`;
              const staffing = `${process.assigned}/${process.minimumStaffing}`;
              return (
              <div key={process.id} className="grid grid-cols-[1fr_90px_80px] items-center px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#F1F5FA] text-[10px] font-semibold text-[#315EAA]">{process.brandCode.slice(0, 3)}</div>
                  <div><div className="text-[13px] font-medium text-[#172033]">{process.name}</div><div className="mt-0.5 text-[11px] text-[#697586]">{process.brandCode} · {staffing} staff assigned</div></div>
                </div>
                <div className="h-1.5 rounded-full bg-[#EEF1F5]"><div className="h-full rounded-full bg-[#4F86C6]" style={{ width: pct }} /></div>
                <div className="text-right text-xs font-semibold text-[#172033]">{pct}</div>
              </div>
              );
            })}
            {todayCoverage.length === 0 && <p className="px-4 py-8 text-center text-xs text-[#697586]">No processes are scheduled to operate today.</p>}
            {!roster && <p className="px-4 py-3 text-center text-[11px] text-[#697586]">Generate this month&apos;s roster to see assigned coverage.</p>}
          </div>
        </section>
        <section className="border border-[#E5E9F0] bg-white">
          <div className="flex h-12 items-center border-b border-[#E5E9F0] px-4"><h3 className="text-sm font-semibold text-[#172033]">Operational alerts</h3></div>
          <div className="divide-y divide-[#EEF1F5]">
            <div className="flex gap-3 px-4 py-3"><CircleAlert size={16} className="mt-0.5 shrink-0 text-[#B42318]" /><div><p className="text-[13px] font-medium text-[#172033]">{gaps} unresolved critical conflicts</p><p className="mt-0.5 text-[11px] text-[#697586]">{todayConflicts.length} affecting today</p></div></div>
            <div className="flex gap-3 px-4 py-3"><Clock3 size={16} className="mt-0.5 shrink-0 text-[#B7791F]" /><div><p className="text-[13px] font-medium text-[#172033]">{leaves} leave requests pending</p><p className="mt-0.5 text-[11px] text-[#697586]">Awaiting approval</p></div></div>
            <div className="flex gap-3 px-4 py-3"><Users size={16} className="mt-0.5 shrink-0 text-[#315EAA]" /><div><p className="text-[13px] font-medium text-[#172033]">{workingToday} employees working today</p><p className="mt-0.5 text-[11px] text-[#697586]">{offToday} active employees not assigned today</p></div></div>
          </div>
        </section>
      </div>
    </div>
  );
}
