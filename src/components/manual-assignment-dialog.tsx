"use client";

import { CalendarClock } from "lucide-react";
import { manuallyAssignEmployee } from "@/actions/manual-roster";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface Option {
  id: string;
  label: string;
}

export function ManualAssignmentDialog({
  rosterId,
  employees,
  processes,
  month,
  year,
}: {
  rosterId: string;
  employees: Option[];
  processes: Option[];
  month: number;
  year: number;
}) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm"><CalendarClock size={14} /> Manual assignment</Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>Assign employee to process</DialogTitle></DialogHeader>
        <form action={manuallyAssignEmployee} className="space-y-3">
          <input type="hidden" name="rosterId" value={rosterId} />
          <label className="block space-y-1 text-xs font-medium text-[#697586]">
            Employee
            <select name="employeeId" required className="h-9 w-full rounded-md border border-[#E5E9F0] bg-white px-3 text-xs text-[#172033]">
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.label}</option>)}
            </select>
          </label>
          <label className="block space-y-1 text-xs font-medium text-[#697586]">
            Process
            <select name="processId" required className="h-9 w-full rounded-md border border-[#E5E9F0] bg-white px-3 text-xs text-[#172033]">
              {processes.map((process) => <option key={process.id} value={process.id}>{process.label}</option>)}
            </select>
          </label>
          <label className="block space-y-1 text-xs font-medium text-[#697586]">
            Date
            <input name="date" type="date" required min={`${year}-${String(month).padStart(2, "0")}-01`} max={`${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`} className="h-9 w-full rounded-md border border-[#E5E9F0] px-3 text-xs text-[#172033]" />
          </label>
          <p className="text-[11px] text-[#697586]">Hard constraints are checked before saving. Invalid selections create a conflict instead of an assignment.</p>
          <Button type="submit" className="w-full">Validate and assign</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
