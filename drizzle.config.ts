import { config } from "dotenv";

config({ path: ".env.local" });

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema/*",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
