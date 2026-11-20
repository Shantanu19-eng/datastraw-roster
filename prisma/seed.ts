import { PrismaClient, OperatingType, EmployeeStatus, LeaveStatus, LeaveType } from "@prisma/client";

const prisma = new PrismaClient();

const employeeNames = [
  "Aarav Mehta","Anika Sharma","Kabir Joshi","Meera Iyer","Rohan Kapoor","Sara Nair","Vivaan Rao","Ishita Sen",
  "Arjun Pillai","Diya Reddy","Aditya Bose","Kavya Menon","Dev Malhotra","Tanvi Gupta","Neel Khanna","Aisha Khan",
  "Reyansh Das","Nisha Verma","Kunal Sethi","Priya Jain","Siddharth Roy","Ira Bhat","Dhruv Saxena","Maya Kulkarni",
  "Yash Deshmukh","Samaira Gill","Vihaan Chawla","Rhea Patil","Krishan Thakur","Navya Arora","Atharv Jain","Pari Shah",
  "Harsh Vardhan","Sneha Agarwal","Omkar Dutta","Tara Bhalla",
];

const brandNames = [
  "Aster Living", "Bloom & Co.", "Cinder Athletics", "Drift Organic", "Everleaf",
  "Forma Skincare", "Grove Foods", "Haven Furnishings", "Inara Fashion", "Juno Wellness",
  "Kite & Coast", "Lumen Home", "Morrow Market", "Nectar & Nest", "Oakline Goods",
  "Pine & Palm", "Quill Outfitters", "Riverstone", "Solstice Supply", "Terra Table",
  "Umber Studio", "Vale Essentials", "Willow Works", "Xenia Active", "Yarrow & Co.",
  "Zephyr Living", "Amber Field", "Brightwell", "Cedar & Sage", "Dawn Collective",
];

const processSpecs = [
  { name: "Customer Support", code: "CS" },
  { name: "Abandoned Cart Conversion", code: "ABAN" },
  { name: "Retention", code: "RET" },
  { name: "NDR", code: "NDR" },
] as const;

async function main() {
  const before = await getCounts();
  const podNames = ["Customer Operations", "Growth Operations", "Commerce Operations", "Retention Operations"];
  const pods = await Promise.all(podNames.map((name, i) =>
    prisma.pod.upsert({
      where: { podCode: `POD-${i + 1}` },
      update: {},
      create: { podCode: `POD-${i + 1}`, name },
    }),
  ));

  const employees = await Promise.all(employeeNames.map((fullName, i) =>
    prisma.employee.upsert({
      where: { employeeCode: `EMP-${String(i + 1).padStart(3, "0")}` },
      update: {},
      create: {
        employeeCode: `EMP-${String(i + 1).padStart(3, "0")}`,
        fullName,
        email: `${fullName.toLowerCase().replaceAll(" ", ".")}@datastraw.test`,
        phone: `+91 98${String(i).padStart(8, "0")}`,
        role: i < 4 ? "Pod Lead" : i % 5 === 0 ? "Senior Executive" : "Operations Executive",
        joiningDate: new Date(Date.UTC(2023, i % 12, 3 + (i % 18))),
        status: i === 35 ? EmployeeStatus.INACTIVE : EmployeeStatus.ACTIVE,
        preferredOff: i % 7,
        podId: pods[i % pods.length].id,
      },
    }),
  ));

  for (let i = 0; i < pods.length; i++) {
    if (!pods[i].leadId) {
      await prisma.pod.update({ where: { id: pods[i].id }, data: { leadId: employees[i].id } });
    }
  }

  const legacyBrandCodes = ["BRAND-A","BRAND-B","BRAND-C","BRAND-D","BRAND-E","BRAND-F","BRAND-G","BRAND-H","BRAND-I","BRAND-J"];
  const operatingTypes = ["TYPE_A_365", "TYPE_B_DAILY_NO_HOLIDAY", "TYPE_C_WEEKDAY_WEEKEND"] as const;
  const brands = await Promise.all(brandNames.map(async (name, i) => {
    const brandCode = i < legacyBrandCodes.length
      ? legacyBrandCodes[i]
      : `BRAND-${String(i + 1).padStart(2, "0")}`;
    const brand = await prisma.brand.upsert({
      where: { brandCode },
      update: {},
      create: {
        brandCode,
        name,
        description: `Operations workspace for ${name}`,
        podId: pods[i % pods.length].id,
      },
    });
    const existingRule = await prisma.operatingRule.findFirst({
      where: { brandId: brand.id, processId: null, effectiveFrom: new Date("2026-01-01T00:00:00Z") },
      select: { id: true },
    });
    if (!existingRule) {
      const operatingType = operatingTypes[i % operatingTypes.length];
      await prisma.operatingRule.create({
        data: {
          brandId: brand.id,
          operatingType: OperatingType[operatingType],
          weeklyDays: operatingType === "TYPE_C_WEEKDAY_WEEKEND" ? [1,2,3,4,5,6] : [0,1,2,3,4,5,6],
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
        },
      });
    }
    return brand;
  }));

  const processes = await Promise.all(brands.map(async (brand, i) => {
    const spec = processSpecs[i % processSpecs.length];
    const processCode = `${brand.brandCode}-${spec.code}`;
    const process = await prisma.process.upsert({
      where: { processCode },
      update: {},
      create: {
        processCode,
        name: spec.name,
        description: `${spec.name} operations for ${brand.name}`,
        brandId: brand.id,
        podId: pods[i % pods.length].id,
        minimumStaffing: i < 24 ? 1 : 2,
      },
    });
    const requirementExists = await prisma.coverageRequirement.findFirst({
      where: {
        processId: process.id,
        weekday: i % 7,
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      },
      select: { id: true },
    });
    if (!requirementExists) {
      await prisma.coverageRequirement.create({
        data: {
          processId: process.id,
          weekday: i % 7,
          minimumStaff: process.minimumStaffing,
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
        },
      });
    }
    return process;
  }));

  for (let brandIndex = 0; brandIndex < brands.length; brandIndex++) {
    const assignedEmployees = brandIndex < 24
      ? [employees[brandIndex]]
      : [
          employees[24 + (brandIndex - 24) * 2],
          employees[25 + (brandIndex - 24) * 2],
          employees[brandIndex - 24],
        ];
    for (const employee of assignedEmployees) {
      await prisma.employeeBrandAssignment.upsert({
        where: { employeeId_brandId: { employeeId: employee.id, brandId: brands[brandIndex].id } },
        update: {},
        create: { employeeId: employee.id, brandId: brands[brandIndex].id },
      });
      await prisma.employeeProcessAssignment.upsert({
        where: { employeeId_processId: { employeeId: employee.id, processId: processes[brandIndex].id } },
        update: {},
        create: { employeeId: employee.id, processId: processes[brandIndex].id },
      });
    }
  }

  for (let i = 0; i < employees.length; i++) {
    const existingWeeklyOff = await prisma.weeklyOff.findFirst({
      where: { employeeId: employees[i].id, effectiveFrom: new Date("2026-01-01T00:00:00Z") },
      select: { id: true },
    });
    if (!existingWeeklyOff && i < employees.length - 1) {
      await prisma.weeklyOff.create({
        data: { employeeId: employees[i].id, weekday: i % 7, effectiveFrom: new Date("2026-01-01T00:00:00Z") },
      });
    }
  }

  for (let i = 0; i < 10; i++) {
    const date = new Date(Date.UTC(2026, 10, 3 + i * 2));
    const name = i % 2 === 0 ? "National Holiday" : "Regional Holiday";
    const existingHoliday = await prisma.holiday.findFirst({ where: { name, date, brandId: null }, select: { id: true } });
    if (!existingHoliday) await prisma.holiday.create({ data: { name, date } });
  }

  await createLeaveIfMissing({
    employeeId: employees[0].id,
    leaveType: LeaveType.PLANNED,
    startDate: new Date("2026-11-19T00:00:00Z"),
    endDate: new Date("2026-11-21T00:00:00Z"),
    reason: "Planned family travel",
    status: LeaveStatus.APPROVED,
    approvedBy: "Operations Manager",
  });
  await createLeaveIfMissing({
    employeeId: employees[4].id,
    leaveType: LeaveType.SICK,
    startDate: new Date("2026-11-18T00:00:00Z"),
    endDate: new Date("2026-11-18T00:00:00Z"),
    reason: "Medical appointment",
    status: LeaveStatus.PENDING,
  });
  await createLeaveIfMissing({
    employeeId: employees[8].id,
    leaveType: LeaveType.COMP_OFF,
    startDate: new Date("2026-11-24T00:00:00Z"),
    endDate: new Date("2026-11-24T00:00:00Z"),
    reason: "Approved comp-off",
    status: LeaveStatus.APPROVED,
    approvedBy: "Operations Manager",
  });
  await createLeaveIfMissing({
    employeeId: employees[12].id,
    leaveType: LeaveType.PLANNED,
    startDate: new Date("2026-12-01T00:00:00Z"),
    endDate: new Date("2026-12-03T00:00:00Z"),
    reason: "Personal leave",
    status: LeaveStatus.PENDING,
  });

  const after = await getCounts();
  console.log(JSON.stringify({
    added: Object.fromEntries(Object.keys(after).map((key) => [
      key,
      after[key as keyof typeof after] - before[key as keyof typeof before],
    ])),
    updated: 0,
    existingRecordsPreserved: true,
  }, null, 2));
}

async function createLeaveIfMissing(data: Parameters<typeof prisma.leaveRequest.create>[0]["data"]) {
  const existing = await prisma.leaveRequest.findFirst({
    where: {
      employeeId: data.employeeId,
      leaveType: data.leaveType,
      startDate: data.startDate,
      endDate: data.endDate,
    },
    select: { id: true },
  });
  if (!existing) await prisma.leaveRequest.create({ data });
}

async function getCounts() {
  const [employees, pods, brands, processes, brandAssignments, processAssignments, weeklyOffs, holidays, leaves, rules, requirements] =
    await Promise.all([
      prisma.employee.count(),
      prisma.pod.count(),
      prisma.brand.count(),
      prisma.process.count(),
      prisma.employeeBrandAssignment.count(),
      prisma.employeeProcessAssignment.count(),
      prisma.weeklyOff.count(),
      prisma.holiday.count(),
      prisma.leaveRequest.count(),
      prisma.operatingRule.count(),
      prisma.coverageRequirement.count(),
    ]);
  return { employees, pods, brands, processes, brandAssignments, processAssignments, weeklyOffs, holidays, leaves, rules, requirements };
}

main()
  .catch((error) => {
    console.error("Additive seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
