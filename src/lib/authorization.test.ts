import { UserRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { canAccessEmployee, canAccessPod, hasRole, isManager } from "./authorization";

const podLead = {
  role: UserRole.POD_LEAD,
  employeeId: "employee-1",
  employee: { podId: "pod-1", ledPod: { id: "pod-1" } },
};

describe("role access rules", () => {
  it("allows managers across pods and employees", () => {
    const admin = { ...podLead, role: UserRole.ADMIN };
    expect(isManager(admin.role)).toBe(true);
    expect(canAccessPod(admin, "pod-other")).toBe(true);
    expect(canAccessEmployee(admin, "employee-other", null)).toBe(true);
  });

  it("limits pod leads to the pod they lead", () => {
    expect(canAccessPod(podLead, "pod-1")).toBe(true);
    expect(canAccessPod(podLead, "pod-other")).toBe(false);
    expect(canAccessEmployee(podLead, "employee-other", "pod-1")).toBe(true);
    expect(canAccessEmployee(podLead, "employee-other", "pod-other")).toBe(false);
    expect(canAccessPod({ ...podLead, employee: { podId: "pod-1", ledPod: null } }, "pod-1")).toBe(false);
  });

  it("limits employees to their own employee record", () => {
    const employee = { ...podLead, role: UserRole.EMPLOYEE };
    expect(canAccessEmployee(employee, "employee-1", "pod-1")).toBe(true);
    expect(canAccessEmployee(employee, "employee-other", "pod-1")).toBe(false);
    expect(canAccessPod(employee, "pod-1")).toBe(false);
    expect(hasRole(employee, [UserRole.EMPLOYEE])).toBe(true);
    expect(hasRole(employee, [UserRole.ADMIN])).toBe(false);
  });
});
