import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companiesTable = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  owner_id: text("owner_id").notNull(),
  company_name: text("company_name").notNull(),
  nif_number: text("nif_number"),
  rc_number: text("rc_number"),
  tax_regime: text("tax_regime"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({ id: true, created_at: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
