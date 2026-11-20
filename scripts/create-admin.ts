import "dotenv/config";
import { UserRole } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const fullName = process.env.ADMIN_NAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !fullName || !password || password.length < 12 || password.length > 128) {
    throw new Error("Set ADMIN_EMAIL, ADMIN_NAME, and a 12-128 character ADMIN_PASSWORD for this command.");
  }
  const managerCount = await prisma.userAccount.count({ where: { role: { in: [UserRole.ADMIN, UserRole.OPERATIONS_MANAGER] } } });
  if (managerCount) throw new Error("An operations manager account already exists; use the Admin account management page.");
  const account = await prisma.userAccount.create({
    data: { email, fullName, passwordHash: await hashPassword(password), role: UserRole.ADMIN },
    select: { id: true, email: true, role: true },
  });
  console.log(`Created initial ${account.role} account ${account.email} (${account.id}). The password was not logged.`);
}

main()
  .catch((error) => {
    console.error("Could not create initial admin:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
