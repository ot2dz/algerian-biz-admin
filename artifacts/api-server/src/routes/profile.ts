import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import { db, profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetProfileResponse, UpdateProfileBody, UpdateProfileResponse } from "@workspace/api-zod";

function stripNulls<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null)
  ) as T;
}

const router: IRouter = Router();

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase env vars not set");
  }
  return createClient(supabaseUrl, supabaseKey);
}

async function getUserFromToken(authHeader: string | undefined): Promise<{ id: string; email: string } | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
}

router.get("/profile", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.id, user.id));

  if (!profile) {
    const [created] = await db
      .insert(profilesTable)
      .values({ id: user.id, email: user.email })
      .returning();
    profile = created;
  }

  res.json(GetProfileResponse.parse(stripNulls({
    ...profile,
    created_at: profile.created_at?.toISOString() ?? null,
  })));
});

router.put("/profile", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.id, user.id));

  let profile;
  if (existing.length === 0) {
    const [created] = await db
      .insert(profilesTable)
      .values({ id: user.id, email: user.email, ...parsed.data })
      .returning();
    profile = created;
  } else {
    const [updated] = await db
      .update(profilesTable)
      .set(parsed.data)
      .where(eq(profilesTable.id, user.id))
      .returning();
    profile = updated;
  }

  res.json(UpdateProfileResponse.parse(stripNulls({
    ...profile,
    created_at: profile.created_at?.toISOString() ?? null,
  })));
});

export default router;
