import { describe, expect, it } from "vitest";
import { generateMonthlyRoster, type ScheduleEmployee, type ScheduleProcess } from "./scheduling-engine";

const employee = (overrides: Partial<ScheduleEmployee>): ScheduleEmployee => ({
  id: "employee-1",
  fullName: "Test Employee",
  preferredOff: 0,
  weeklyOffWeekdays: [0],
  unavailableDates: [],
  approvedLeaveDates: [],
  approvedCompOffDates: [],
  processIds: ["process-1"],
  brandIds: ["brand-1"],
  ...overrides,
});

const process = (overrides: Partial<ScheduleProcess> = {}): ScheduleProcess => ({
  id: "process-1",
  name: "Customer Support",
  brandId: "brand-1",
  brandCode: "BRAND-A",
  minimumStaffing: 1,
  operatingType: "TYPE_A_365",
  weeklyDays: [0, 1, 2, 3, 4, 5, 6],
  holidayDates: [],
  ...overrides,
});

describe("generateMonthlyRoster", () => {
  it("generates no assignments for a public holiday in Sunday-off operations", () => {
    const result = generateMonthlyRoster(2026, 11, [employee({})], [process({ operatingType: "TYPE_C_WEEKDAY_WEEKEND", weeklyDays: [1,2,3,4,5,6], holidayDates: ["2026-11-15"] })]);
    expect(result.assignments.some((assignment) => assignment.date === "2026-11-15")).toBe(false);
  });

  it("never assigns an employee on approved leave", () => {
    const result = generateMonthlyRoster(2026, 11, [employee({ approvedLeaveDates: ["2026-11-19"] })], [process()]);
    expect(result.assignments.some((assignment) => assignment.employeeId === "employee-1" && assignment.date === "2026-11-19")).toBe(false);
  });

  it("never assigns an employee on weekly off", () => {
    const result = generateMonthlyRoster(2026, 11, [employee({ weeklyOffWeekdays: [4] })], [process()]);
    expect(result.assignments.some((assignment) => assignment.employeeId === "employee-1" && assignment.date === "2026-11-19")).toBe(false);
  });

  it("treats a preferred weekly off as a preference rather than a hard constraint", () => {
    const result = generateMonthlyRoster(2026, 11, [employee({ preferredOff: 4, weeklyOffWeekdays: [] })], [process()]);
    expect(result.assignments.some((assignment) => assignment.date === "2026-11-19")).toBe(true);
  });

  it("does not assign one employee to two simultaneous processes on one date", () => {
    const result = generateMonthlyRoster(
      2026,
      11,
      [employee({})],
      [process(), process({ id: "process-2", name: "Retention" })],
    );
    const firstDay = result.assignments.filter((assignment) => assignment.date === "2026-11-02");
    expect(new Set(firstDay.map((assignment) => assignment.employeeId)).size).toBe(firstDay.length);
    expect(result.conflicts.some((conflict) => conflict.date === "2026-11-02")).toBe(true);
  });

  it("uses weekday-specific minimum staffing requirements", () => {
    const result = generateMonthlyRoster(
      2026,
      11,
      [employee({}), employee({ id: "employee-2", fullName: "Second Employee" })],
      [process({ coverageRequirements: [{ weekday: 1, minimumStaff: 2, effectiveFrom: "2026-01-01" }] })],
    );
    const monday = result.assignments.filter((assignment) => assignment.date === "2026-11-02");
    expect(monday).toHaveLength(2);
  });

  it("keeps 365-day processes open on holidays and closes daily-except-holiday processes", () => {
    const employees = [employee({}), employee({ id: "employee-2", fullName: "Second Employee" })];
    const holidayDate = ["2026-11-19"];
    const allDays = generateMonthlyRoster(2026, 11, employees, [process({ holidayDates: holidayDate })]);
    const closedHoliday = generateMonthlyRoster(2026, 11, employees, [process({ operatingType: "TYPE_B_DAILY_NO_HOLIDAY", holidayDates: holidayDate })]);
    expect(allDays.assignments.some((assignment) => assignment.date === holidayDate[0])).toBe(true);
    expect(closedHoliday.assignments.some((assignment) => assignment.date === holidayDate[0])).toBe(false);
  });

  it("returns a partial roster and critical gap for insufficient staffing", () => {
    const result = generateMonthlyRoster(2026, 11, [employee({ approvedLeaveDates: ["2026-11-19"] })], [process({ minimumStaffing: 2 })]);
    expect(result.valid).toBe(false);
    expect(result.conflicts.some((conflict) => conflict.date === "2026-11-19")).toBe(true);
    expect(result.filledSlots).toBeLessThan(result.requiredSlots);
  });

  it("never duplicates an employee for simultaneous coverage", () => {
    const result = generateMonthlyRoster(2026, 11, [employee({}), employee({ id: "employee-2", fullName: "Second Employee" })], [process({ minimumStaffing: 2 })]);
    const firstDay = result.assignments.filter((assignment) => assignment.date === "2026-11-01");
    expect(new Set(firstDay.map((assignment) => assignment.employeeId)).size).toBe(firstDay.length);
  });
});
