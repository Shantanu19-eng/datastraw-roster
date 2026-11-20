import { createEmployee, updateEmployee } from "@/actions/management";

interface EmployeeFormData {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string;
  podId: string | null;
  preferredOff: number;
  status: "ACTIVE" | "INACTIVE";
  brandIds: string[];
  processIds: string[];
}

interface Option {
  id: string;
  name: string;
}

interface ProcessOption extends Option {
  brandName: string;
  brandId: string;
}

export function EmployeeForm({
  employee,
  pods,
  brands,
  processes,
}: {
  employee?: EmployeeFormData;
  pods: Option[];
  brands: Option[];
  processes: ProcessOption[];
}) {
  const action = employee ? updateEmployee : createEmployee;
  return (
    <form action={action} className="grid grid-cols-2 gap-3">
      {employee && <input type="hidden" name="employeeId" value={employee.id}/>}
      <input name="employeeCode" required defaultValue={employee?.employeeCode} placeholder="Employee ID" className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs"/>
      <input name="fullName" required defaultValue={employee?.fullName} placeholder="Full name" className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs"/>
      <input name="email" type="email" required defaultValue={employee?.email} placeholder="Email" className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs"/>
      <input name="phone" defaultValue={employee?.phone ?? ""} placeholder="Phone" className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs"/>
      <input name="role" required defaultValue={employee?.role} placeholder="Role" className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs"/>
      <select name="podId" defaultValue={employee?.podId ?? ""} className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs">
        <option value="">No pod</option>{pods.map((pod)=><option key={pod.id} value={pod.id}>{pod.name}</option>)}
      </select>
      <select name="preferredOff" defaultValue={String(employee?.preferredOff ?? 0)} className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day,index)=><option key={day} value={index}>Preferred off: {day}</option>)}
      </select>
      <select name="status" defaultValue={employee?.status ?? "ACTIVE"} className="h-9 rounded-md border border-[#E5E9F0] px-3 text-xs">
        <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
      </select>
      <fieldset className="col-span-2 rounded-md border border-[#E5E9F0] p-3">
        <legend className="px-1 text-[11px] font-semibold text-[#697586]">Brand assignments</legend>
        <div className="grid max-h-32 grid-cols-2 gap-2 overflow-auto">
          {brands.map((brand)=><label key={brand.id} className="flex items-center gap-2 text-[11px]"><input type="checkbox" name="brandIds" value={brand.id} defaultChecked={employee?.brandIds.includes(brand.id)}/>{brand.name}</label>)}
        </div>
      </fieldset>
      <fieldset className="col-span-2 rounded-md border border-[#E5E9F0] p-3">
        <legend className="px-1 text-[11px] font-semibold text-[#697586]">Process assignments</legend>
        <div className="grid max-h-40 grid-cols-2 gap-2 overflow-auto">
          {processes.map((process)=><label key={process.id} className="flex items-center gap-2 text-[11px]"><input type="checkbox" name="processIds" value={process.id} defaultChecked={employee?.processIds.includes(process.id)}/>{process.brandName} · {process.name}</label>)}
        </div>
      </fieldset>
      <button className="col-span-2 h-9 rounded-md bg-[#315EAA] text-xs font-semibold text-white">{employee ? "Save employee" : "Create employee"}</button>
    </form>
  );
}
