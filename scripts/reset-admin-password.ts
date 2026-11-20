import "dotenv/config";
import { createHash } from "node:crypto";
import { PrismaClient, UserRole } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 12 || password.length > 128) {
    throw new Error("Set a 12-128 character ADMIN_PASSWORD for this command.");
  }

  let account;
  if (email) {
    account = await prisma.userAccount.findUnique({
      where: { email },
      select: { id: true, email: true, fullName: true, role: true, active: true },
    });
  } else {
    const admins = await prisma.userAccount.findMany({
      where: { role: UserRole.ADMIN },
      select: { id: true, email: true, fullName: true, role: true, active: true },
    });
    if (admins.length === 1) account = admins[0];
    else if (admins.length === 0) throw new Error("No Admin account exists.");
    else throw new Error("Multiple Admin accounts exist; set ADMIN_EMAIL to select one.");
  }

  if (!account) throw new Error("The requested account does not exist.");
  if (account.role !== UserRole.ADMIN) throw new Error("The requested account is not an Admin.");
  if (!account.active) throw new Error("The Admin account is inactive; activate it before resetting its password.");

  const passwordHash = await hashPassword(password);
  const emailHash = createHash("sha256").update(account.email).digest("hex");
  await prisma.$transaction([
    prisma.userAccount.update({
      where: { id: account.id },
      data: { passwordHash },
    }),
    prisma.userSession.updateMany({
      where: { userId: account.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.loginThrottle.deleteMany({ where: { emailHash } }),
    prisma.auditEvent.create({
      data: {
        actorName: "Password recovery",
        action: "AUTH_PASSWORD_RESET",
        entityType: "UserAccount",
        entityId: account.id,
        details: {},
      },
    }),
  ]);

  console.log(`Password reset for Admin account ${account.email}. Existing sessions and login throttling were cleared.`);
}

main()
  .catch((error) => {
    console.error("Could not reset the Admin password:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
