import { UserRole } from "@prisma/client";

type AuthorizationUser = {
  role: UserRole;
  employeeId: string | null;
  employee: {
    podId: string | null;
    ledPod: { id: string } | null;
  } | null;
};

export function isManager(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.OPERATIONS_MANAGER;
}

export function hasRole(user: AuthorizationUser, roles: UserRole[]): boolean {
  return roles.includes(user.role);
}

export function canAccessPod(user: AuthorizationUser, podId: string | null): boolean {
  if (isManager(user.role)) return true;
  return user.role === UserRole.POD_LEAD
    && Boolean(podId)
    && user.employee?.podId === podId
    && user.employee.ledPod?.id === podId;
}

export function canAccessEmployee(user: AuthorizationUser, employeeId: string, podId: string | null): boolean {
  if (isManager(user.role)) return true;
  if (user.role === UserRole.POD_LEAD) return canAccessPod(user, podId);
  return user.role === UserRole.EMPLOYEE && user.employeeId === employeeId;
}
