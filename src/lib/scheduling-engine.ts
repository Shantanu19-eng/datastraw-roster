export type OperatingType = "TYPE_A_365" | "TYPE_B_DAILY_NO_HOLIDAY" | "TYPE_C_WEEKDAY_WEEKEND";

export interface ScheduleEmployee {
  id: string;
  fullName: string;
  preferredOff: number;
  weeklyOffWeekdays: number[];
  weeklyOffs?: { weekday: number; effectiveFrom: string; effectiveTo?: string }[];
  unavailableDates: string[];
  approvedLeaveDates: string[];
  approvedCompOffDates: string[];
  processIds: string[];
  brandIds: string[];
}

export interface ScheduleProcess {
  id: string;
  name: string;
  brandId: string;
  brandCode: string;
  minimumStaffing: number;
  operatingType: OperatingType;
  weeklyDays: number[];
  holidayDates: string[];
  coverageRequirements?: { weekday: number; minimumStaff: number; effectiveFrom: string; effectiveTo?: string }[];
  operatingRules?: { operatingType: OperatingType; weeklyDays: number[]; effectiveFrom: string; effectiveTo?: string; priority?: number }[];
}

export interface RosterAssignment {
  employeeId: string;
  processId: string;
  brandCode: string;
  date: string;
  status: "WORKING";
}

export interface SchedulingConflict {
  date: string;
  severity: "CRITICAL";
  conflictType: "INSUFFICIENT_PROCESS_STAFFING" | "NO_AVAILABLE_EMPLOYEE";
  employeeId?: string;
  processId: string;
  brandCode: string;
  description: string;
  reason: string;
  suggestion: string;
  qualifiedBackupIds: string[];
}

export interface SchedulingResult {
  assignments: RosterAssignment[];
  conflicts: SchedulingConflict[];
  valid: boolean;
  requiredSlots: number;
  filledSlots: number;
  workloadByEmployee: Record<string, number>;
}

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function processOperates(process: ScheduleProcess, date: Date): boolean {
  const key = dateKey(date);
  const weekday = date.getUTCDay();
  const activeRule = process.operatingRules
    ?.filter((rule) => rule.effectiveFrom <= key && (!rule.effectiveTo || rule.effectiveTo >= key))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || (b.priority ?? 0) - (a.priority ?? 0))[0];
  const operatingType = activeRule?.operatingType ?? process.operatingType;
  const weeklyDays = activeRule?.weeklyDays ?? process.weeklyDays;
  const isHoliday = process.holidayDates.includes(key);
  if (operatingType === "TYPE_A_365") return true;
  if (isHoliday) return false;
  if (operatingType === "TYPE_C_WEEKDAY_WEEKEND" && weekday === 0) return false;
  return weeklyDays.length === 0 || weeklyDays.includes(weekday);
}

function employeeAvailable(employee: ScheduleEmployee, process: ScheduleProcess, date: Date): boolean {
  const key = dateKey(date);
  if (!employee.processIds.includes(process.id)) return false;
  if (!employee.brandIds.includes(process.brandId)) return false;
  const weekday = date.getUTCDay();
  const explicitOffs = employee.weeklyOffs
    ? employee.weeklyOffs.some((off) => off.weekday === weekday && off.effectiveFrom <= key && (!off.effectiveTo || off.effectiveTo >= key))
    : employee.weeklyOffWeekdays.includes(weekday);
  if (explicitOffs) return false;
  if (employee.unavailableDates.includes(key)) return false;
  if (employee.approvedLeaveDates.includes(key)) return false;
  if (employee.approvedCompOffDates.includes(key)) return false;
  return true;
}

function requiredStaff(process: ScheduleProcess, date: Date): number {
  const key = dateKey(date);
  const matching = process.coverageRequirements
    ?.filter((requirement) =>
      requirement.weekday === date.getUTCDay()
      && requirement.effectiveFrom <= key
      && (!requirement.effectiveTo || requirement.effectiveTo >= key),
    )
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  return matching?.minimumStaff ?? process.minimumStaffing;
}

export function generateMonthlyRoster(
  year: number,
  month: number,
  employees: ScheduleEmployee[],
  processes: ScheduleProcess[],
): SchedulingResult {
  const assignments: RosterAssignment[] = [];
  const conflicts: SchedulingConflict[] = [];
  const workloadByEmployee: Record<string, number> = Object.fromEntries(employees.map((employee) => [employee.id, 0]));
  let requiredSlots = 0;
  let filledSlots = 0;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(Date.UTC(year, month - 1, day));
    const dateAssignments = new Set<string>();
    for (const process of processes) {
      if (!processOperates(process, date)) continue;
      const minimum = requiredStaff(process, date);
      let assignedForProcess = 0;
      for (let slot = 0; slot < minimum; slot++) {
        requiredSlots++;
        const qualified = employees.filter((employee) =>
          !dateAssignments.has(employee.id) && employeeAvailable(employee, process, date),
        );

        qualified.sort((a, b) => {
          const aPreferredOffPenalty = Number(a.preferredOff === date.getUTCDay());
          const bPreferredOffPenalty = Number(b.preferredOff === date.getUTCDay());
          const workloadDiff = ((workloadByEmployee[a.id] ?? 0) + aPreferredOffPenalty) - ((workloadByEmployee[b.id] ?? 0) + bPreferredOffPenalty);
          if (workloadDiff !== 0) return workloadDiff;
          return a.fullName.localeCompare(b.fullName);
        });

        const selected = qualified[0];
        if (selected) {
          assignments.push({
            employeeId: selected.id,
            processId: process.id,
            brandCode: process.brandCode,
            date: dateKey(date),
            status: "WORKING",
          });
          dateAssignments.add(selected.id);
          assignedForProcess++;
          workloadByEmployee[selected.id] = (workloadByEmployee[selected.id] ?? 0) + 1;
          filledSlots++;
        }
      }
      if (assignedForProcess < minimum) {
        const eligible = employees.filter((employee) => employee.processIds.includes(process.id) && employee.brandIds.includes(process.brandId));
        const currentlyAvailable = eligible.filter((employee) => employeeAvailable(employee, process, date) && !dateAssignments.has(employee.id));
        const backupIds = currentlyAvailable.map((employee) => employee.id);
        conflicts.push({
          date: dateKey(date),
          severity: "CRITICAL",
          conflictType: "INSUFFICIENT_PROCESS_STAFFING",
          processId: process.id,
          brandCode: process.brandCode,
          description: `${process.name} is short by ${minimum - assignedForProcess} of ${minimum} required employee(s).`,
          reason: `${eligible.length} employee(s) are qualified, ${currentlyAvailable.length} remain eligible and unassigned after hard constraints.`,
          suggestion: backupIds.length
            ? "Assign a listed qualified backup after confirming their other coverage."
            : "Add a qualified employee or revise the staffing requirement with operational approval.",
          qualifiedBackupIds: backupIds,
        });
      }
    }
  }

  return {
    assignments,
    conflicts,
    valid: conflicts.length === 0,
    requiredSlots,
    filledSlots,
    workloadByEmployee,
  };
}
