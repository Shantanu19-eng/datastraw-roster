import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role === UserRole.EMPLOYEE) return NextResponse.json({ error: "Export is not available for employee accounts." }, { status: 403 });
  const requestedMonth = Number(request.nextUrl.searchParams.get("month"));
  const requestedYear = Number(request.nextUrl.searchParams.get("year"));
  const month = Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12 ? requestedMonth : new Date().getMonth() + 1;
  const year = Number.isInteger(requestedYear) && requestedYear >= 2024 && requestedYear <= 2100 ? requestedYear : new Date().getFullYear();
  const podId = user.role === UserRole.POD_LEAD ? user.employee?.podId ?? "__unassigned_pod_lead__" : null;
  const roster = await prisma.roster.findFirst({
    where: { month, year },
    include: {
      entries: {
        where: podId ? { OR: [{ employee: { podId } }, { process: { podId } }, { process: { brand: { podId } } }] } : {},
        include: { employee: true, process: true },
      },
    },
  });
  const rows = [["Employee ID", "Employee", "Date", "Status", "Brand", "Process"]];
  for (const entry of roster?.entries ?? []) {
    rows.push([
      entry.employee.employeeCode,
      entry.employee.fullName,
      entry.date.toISOString().slice(0, 10),
      entry.status,
      entry.brandCode ?? "",
      entry.process?.name ?? "",
    ]);
  }
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rosteriq-roster-${year}-${String(month).padStart(2, "0")}.csv"`,
    },
  });
}
