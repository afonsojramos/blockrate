import type { Config } from "drizzle-kit";

export default {
  schema: "./src/schema.postgres.ts",
  out: "./drizzle-postgres",
  dialect: "postgresql",
} satisfies Config;
