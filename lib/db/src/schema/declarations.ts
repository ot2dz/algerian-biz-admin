import { pgTable, text, timestamp, uuid, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const declarationsTable = pgTable("declarations", {
  id: uuid("id").primaryKey().defaultRandom(),
  owner_id: text("owner_id").notNull(),
  company_id: uuid("company_id").notNull(),
  period: text("period").notNull(),
  tax_type: text("tax_type").notNull(),
  revenue: numeric("revenue", { precision: 15, scale: 2 }),
  tax_rate: numeric("tax_rate", { precision: 5, scale: 4 }),
  tax_amount: numeric("tax_amount", { precision: 15, scale: 2 }),
  tap_amount: numeric("tap_amount", { precision: 15, scale: 2 }),
  tva_amount: numeric("tva_amount", { precision: 15, scale: 2 }),
  irg_amount: numeric("irg_amount", { precision: 15, scale: 2 }),
  purchases: numeric("purchases", { precision: 15, scale: 2 }),
  salaries: numeric("salaries", { precision: 15, scale: 2 }),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  payment_plan: text("payment_plan"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertDeclarationSchema = createInsertSchema(declarationsTable).omit({ id: true, created_at: true });
export type InsertDeclaration = z.infer<typeof insertDeclarationSchema>;
export type Declaration = typeof declarationsTable.$inferSelect;
