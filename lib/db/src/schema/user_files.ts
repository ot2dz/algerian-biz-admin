import { pgTable, text, timestamp, uuid, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userFilesTable = pgTable("user_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  owner_id: text("owner_id").notNull(),
  uploaded_by: text("uploaded_by").notNull(),
  category: text("category").notNull(),
  original_name: text("original_name").notNull(),
  stored_name: text("stored_name").notNull().unique(),
  mime_type: text("mime_type"),
  size: integer("size"),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertUserFileSchema = createInsertSchema(userFilesTable).omit({ id: true, created_at: true });
export const updateUserFileSchema = createInsertSchema(userFilesTable).omit({ id: true, owner_id: true, uploaded_by: true, stored_name: true, created_at: true });
export type InsertUserFile = z.infer<typeof insertUserFileSchema>;
export type UpdateUserFile = z.infer<typeof updateUserFileSchema>;
export type UserFile = typeof userFilesTable.$inferSelect;
