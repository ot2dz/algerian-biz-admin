import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import { db, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ListCompaniesResponse, CreateCompanyBody } from "@workspace/api-zod";

const router: IRouter = Router();

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars not set");
  return createClient(url, key);
}

async function getUserFromToken(authHeader: string | undefined): Promise<{ id: string; email: string } | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
}

router.get("/companies", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const companies = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.owner_id, user.id))
    .orderBy(companiesTable.created_at);

  res.json(ListCompaniesResponse.parse(
    companies.map(c => ({ ...c, created_at: c.created_at?.toISOString() }))
  ));
});

router.post("/companies", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = CreateCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [company] = await db
    .insert(companiesTable)
    .values({ ...parsed.data, owner_id: user.id })
    .returning();

  res.status(201).json({ ...company, created_at: company.created_at?.toISOString() });
});

export default router;
