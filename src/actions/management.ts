"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/auth";

const text = z.string().trim().min(1);

const employeeSchema = z.object({
  employeeCode: text,
  fullName: text,
  email: z.string().email(),
  phone: z.string().trim().optional(),
  role: text,
  podId: z.string().optional(),
  preferredOff: z.coerce.number().int().min(0).max(6),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export async function createEmployee(formData: FormData) {
  await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER]);
  const input = employeeSchema.parse({
    employeeCode: formData.get("employeeCode"),
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    role: formData.get("role"),
    podId: formData.get("podId") || undefined,
    preferredOff: formData.get("preferredOff"),
    status: formData.get("status"),
  });
  const brandIds = [...new Set(formData.getAll("brandIds").map((value) => text.parse(value)))];
  const processIds = [...new Set(formData.getAll("processIds").map((value) => text.parse(value)))];
  const processes = await prisma.process.findMany({ where: { id: { in: processIds } }, select: { id: true, brandId: true } });
  if (processes.length !== processIds.length) throw new Error("One or more selected processes no longer exist.");
  if (processes.some((process) => !brandIds.includes(process.brandId))) {
    throw new Error("Assign the employee to each selected process's brand as well.");
  }
  await prisma.$transaction(async (transaction) => {
    const employee = await transaction.employee.create({
      data: { ...input, podId: input.podId || null, phone: input.phone || null, joiningDate: new Date() },
    });
    await transaction.employeeBrandAssignment.createMany({ data: brandIds.map((brandId) => ({ employeeId: employee.id, brandId })) });
    await transaction.employeeProcessAssignment.createMany({ data: processIds.map((processId) => ({ employeeId: employee.id, processId })) });
  });
  revalidatePath("/employees");
}

export async function setEmployeeStatus(formData: FormData) {
  await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER]);
  const employeeId = text.parse(formData.get("employeeId"));
  const status = z.enum(["ACTIVE", "INACTIVE"]).parse(formData.get("status"));
  await prisma.employee.update({ where: { id: employeeId }, data: { status } });
  revalidatePath("/employees");
}

export async function updateEmployee(formData: FormData) {
  await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER]);
  const input = z.object({
    employeeId: text,
    employeeCode: text,
    fullName: text,
    email: z.string().email(),
    phone: z.string().trim().optional(),
    role: text,
    podId: z.string().optional(),
    preferredOff: z.coerce.number().int().min(0).max(6),
    status: z.enum(["ACTIVE", "INACTIVE"]),
  }).parse({
    employeeId: formData.get("employeeId"),
    employeeCode: formData.get("employeeCode"),
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    role: formData.get("role"),
    podId: formData.get("podId") || undefined,
    preferredOff: formData.get("preferredOff"),
    status: formData.get("status"),
  });
  const brandIds = [...new Set(formData.getAll("brandIds").map((value) => text.parse(value)))];
  const processIds = [...new Set(formData.getAll("processIds").map((value) => text.parse(value)))];
  const processes = await prisma.process.findMany({ where: { id: { in: processIds } }, select: { id: true, brandId: true } });
  if (processes.length !== processIds.length) throw new Error("One or more selected processes no longer exist.");
  if (processes.some((process) => !brandIds.includes(process.brandId))) {
    throw new Error("Assign the employee to each selected process's brand as well.");
  }

  await prisma.$transaction([
    prisma.employee.update({
      where: { id: input.employeeId },
      data: {
        employeeCode: input.employeeCode,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone || null,
        role: input.role,
        podId: input.podId || null,
        preferredOff: input.preferredOff,
        status: input.status,
      },
    }),
    prisma.employeeBrandAssignment.deleteMany({ where: { employeeId: input.employeeId } }),
    prisma.employeeBrandAssignment.createMany({ data: brandIds.map((brandId) => ({ employeeId: input.employeeId, brandId })) }),
    prisma.employeeProcessAssignment.deleteMany({ where: { employeeId: input.employeeId } }),
    prisma.employeeProcessAssignment.createMany({ data: processIds.map((processId) => ({ employeeId: input.employeeId, processId })) }),
  ]);
  revalidatePath("/employees");
  revalidatePath("/brands");
  revalidatePath("/processes");
  revalidatePath("/roster");
}

const brandSchema = z.object({
  brandCode: text,
  name: text,
  description: z.string().trim().optional(),
  podId: z.string().optional(),
  active: z.enum(["true", "false"]),
});

export async function createBrand(formData: FormData) {
  await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER]);
  const input = brandSchema.parse({
    brandCode: formData.get("brandCode"),
    name: formData.get("name"),
    description: formData.get("description"),
    podId: formData.get("podId") || undefined,
    active: formData.get("active"),
  });
  await prisma.brand.create({
    data: { brandCode: input.brandCode, name: input.name, description: input.description, podId: input.podId, active: input.active === "true" },
  });
  revalidatePath("/brands");
}

export async function setBrandStatus(formData: FormData) {
  await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER]);
  const brandId = text.parse(formData.get("brandId"));
  const active = z.enum(["true", "false"]).parse(formData.get("active")) === "true";
  await prisma.brand.update({ where: { id: brandId }, data: { active } });
  revalidatePath("/brands");
}

const processSchema = z.object({
  processCode: text,
  name: text,
  description: z.string().trim().optional(),
  brandId: text,
  podId: z.string().optional(),
  minimumStaffing: z.coerce.number().int().min(1),
  active: z.enum(["true", "false"]),
});

export async function createProcess(formData: FormData) {
  await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER]);
  const input = processSchema.parse({
    processCode: formData.get("processCode"),
    name: formData.get("name"),
    description: formData.get("description"),
    brandId: formData.get("brandId"),
    podId: formData.get("podId") || undefined,
    minimumStaffing: formData.get("minimumStaffing"),
    active: formData.get("active"),
  });
  await prisma.process.create({
    data: {
      processCode: input.processCode,
      name: input.name,
      description: input.description,
      brandId: input.brandId,
      podId: input.podId,
      minimumStaffing: input.minimumStaffing,
      active: input.active === "true",
    },
  });
  revalidatePath("/processes");
}

export async function setProcessStatus(formData: FormData) {
  await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER]);
  const processId = text.parse(formData.get("processId"));
  const active = z.enum(["true", "false"]).parse(formData.get("active")) === "true";
  await prisma.process.update({ where: { id: processId }, data: { active } });
  revalidatePath("/processes");
}

export async function createPod(formData: FormData) {
  await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER]);
  const podCode = text.parse(formData.get("podCode"));
  const name = text.parse(formData.get("name"));
  const leadId = formData.get("leadId")?.toString() || null;
  await prisma.pod.create({ data: { podCode, name, leadId: leadId || undefined } });
  revalidatePath("/pods");
}

export async function updatePod(formData: FormData) {
  await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER]);
  const podId = text.parse(formData.get("podId"));
  const name = text.parse(formData.get("name"));
  const leadId = formData.get("leadId")?.toString() || null;
  await prisma.pod.update({ where: { id: podId }, data: { name, leadId } });
  revalidatePath("/pods");
}
