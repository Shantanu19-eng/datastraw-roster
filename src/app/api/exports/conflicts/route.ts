import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role === UserRole.EMPLOYEE) return NextResponse.json({ error: "Export is not available for employee accounts." }, { status: 403 });
  const podId = user.role === UserRole.POD_LEAD ? user.employee?.podId ?? "__unassigned_pod_lead__" : null;
  const conflicts = await prisma.conflict.findMany({
    where: podId ? { OR: [{ employee: { podId } }, { process: { podId } }, { process: { brand: { podId } } }] } : {},
    include: { employee: true, process: true },
  });
  const rows = [["Severity","Status","Type","Date","Employee","Brand","Process","Description","Reason","Suggestion"]];
  for (const conflict of conflicts) rows.push([
    conflict.severity,
    conflict.status,
    conflict.conflictType,
    conflict.date.toISOString().slice(0,10),
    conflict.employee?.fullName ?? "",
    conflict.brandCode ?? "",
    conflict.process?.name ?? "",
    conflict.description,
    conflict.reason,
    conflict.suggestion,
  ]);
  const csv = rows.map((row)=>row.map((value)=>`"${String(value).replaceAll('"','""')}"`).join(",")).join("\n");
  return new NextResponse(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=\"datastraw-conflicts.csv\""}});
}
