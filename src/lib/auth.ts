import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { canAccessEmployee, canAccessPod, isManager } from "@/lib/authorization";

export { canAccessEmployee, canAccessPod, hasRole, isManager } from "@/lib/authorization";

export const SESSION_COOKIE = "rosteriq_session";
export const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

export type AuthenticatedUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  employeeId: string | null;
  employee: {
    id: string;
    podId: string | null;
    ledPod: { id: string } | null;
  } | null;
};

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 128) return null;
  const session = await prisma.userSession.findFirst({
    where: { tokenHash: hashSessionToken(token), revokedAt: null, expiresAt: { gt: new Date() }, user: { active: true } },
    select: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          employeeId: true,
          employee: { select: { id: true, podId: true, ledPod: { select: { id: true } } } },
        },
      },
    },
  });
  return session?.user ?? null;
}

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRoles(roles: UserRole[]): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/forbidden");
  return user;
}

export async function assertEmployeeAccess(user: AuthenticatedUser, employeeId: string) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, podId: true } });
  if (!employee || !canAccessEmployee(user, employee.id, employee.podId)) {
    throw new Error("You are not authorized to access this employee.");
  }
  return employee;
}

export async function assertPodManager(user: AuthenticatedUser, podId: string | null) {
  if (isManager(user.role)) return;
  if (user.role !== UserRole.POD_LEAD || !canAccessPod(user, podId)) {
    throw new Error("You are not authorized to manage this pod.");
  }
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}
