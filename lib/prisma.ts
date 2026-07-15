import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7's `prisma-client` generator connects through a driver adapter
// rather than a connection-string option. The schema's datasource has no
// `url` (that's provided to the CLI via prisma.config.ts), so give the pg
// adapter the DATABASE_URL that Next.js loads from `.env`.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

export const prisma = new PrismaClient({
  adapter: new PrismaPg(connectionString),
});
