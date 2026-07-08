/* eslint-disable no-console */
import "dotenv/config";
import { PrismaClient, PropertyType, PropertyStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const RESOURCES = [
  "dashboard", "leads", "properties", "customers", "siteVisits", "bookings",
  "tasks", "attendance", "users", "roles", "reports", "settings",
  "integrations", "files", "notifications",
];
const ACTIONS = ["view", "create", "update", "delete", "manage", "import", "export"];

const ROLE_GRANTS: Record<string, string[] | "ALL"> = {
  "Super Admin": "ALL",
  Admin: [
    "dashboard:view",
    "leads:manage", "leads:import", "leads:export",
    "properties:manage", "customers:manage", "siteVisits:manage", "bookings:manage",
    "tasks:manage", "attendance:manage", "users:manage", "roles:view",
    "reports:view", "settings:manage", "integrations:manage", "files:manage",
    "notifications:view",
  ],
  Manager: [
    "dashboard:view",
    "leads:view", "leads:create", "leads:update", "leads:export",
    "properties:view", "properties:create", "properties:update",
    "customers:view", "customers:create", "customers:update",
    "siteVisits:manage", "bookings:view", "bookings:create", "bookings:update",
    "tasks:manage", "attendance:view", "attendance:manage",
    "users:view", "reports:view", "files:create", "files:delete", "notifications:view",
  ],
  "Sales Executive": [
    "dashboard:view",
    "leads:view", "leads:create", "leads:update",
    "properties:view", "customers:view", "customers:create",
    "siteVisits:view", "siteVisits:create", "siteVisits:update",
    "bookings:view", "bookings:create",
    "tasks:view", "tasks:create", "tasks:update",
    "files:create", "notifications:view",
  ],
  Telecaller: [
    "dashboard:view",
    "leads:view", "leads:create", "leads:update",
    "properties:view", "tasks:view", "tasks:update", "notifications:view",
  ],
  Marketing: [
    "dashboard:view",
    "leads:view", "leads:create", "leads:import", "leads:export",
    "properties:view", "reports:view", "integrations:view", "integrations:update",
    "notifications:view",
  ],
  Accountant: [
    "dashboard:view",
    "bookings:view", "bookings:update", "customers:view",
    "reports:view", "notifications:view",
  ],
  Viewer: [
    "dashboard:view", "leads:view", "properties:view", "customers:view",
    "siteVisits:view", "bookings:view", "tasks:view", "reports:view",
    "notifications:view",
  ],
};

const LEAD_STATUSES = [
  { name: "New", color: "#3B82F6", order: 0 },
  { name: "Assigned", color: "#8B5CF6", order: 1 },
  { name: "Contacted", color: "#06B6D4", order: 2 },
  { name: "Interested", color: "#10B981", order: 3 },
  { name: "Follow-up", color: "#F59E0B", order: 4 },
  { name: "Site Visit", color: "#F97316", order: 5 },
  { name: "Negotiation", color: "#EC4899", order: 6 },
  { name: "Booked", color: "#22C55E", order: 7 },
  { name: "Lost", color: "#EF4444", order: 8 },
  { name: "Junk", color: "#6B7280", order: 9 },
];

const LEAD_SOURCES = [
  { name: "Facebook Ads", color: "#1877F2" },
  { name: "Google Ads", color: "#EA4335" },
  { name: "Website", color: "#3B82F6" },
  { name: "Landing Page", color: "#06B6D4" },
  { name: "WhatsApp", color: "#25D366" },
  { name: "MagicBricks", color: "#D9232E" },
  { name: "99acres", color: "#1F4692" },
  { name: "Housing", color: "#7B2CBF" },
  { name: "Referral", color: "#10B981" },
  { name: "Walk-in", color: "#F59E0B" },
  { name: "Manual", color: "#64748B" },
];

const PIPELINE_STAGES = [
  { name: "New", color: "#3B82F6", order: 0 },
  { name: "Qualified", color: "#8B5CF6", order: 1 },
  { name: "Interested", color: "#06B6D4", order: 2 },
  { name: "Visit", color: "#F97316", order: 3 },
  { name: "Negotiation", color: "#EC4899", order: 4 },
  { name: "Booking", color: "#F59E0B", order: 5 },
  { name: "Payment", color: "#14B8A6", order: 6 },
  { name: "Completed", color: "#22C55E", order: 7, isWon: true },
  { name: "Lost", color: "#EF4444", order: 8, isLost: true },
];

const INTEGRATIONS = [
  { key: "facebook_leads", name: "Facebook Lead Ads" },
  { key: "google_ads", name: "Google Ads" },
  { key: "whatsapp", name: "WhatsApp Business" },
  { key: "smtp", name: "Email (SMTP)" },
  { key: "cloudinary", name: "Cloudinary Storage" },
  { key: "webhook", name: "Inbound Webhook / n8n / Zapier" },
];

const FIRST = ["Aarav", "Vivaan", "Aditya", "Krishna", "Ishaan", "Radha", "Meera", "Ananya", "Diya", "Kavya", "Rohan", "Arjun", "Priya", "Neha", "Sanjay", "Rakesh", "Pooja", "Amit", "Deepak", "Sunita"];
const LAST = ["Sharma", "Verma", "Agarwal", "Gupta", "Singh", "Yadav", "Mishra", "Pandey", "Chaturvedi", "Goswami"];
const CITIES = ["Mathura", "Vrindavan", "Agra", "Delhi", "Noida", "Gurugram", "Jaipur", "Lucknow"];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

// Production mode: SEED_DEMO_DATA=false seeds only configuration (roles,
// permissions, statuses, sources, stages, integrations, templates) plus a
// single Super Admin from ADMIN_NAME / ADMIN_MOBILE / ADMIN_PASSWORD env vars.
const SEED_DEMO = process.env.SEED_DEMO_DATA !== "false";

async function main() {
  console.log(`🌱 Seeding Real Estate CRM… (${SEED_DEMO ? "with demo data" : "production mode"})`);

  // ---- Permissions ----
  for (const resource of RESOURCES) {
    for (const action of ACTIONS) {
      await prisma.permission.upsert({
        where: { resource_action: { resource, action } },
        create: { resource, action },
        update: {},
      });
    }
  }
  const allPermissions = await prisma.permission.findMany();
  const permId = new Map(allPermissions.map((p) => [`${p.resource}:${p.action}`, p.id]));

  // ---- Roles ----
  const roleIds = new Map<string, string>();
  for (const [name, grants] of Object.entries(ROLE_GRANTS)) {
    const role = await prisma.role.upsert({
      where: { name },
      create: { name, isSystem: true, description: `${name} role` },
      update: {},
    });
    roleIds.set(name, role.id);
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const ids =
      grants === "ALL"
        ? allPermissions.map((p) => p.id)
        : grants.map((g) => permId.get(g)).filter((x): x is string => !!x);
    await prisma.rolePermission.createMany({
      data: ids.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }

  // ---- Departments ----
  const deptNames = ["Sales", "Marketing", "Telecalling", "Accounts", "Operations"];
  const deptIds = new Map<string, string>();
  for (const name of deptNames) {
    const d = await prisma.department.upsert({ where: { name }, create: { name }, update: {} });
    deptIds.set(name, d.id);
  }

  // ---- Users ----
  if (!SEED_DEMO) {
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      const adminMobile = process.env.ADMIN_MOBILE;
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminMobile || !adminPassword) {
        throw new Error(
          "Production seed needs ADMIN_MOBILE and ADMIN_PASSWORD env vars to create the first Super Admin"
        );
      }
      if (!/^[6-9]\d{9}$/.test(adminMobile)) throw new Error("ADMIN_MOBILE must be a valid 10-digit mobile");
      if (adminPassword.length < 8) throw new Error("ADMIN_PASSWORD must be at least 8 characters");
      await prisma.user.create({
        data: {
          name: process.env.ADMIN_NAME ?? "Administrator",
          mobile: adminMobile,
          passwordHash: await bcrypt.hash(adminPassword, 10),
          roleId: roleIds.get("Super Admin")!,
          departmentId: deptIds.get("Operations"),
          designation: "Administrator",
        },
      });
      console.log(`✅ Super Admin created (mobile ${adminMobile}).`);
    } else {
      console.log(`↩︎  ${userCount} users already exist — skipping admin creation.`);
    }
  }

  const userIds: string[] = [];
  let salesUserIds: string[] = [];
  if (SEED_DEMO) {
  const password = await bcrypt.hash("Password@123", 10);
  const usersSpec = [
    { name: "Piyush Soni", mobile: "9000000001", email: "admin@crm.local", role: "Super Admin", designation: "Founder", dept: "Operations" },
    { name: "Anita Desai", mobile: "9000000002", email: "anita@crm.local", role: "Admin", designation: "Operations Head", dept: "Operations" },
    { name: "Ravi Kumar", mobile: "9000000003", email: "ravi@crm.local", role: "Manager", designation: "Sales Manager", dept: "Sales", target: 5000000 },
    { name: "Suresh Patel", mobile: "9000000004", email: "suresh@crm.local", role: "Sales Executive", designation: "Sr. Sales Executive", dept: "Sales", target: 2500000 },
    { name: "Kiran Joshi", mobile: "9000000005", email: "kiran@crm.local", role: "Sales Executive", designation: "Sales Executive", dept: "Sales", target: 2000000 },
    { name: "Megha Rani", mobile: "9000000006", email: "megha@crm.local", role: "Telecaller", designation: "Telecaller", dept: "Telecalling" },
    { name: "Vikas Jain", mobile: "9000000007", email: "vikas@crm.local", role: "Marketing", designation: "Digital Marketer", dept: "Marketing" },
    { name: "Seema Gupta", mobile: "9000000008", email: "seema@crm.local", role: "Accountant", designation: "Accountant", dept: "Accounts" },
  ];
  for (const u of usersSpec) {
    const user = await prisma.user.upsert({
      where: { mobile: u.mobile },
      create: {
        name: u.name,
        mobile: u.mobile,
        email: u.email,
        passwordHash: password,
        roleId: roleIds.get(u.role)!,
        departmentId: deptIds.get(u.dept),
        designation: u.designation,
        salesTarget: u.target,
      },
      update: { roleId: roleIds.get(u.role)! },
    });
    userIds.push(user.id);
  }
  salesUserIds = userIds.slice(2, 6); // manager + executives + telecaller

  // ---- Team ----
  const team = await prisma.team.upsert({
    where: { name: "Vrindavan Sales Team" },
    create: { name: "Vrindavan Sales Team", managerId: userIds[2] },
    update: {},
  });
  for (const uid of salesUserIds) {
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId: uid } },
      create: { teamId: team.id, userId: uid },
      update: {},
    });
  }
  } // end demo users + team

  // ---- Lead statuses / sources / pipeline ----
  const statusIds = new Map<string, string>();
  for (const s of LEAD_STATUSES) {
    const row = await prisma.leadStatusOption.upsert({
      where: { name: s.name },
      create: { ...s, isSystem: true },
      update: { color: s.color, order: s.order },
    });
    statusIds.set(s.name, row.id);
  }
  const sourceIds = new Map<string, string>();
  for (const s of LEAD_SOURCES) {
    const row = await prisma.leadSourceOption.upsert({
      where: { name: s.name },
      create: { ...s, isSystem: true },
      update: { color: s.color },
    });
    sourceIds.set(s.name, row.id);
  }
  const stageIds = new Map<string, string>();
  for (const s of PIPELINE_STAGES) {
    const row = await prisma.pipelineStage.upsert({
      where: { name: s.name },
      create: s,
      update: { color: s.color, order: s.order },
    });
    stageIds.set(s.name, row.id);
  }

  // ---- Integrations / settings / templates ----
  for (const i of INTEGRATIONS) {
    await prisma.integration.upsert({ where: { key: i.key }, create: i, update: {} });
  }
  await prisma.setting.upsert({
    where: { key: "company" },
    create: {
      key: "company",
      value: {
        name: "Vrindavan Spaces Pvt. Ltd.",
        address: "Chhatikara Road, Vrindavan, Mathura, UP 281121",
        phone: "+91 90000 00001",
        email: "hello@vrindavanspaces.in",
        gst: "09AAACB1234C1Z5",
      },
    },
    update: {},
  });
  await prisma.template.upsert({
    where: { name_type: { name: "Welcome Lead", type: "WHATSAPP" } },
    create: {
      name: "Welcome Lead",
      type: "WHATSAPP",
      body: "Namaste {{name}}! Thank you for your interest in {{project}}. Our executive will call you shortly. — Bunny Realty",
    },
    update: {},
  });
  await prisma.template.upsert({
    where: { name_type: { name: "Site Visit Confirmation", type: "EMAIL" } },
    create: {
      name: "Site Visit Confirmation",
      type: "EMAIL",
      subject: "Your site visit is confirmed — {{project}}",
      body: "Dear {{name}},\n\nYour site visit is scheduled on {{date}}. Our executive {{executive}} will assist you.\n\nWarm regards,\nBunny Realty",
    },
    update: {},
  });

  if (!SEED_DEMO) {
    console.log("✅ Production seed complete — configuration + Super Admin only, no demo data.");
    return;
  }

  // ---- Demo data (idempotent guard: skip if leads already exist) ----
  const existingLeads = await prisma.lead.count();
  if (existingLeads > 0) {
    console.log(`↩︎  Demo data already present (${existingLeads} leads) — skipping dummy data.`);
    return;
  }

  // Projects
  const projectSpecs = [
    {
      name: "Krishna Enclave", city: "Vrindavan", location: "Chhatikara Road",
      description: "Premium gated plotting township near Prem Mandir with clubhouse and parks.",
      amenities: ["Gated Security", "Clubhouse", "Kids Park", "24x7 Water", "Wide Roads"],
      priceMin: 1500000, priceMax: 6000000,
      nearby: [{ name: "Prem Mandir", distance: "2.5 km" }, { name: "NH-19", distance: "1 km" }],
    },
    {
      name: "Radha Residency", city: "Mathura", location: "Goverdhan Road",
      description: "2/3 BHK apartments with modern amenities and temple view.",
      amenities: ["Lift", "Power Backup", "Gym", "CCTV", "Covered Parking"],
      priceMin: 3200000, priceMax: 7500000,
      nearby: [{ name: "Goverdhan Chauraha", distance: "800 m" }],
    },
    {
      name: "Braj Farms", city: "Mathura", location: "Yamuna Expressway Link",
      description: "Luxury farmhouse plots along the Yamuna Expressway corridor.",
      amenities: ["Farm Fencing", "Plantation", "Security"],
      priceMin: 2500000, priceMax: 12000000,
      nearby: [{ name: "Yamuna Expressway", distance: "3 km" }],
    },
  ];
  const projectIds: string[] = [];
  for (const p of projectSpecs) {
    const proj = await prisma.project.create({
      data: { ...p, createdById: userIds[0] },
    });
    projectIds.push(proj.id);
  }

  // Properties
  const types: PropertyType[] = ["PLOT", "VILLA", "APARTMENT", "COMMERCIAL", "FARMHOUSE"];
  const propertyIds: string[] = [];
  let unit = 1;
  for (const projectId of projectIds) {
    for (let i = 0; i < 12; i++) {
      const type = rand(types);
      const price = randInt(15, 120) * 100000;
      const prop = await prisma.property.create({
        data: {
          title: `${type === "PLOT" ? "Plot" : type === "VILLA" ? "Villa" : type === "APARTMENT" ? "Apartment" : type === "COMMERCIAL" ? "Shop" : "Farm"} ${String.fromCharCode(65 + (i % 4))}-${100 + i}`,
          code: `UNIT-${String(unit++).padStart(4, "0")}`,
          projectId,
          type,
          status: (["AVAILABLE", "AVAILABLE", "AVAILABLE", "HOLD", "BOOKED", "SOLD"] as PropertyStatus[])[randInt(0, 5)],
          areaSqft: randInt(900, 4500),
          price,
          city: rand(["Mathura", "Vrindavan"]),
          facing: rand(["East", "West", "North", "South"]),
          amenities: ["Corner", "Park Facing"].slice(0, randInt(0, 2)),
          createdById: userIds[0],
          priceHistory: { create: { price, changedById: userIds[0] } },
        },
      });
      propertyIds.push(prop.id);
    }
  }

  // Leads with activities, follow-ups, site visits
  const statusNames = [...statusIds.keys()];
  const sourceNames = [...sourceIds.keys()];
  const stageNames = [...stageIds.keys()];
  const usedMobiles = new Set<string>();
  const leadIds: string[] = [];

  for (let i = 0; i < 60; i++) {
    let mobile = "";
    do {
      mobile = `9${randInt(100000000, 999999999)}`;
    } while (usedMobiles.has(mobile));
    usedMobiles.add(mobile);

    const name = `${rand(FIRST)} ${rand(LAST)}`;
    const statusName = rand(statusNames);
    const assignedToId = rand(salesUserIds);
    const createdAt = daysAgo(randInt(0, 90));

    const lead = await prisma.lead.create({
      data: {
        name,
        mobile,
        email: `${name.toLowerCase().replace(/\s+/g, ".")}${randInt(1, 99)}@example.com`,
        city: rand(CITIES),
        budget: randInt(15, 100) * 100000,
        propertySize: rand(["100 gaj", "150 gaj", "200 gaj", "1000 sq.ft.", "2000 sq.ft.", "1 bigha"]),
        requirement: rand([
          "Looking for a residential plot near Prem Mandir",
          "Wants 3BHK apartment with temple view",
          "Interested in farmhouse investment on expressway",
          "Commercial shop for sweet business",
          "Plot for retirement home, prefers gated society",
        ]),
        propertyType: rand(types),
        statusId: statusIds.get(statusName)!,
        sourceId: sourceIds.get(rand(sourceNames))!,
        stageId: stageIds.get(rand(stageNames))!,
        assignedToId,
        projectId: rand(projectIds),
        score: randInt(0, 100),
        createdById: userIds[0],
        createdAt,
        ...(statusName === "Lost" && {
          lostReason: rand(["Budget mismatch", "Bought elsewhere", "Not responding", "Location issue"]),
        }),
      },
    });
    leadIds.push(lead.id);

    await prisma.leadActivity.createMany({
      data: [
        { leadId: lead.id, userId: userIds[0], type: "CREATED", title: "Lead created", createdAt },
        {
          leadId: lead.id, userId: assignedToId, type: "CALL",
          title: rand(["Called — discussed requirement", "Called — no answer", "Called — asked to call later"]),
          createdAt: new Date(createdAt.getTime() + 3600_000),
        },
      ],
    });

    if (i % 3 === 0) {
      await prisma.followUp.create({
        data: {
          leadId: lead.id,
          assignedToId,
          dueAt: new Date(Date.now() + randInt(-3, 10) * 24 * 3600_000),
          repeat: rand(["NONE", "NONE", "DAILY", "WEEKLY"] as const),
          notes: "Discuss pricing and site visit plan",
          createdById: assignedToId,
        },
      });
    }
    if (i % 4 === 0) {
      await prisma.siteVisit.create({
        data: {
          leadId: lead.id,
          propertyId: rand(propertyIds),
          projectId: rand(projectIds),
          assignedToId,
          scheduledAt: new Date(Date.now() + randInt(-5, 14) * 24 * 3600_000),
          status: rand(["SCHEDULED", "SCHEDULED", "COMPLETED", "CANCELLED"] as const),
          createdById: userIds[2],
        },
      });
    }
  }

  // Bookings (convert a few leads)
  for (let i = 0; i < 8; i++) {
    const leadId = leadIds[i * 7];
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    const property = await prisma.property.findFirstOrThrow({
      where: { id: propertyIds[i * 4], deletedAt: null },
    });
    const customer = await prisma.customer.create({
      data: {
        leadId: lead.id,
        name: lead.name,
        mobile: lead.mobile,
        email: lead.email,
        city: lead.city,
        createdById: userIds[2],
      },
    });
    await prisma.booking.create({
      data: {
        leadId: lead.id,
        customerId: customer.id,
        propertyId: property.id,
        amount: property.price,
        tokenAmount: Number(property.price) * 0.1,
        status: rand(["CONFIRMED", "CONFIRMED", "COMPLETED", "PENDING"] as const),
        bookingDate: daysAgo(randInt(0, 150)),
        createdById: rand(salesUserIds),
      },
    });
    await prisma.property.update({ where: { id: property.id }, data: { status: "BOOKED" } });
    await prisma.lead.update({
      where: { id: lead.id },
      data: { statusId: statusIds.get("Booked")!, stageId: stageIds.get("Booking")! },
    });
  }

  // Tasks
  const taskTitles = [
    "Call back interested lead", "Prepare brochure for Krishna Enclave",
    "Follow up on token payment", "Update inventory sheet",
    "Coordinate site visit cab", "Send payment plan to customer",
    "Verify KYC documents", "Post new campaign on Facebook",
  ];
  for (let i = 0; i < 16; i++) {
    await prisma.task.create({
      data: {
        title: rand(taskTitles),
        description: "Auto-generated demo task",
        assignedToId: rand(salesUserIds),
        createdById: userIds[2],
        priority: rand(["LOW", "MEDIUM", "HIGH", "URGENT"] as const),
        status: rand(["TODO", "TODO", "IN_PROGRESS", "DONE"] as const),
        dueAt: new Date(Date.now() + randInt(-2, 10) * 24 * 3600_000),
        leadId: i % 2 === 0 ? rand(leadIds) : null,
        checklist: [
          { text: "Review lead history", done: true },
          { text: "Make the call", done: false },
        ],
      },
    });
  }

  // Attendance for the past 7 days
  for (let d = 0; d < 7; d++) {
    const day = new Date();
    day.setDate(day.getDate() - d);
    const date = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()));
    if (date.getUTCDay() === 0) continue; // Sunday off
    for (const uid of userIds) {
      if (Math.random() < 0.1) continue; // occasional absence
      const checkIn = new Date(date);
      checkIn.setUTCHours(randInt(3, 5), randInt(0, 59)); // ~9-11 IST
      const checkOut = new Date(checkIn.getTime() + randInt(7, 9) * 3600_000);
      await prisma.attendance.upsert({
        where: { userId_date: { userId: uid, date } },
        create: {
          userId: uid,
          date,
          checkInAt: checkIn,
          checkOutAt: d === 0 ? null : checkOut,
          status: checkIn.getUTCHours() >= 5 ? "LATE" : "PRESENT",
          workMinutes: d === 0 ? null : Math.round((checkOut.getTime() - checkIn.getTime()) / 60000),
        },
        update: {},
      });
    }
  }

  // Notifications
  for (const uid of salesUserIds) {
    await prisma.notification.create({
      data: {
        userId: uid,
        title: "Welcome to Real Estate CRM",
        body: "Your workspace is ready. Check today's follow-ups.",
        type: "GENERAL",
      },
    });
  }

  console.log("✅ Seed complete.");
  console.log("   Login: mobile 9000000001 / password Password@123 (Super Admin)");
  console.log("   Other demo users: 9000000002 … 9000000008 (same password)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
