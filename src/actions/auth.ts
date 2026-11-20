"use server";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { hashSessionToken, newSessionToken, requireRoles, SESSION_COOKIE, SESSION_DURATION_MS } from "@/lib/auth";

const emailSchema = z.string().trim().email().max(254).transform((email) => email.toLowerCase());
const passwordSchema = z.string().min(12).max(128);
const failureWindowMs = 15 * 60 * 1000;
const maxAttempts = 5;
const dummyPasswordHash = `scrypt$${Buffer.alloc(16).toString("base64url")}$${Buffer.alloc(64).toString("base64url")}`;

export type LoginState = { error: string | null };

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter a valid email and password." };

  const emailHash = createHash("sha256").update(parsed.data.email).digest("hex");
  const throttle = await prisma.loginThrottle.findUnique({ where: { emailHash } });
  const now = new Date();
  if (throttle?.blockedUntil && throttle.blockedUntil > now) {
    await verifyPassword(parsed.data.password, dummyPasswordHash);
    return { error: "Unable to sign in. Check your credentials or try again later." };
  }

  const account = await prisma.userAccount.findUnique({ where: { email: parsed.data.email } });
  const valid = account?.active
    ? await verifyPassword(parsed.data.password, account.passwordHash)
    : await verifyPassword(parsed.data.password, dummyPasswordHash);
  if (!account || !account.active || !valid) {
    await recordLoginFailure(emailHash, throttle, now);
    return { error: "Unable to sign in. Check your credentials or try again later." };
  }

  await prisma.loginThrottle.deleteMany({ where: { emailHash } });
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await prisma.userSession.create({
    data: { tokenHash: hashSessionToken(token), userId: account.id, expiresAt },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  await prisma.auditEvent.create({
    data: { actorUserId: account.id, actorName: account.fullName, action: "AUTH_LOGIN", entityType: "UserAccount", entityId: account.id, details: {} },
  });
  redirect("/");
}

export async function logout() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const session = await prisma.userSession.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      select: { id: true, userId: true, user: { select: { fullName: true } } },
    });
    if (session) {
      await prisma.$transaction([
        prisma.userSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } }),
        prisma.auditEvent.create({
          data: { actorUserId: session.userId, actorName: session.user.fullName, action: "AUTH_LOGOUT", entityType: "UserAccount", entityId: session.userId, details: {} },
        }),
      ]);
    }
  }
  store.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function changeOwnPassword(formData: FormData) {
  const actor = await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER, UserRole.POD_LEAD, UserRole.EMPLOYEE]);
  const input = z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  }).parse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  const account = await prisma.userAccount.findUnique({ where: { id: actor.id }, select: { passwordHash: true } });
  if (!account || !await verifyPassword(input.currentPassword, account.passwordHash)) {
    throw new Error("Current password is incorrect.");
  }
  const currentToken = (await cookies()).get(SESSION_COOKIE)?.value;
  const currentTokenHash = currentToken ? hashSessionToken(currentToken) : "";
  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction([
    prisma.userAccount.update({ where: { id: actor.id }, data: { passwordHash } }),
    prisma.userSession.updateMany({
      where: { userId: actor.id, revokedAt: null, tokenHash: { not: currentTokenHash } },
      data: { revokedAt: new Date() },
    }),
    prisma.auditEvent.create({
      data: {
        actorUserId: actor.id,
        actorName: actor.fullName,
        action: "AUTH_PASSWORD_CHANGED",
        entityType: "UserAccount",
        entityId: actor.id,
        details: {},
      },
    }),
  ]);
}

export async function createUserAccount(formData: FormData) {
  const actor = await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER]);
  const input = z.object({
    email: emailSchema,
    fullName: z.string().trim().min(2).max(120),
    password: passwordSchema,
    role: z.nativeEnum(UserRole),
    employeeId: z.string().optional(),
  }).parse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    password: formData.get("password"),
    role: formData.get("role"),
    employeeId: formData.get("employeeId") || undefined,
  });
  if (actor.role === UserRole.OPERATIONS_MANAGER && input.role !== UserRole.POD_LEAD && input.role !== UserRole.EMPLOYEE) {
    throw new Error("Operations Managers may create Pod Lead and Employee accounts; only Admins can grant manager roles.");
  }
  if (input.role === UserRole.ADMIN || input.role === UserRole.OPERATIONS_MANAGER) {
    if (input.employeeId) throw new Error("Manager accounts must not be linked to an employee record.");
  } else if (!input.employeeId) {
    throw new Error("Pod leads and employees must be linked to an employee record.");
  }
  if (input.employeeId) {
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId }, include: { ledPod: true } });
    if (!employee) throw new Error("Employee does not exist.");
    if (input.role === UserRole.POD_LEAD && (!employee.podId || employee.ledPod?.id !== employee.podId)) {
      throw new Error("A pod lead account must be linked to the employee who leads their pod.");
    }
  }
  const account = await prisma.userAccount.create({
    data: {
      email: input.email,
      fullName: input.fullName,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      employeeId: input.employeeId,
    },
  });
  await prisma.auditEvent.create({
    data: {
      actorUserId: actor.id,
      actorName: actor.fullName,
      action: "USER_ACCOUNT_CREATED",
      entityType: "UserAccount",
      entityId: account.id,
      details: { role: account.role, email: account.email },
    },
  });
  revalidatePath("/settings");
}

export async function setUserAccountStatus(formData: FormData) {
  const actor = await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER]);
  const input = z.object({
    userId: z.string().min(1),
    active: z.enum(["true", "false"]).transform((value) => value === "true"),
  }).parse({
    userId: formData.get("userId"),
    active: formData.get("active"),
  });
  if (input.userId === actor.id && !input.active) throw new Error("You cannot deactivate your own account.");
  const account = await prisma.userAccount.findUnique({ where: { id: input.userId }, select: { id: true, fullName: true, role: true } });
  if (!account) throw new Error("User account no longer exists.");
  if (actor.role === UserRole.OPERATIONS_MANAGER && account.role !== UserRole.POD_LEAD && account.role !== UserRole.EMPLOYEE) {
    throw new Error("Operations Managers cannot change Admin or Operations Manager accounts.");
  }
  await prisma.$transaction([
    prisma.userAccount.update({ where: { id: account.id }, data: { active: input.active } }),
    ...(input.active ? [] : [prisma.userSession.updateMany({ where: { userId: account.id, revokedAt: null }, data: { revokedAt: new Date() } })]),
    prisma.auditEvent.create({
      data: {
        actorUserId: actor.id,
        actorName: actor.fullName,
        action: input.active ? "USER_ACCOUNT_ACTIVATED" : "USER_ACCOUNT_DEACTIVATED",
        entityType: "UserAccount",
        entityId: account.id,
        details: { role: account.role },
      },
    }),
  ]);
  revalidatePath("/settings");
}

async function recordLoginFailure(
  emailHash: string,
  previous: { attempts: number; windowStartedAt: Date } | null,
  now: Date,
) {
  if (!previous || now.getTime() - previous.windowStartedAt.getTime() >= failureWindowMs) {
    await prisma.loginThrottle.upsert({
      where: { emailHash },
      create: { emailHash, attempts: 1, windowStartedAt: now },
      update: { attempts: 1, windowStartedAt: now, blockedUntil: null },
    });
    return;
  }
  const attempts = previous.attempts + 1;
  await prisma.loginThrottle.update({
    where: { emailHash },
    data: {
      attempts,
      blockedUntil: attempts >= maxAttempts ? new Date(now.getTime() + failureWindowMs) : null,
    },
  });
}
