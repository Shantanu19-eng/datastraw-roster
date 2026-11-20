import "dotenv/config";
import { EmployeeStatus, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [employees, brands, processes, pods, leaves, rosters, conflicts, assignments, processCounts] = await Promise.all([
    prisma.employee.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.brand.findMany({
      select: { brandCode: true, name: true, _count: { select: { assignments: true, processes: true } } },
      orderBy: { brandCode: "asc" },
    }),
    prisma.process.count(),
    prisma.pod.count(),
    prisma.leaveRequest.count(),
    prisma.roster.groupBy({ by: ["month", "year", "status"], _count: { _all: true } }),
    prisma.conflict.groupBy({ by: ["status", "severity"], _count: { _all: true } }),
    prisma.employeeBrandAssignment.count(),
    prisma.process.groupBy({ by: ["name"], _count: { _all: true }, orderBy: { name: "asc" } }),
  ]);

  const employeeCounts = {
    active: employees.find((item) => item.status === EmployeeStatus.ACTIVE)?._count._all ?? 0,
    inactive: employees.find((item) => item.status === EmployeeStatus.INACTIVE)?._count._all ?? 0,
  };
  console.log(JSON.stringify({
    employees: employeeCounts,
    brands: brands.length,
    brandAssignmentRows: assignments,
    processes,
    pods,
    leaveRequests: leaves,
    rosters,
    conflicts,
    processesByName: processCounts.map(({ name, _count }) => ({ name, count: _count._all })),
    brandAssignments: brands.map(({ brandCode, name, _count }) => ({
      brandCode,
      name,
      employees: _count.assignments,
      processes: _count.processes,
    })),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error("Database audit failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
