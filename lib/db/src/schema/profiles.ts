import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const profilesTable = pgTable("profiles", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  full_name: text("full_name"),
  company_name: text("company_name"),
  nif: text("nif"),
  nis: text("nis"),
  rc: text("rc"),
  ai: text("ai"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertProfileSchema = createInsertSchema(profilesTable);
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profilesTable.$inferSelect;
