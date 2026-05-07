import { pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companiesTable = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  owner_id: text("owner_id").notNull(),
  // Core
  company_name: text("company_name").notNull(),
  entity_type: text("entity_type"),          // "legal" | "natural"
  company_type: text("company_type"),         // SARL | EURL | SPA | Startup
  tax_regime: text("tax_regime"),
  has_startup_label: boolean("has_startup_label").default(false),
  // Contact
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  // Legal numbers
  nif_number: text("nif_number"),
  nis_number: text("nis_number"),
  rc_number: text("rc_number"),
  ai_number: text("ai_number"),
  tva_number: text("tva_number"),
  // Manager / natural person
  director_name: text("director_name"),
  director_id_card: text("director_id_card"),
  director_role: text("director_role"),
  activity: text("activity"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({ id: true, created_at: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
