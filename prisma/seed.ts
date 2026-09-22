import { PrismaClient, Role, Area } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Same demo password for everyone; hashed, never stored in plain text.
  const passwordHash = await bcrypt.hash("password123", 10);

  // Driver Jashim owns the Tesla "Bullet" (3 seats), online in Banani.
  await prisma.user.upsert({
    where: { email: "jashim@teslapool.dev" },
    update: {},
    create: {
      name: "Jashim",
      email: "jashim@teslapool.dev",
      passwordHash,
      role: Role.DRIVER,
      tesla: {
        create: {
          name: "Bullet",
          capacity: 3,
          isOnline: true,
          currentArea: Area.BANANI,
        },
      },
    },
  });

  // Passengers from the brief.
  const passengers = [
    { name: "Nusrat", email: "nusrat@teslapool.dev" },
    { name: "Rafiq", email: "rafiq@teslapool.dev" },
    { name: "Shirin", email: "shirin@teslapool.dev" },
  ];

  for (const p of passengers) {
    await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: {
        name: p.name,
        email: p.email,
        passwordHash,
        role: Role.PASSENGER,
      },
    });
  }

  console.log("Seeded Jashim + Bullet and passengers Nusrat, Rafiq, Shirin.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });