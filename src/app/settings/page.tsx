import { prisma } from "@/lib/prisma";
import { connection } from "next/server";
import { createHoliday, createOperatingRule, setWeeklyOff } from "@/actions/working-rules";
import { createUserAccount, setUserAccountStatus } from "@/actions/auth";
import { UserRole } from "@prisma/client";
import { requireRoles } from "@/lib/auth";

export default async function Page() {
  await connection();
  const actor = await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER]);
  const [brands, processes, employees, holidays, rules, accounts] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
    prisma.process.findMany({ include: { brand: true }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { status: "ACTIVE" }, include: { weeklyOffs: true }, orderBy: { fullName: "asc" } }),
    prisma.holiday.findMany({ include: { brand: true }, orderBy: { date: "desc" } }),
    prisma.operatingRule.findMany({ include: { process: true, brand: true }, orderBy: { effectiveFrom: "desc" } }),
    prisma.userAccount.findMany({
      select: { id: true, email: true, fullName: true, role: true, active: true, employee: { select: { fullName: true } } },
      orderBy: { email: "asc" },
    }),
  ]);
  return (
    <div className="p-4 md:p-6">
      <div className="mb-5"><h2 className="text-lg font-semibold text-[#172033]">Settings</h2><p className="mt-0.5 text-xs text-[#697586]">Company calendars and scheduling rules</p></div>
      <div className="grid gap-5 xl:grid-cols-3">
        <section className="border border-[#E5E9F0] bg-white p-4"><h3 className="mb-3 text-sm font-semibold">Public holiday</h3><form action={createHoliday} className="space-y-2"><input name="name" required placeholder="Holiday name" className="h-9 w-full rounded-md border border-[#E5E9F0] px-3 text-xs"/><input name="date" type="date" required className="h-9 w-full rounded-md border border-[#E5E9F0] px-3 text-xs"/><select name="brandId" className="h-9 w-full rounded-md border border-[#E5E9F0] px-3 text-xs"><option value="">Company-wide</option>{brands.map((brand)=><option key={brand.id} value={brand.id}>{brand.name}</option>)}</select><button className="h-9 w-full rounded-md bg-[#315EAA] text-xs font-semibold text-white">Add holiday</button></form><div className="mt-4 space-y-2">{holidays.slice(0,6).map((holiday)=><div key={holiday.id} className="flex justify-between text-[11px]"><span className="text-[#172033]">{holiday.name}</span><span className="text-[#697586]">{holiday.date.toISOString().slice(0,10)}</span></div>)}</div></section>
        <section className="border border-[#E5E9F0] bg-white p-4"><h3 className="mb-3 text-sm font-semibold">Process operating rule</h3><form action={createOperatingRule} className="space-y-2"><select name="processId" required className="h-9 w-full rounded-md border border-[#E5E9F0] px-3 text-xs">{processes.map((process)=><option key={process.id} value={process.id}>{process.brand.name} · {process.name}</option>)}</select><select name="operatingType" className="h-9 w-full rounded-md border border-[#E5E9F0] px-3 text-xs"><option value="TYPE_A_365">365-day operations</option><option value="TYPE_B_DAILY_NO_HOLIDAY">Daily except public holidays</option><option value="TYPE_C_WEEKDAY_WEEKEND">Monday-Saturday, no public holidays</option></select><input name="weeklyDays" defaultValue="0,1,2,3,4,5,6" placeholder="Working weekdays, 0-6" className="h-9 w-full rounded-md border border-[#E5E9F0] px-3 text-xs"/><input name="effectiveFrom" type="date" required className="h-9 w-full rounded-md border border-[#E5E9F0] px-3 text-xs"/><button className="h-9 w-full rounded-md bg-[#315EAA] text-xs font-semibold text-white">Save rule</button></form><div className="mt-4 space-y-2">{rules.slice(0,5).map((rule)=><div key={rule.id} className="text-[11px]"><span className="font-medium text-[#172033]">{rule.process?.name ?? rule.brand?.name}</span><span className="ml-2 text-[#697586]">{rule.operatingType}</span></div>)}</div></section>
        <section className="border border-[#E5E9F0] bg-white p-4"><h3 className="mb-3 text-sm font-semibold">Default weekly offs</h3><div className="max-h-[360px] space-y-2 overflow-auto">{employees.map((employee)=><form key={employee.id} action={setWeeklyOff} className="flex items-center gap-2"><input type="hidden" name="employeeId" value={employee.id}/><span className="min-w-0 flex-1 truncate text-[11px] text-[#172033]">{employee.fullName}</span><select name="weekday" defaultValue={String(employee.preferredOff)} className="h-8 rounded-md border border-[#E5E9F0] px-2 text-[11px]">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day,i)=><option key={day} value={i}>{day}</option>)}</select><button className="text-[10px] font-semibold text-[#315EAA]">Save</button></form>)}</div></section>
      </div>
      <section className="mt-5 border border-[#E5E9F0] bg-white p-4">
        <h3 className="mb-1 text-sm font-semibold text-[#172033]">User accounts</h3>
        <p className="mb-4 text-xs text-[#697586]">Passwords are stored as scrypt hashes. Employees and pod leads must be linked to their employee record.</p>
        <form action={createUserAccount} className="mb-5 grid gap-2 md:grid-cols-5">
          <input name="email" type="email" required placeholder="Email" className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs"/>
          <input name="fullName" required placeholder="Full name" className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs"/>
          <input name="password" type="password" minLength={12} maxLength={128} required placeholder="Temporary password (12+ chars)" className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs"/>
          <select name="role" required className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs">
            <option value={UserRole.OPERATIONS_MANAGER}>Operations Manager</option>
            <option value={UserRole.POD_LEAD}>Pod Lead</option>
            <option value={UserRole.EMPLOYEE}>Employee</option>
            {actor.role === UserRole.ADMIN && <option value={UserRole.ADMIN}>Admin</option>}
          </select>
          <select name="employeeId" className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs">
            <option value="">No employee link</option>
            {employees.map((employee)=><option key={employee.id} value={employee.id}>{employee.fullName}</option>)}
          </select>
          <button className="h-9 rounded-md bg-[#315EAA] px-4 text-xs font-semibold text-white md:col-span-5 md:justify-self-end">Create account</button>
        </form>
        <div className="divide-y divide-[#EEF1F5]">
          {accounts.map((account)=><div key={account.id} className="flex items-center gap-3 py-3 text-xs">
            <div className="min-w-0 flex-1"><div className="font-medium text-[#172033]">{account.fullName} · {account.role.replaceAll("_"," ")}</div><div className="text-[11px] text-[#697586]">{account.email}{account.employee ? ` · ${account.employee.fullName}` : ""}</div></div>
            <span className={account.active?"text-[#26755A]":"text-[#697586]"}>{account.active?"Active":"Inactive"}</span>
            <form action={setUserAccountStatus}><input type="hidden" name="userId" value={account.id}/><input type="hidden" name="active" value={String(!account.active)}/><button className="text-[11px] font-medium text-[#315EAA]">{account.active?"Deactivate":"Activate"}</button></form>
          </div>)}
          {accounts.length===0&&<p className="py-4 text-xs text-[#697586]">No accounts are provisioned yet. Use the bootstrap command to create the first Admin account.</p>}
        </div>
      </section>
    </div>
  );
}
