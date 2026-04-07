import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import { db, declarationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars not set");
  return createClient(url, key);
}

async function getUserFromToken(authHeader: string | undefined): Promise<{ id: string } | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const { data, error } = await getSupabase().auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id };
}

function stripNulls<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null)) as T;
}

function serializeDeclaration(d: Record<string, unknown>) {
  return stripNulls({
    ...d,
    created_at: d.created_at instanceof Date ? d.created_at.toISOString() : d.created_at ?? null,
  });
}

router.get("/declarations", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { company_id } = req.query;
  if (!company_id || typeof company_id !== "string") {
    res.status(400).json({ error: "company_id query param required" });
    return;
  }

  const rows = await db
    .select()
    .from(declarationsTable)
    .where(and(eq(declarationsTable.owner_id, user.id), eq(declarationsTable.company_id, company_id)))
    .orderBy(declarationsTable.created_at);

  res.json(rows.map(serializeDeclaration));
});

router.post("/declarations", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const body = req.body;
  if (!body.company_id || !body.period || !body.tax_type || !body.status) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const [created] = await db
    .insert(declarationsTable)
    .values({
      owner_id: user.id,
      company_id: body.company_id,
      period: body.period,
      tax_type: body.tax_type,
      revenue: body.revenue ?? null,
      tax_rate: body.tax_rate ?? null,
      tax_amount: body.tax_amount ?? null,
      tap_amount: body.tap_amount ?? null,
      tva_amount: body.tva_amount ?? null,
      irg_amount: body.irg_amount ?? null,
      purchases: body.purchases ?? null,
      salaries: body.salaries ?? null,
      status: body.status,
      notes: body.notes ?? null,
    })
    .returning();

  res.status(201).json(serializeDeclaration(created as unknown as Record<string, unknown>));
});

router.patch("/declarations/:id", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { id } = req.params;
  const { status } = req.body;
  if (!status) { res.status(400).json({ error: "status required" }); return; }

  const [updated] = await db
    .update(declarationsTable)
    .set({ status })
    .where(and(eq(declarationsTable.id, id), eq(declarationsTable.owner_id, user.id)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeDeclaration(updated as unknown as Record<string, unknown>));
});

router.put("/declarations/:id", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { id } = req.params;
  const body = req.body;

  if (!body.period || !body.tax_type || !body.status) {
    res.status(400).json({ error: "Missing required fields: period, tax_type, status" });
    return;
  }

  const [updated] = await db
    .update(declarationsTable)
    .set({
      period:     body.period,
      tax_type:   body.tax_type,
      revenue:    body.revenue     ?? null,
      tax_rate:   body.tax_rate    ?? null,
      tax_amount: body.tax_amount  ?? null,
      tap_amount: body.tap_amount  ?? null,
      tva_amount: body.tva_amount  ?? null,
      irg_amount: body.irg_amount  ?? null,
      purchases:  body.purchases   ?? null,
      salaries:   body.salaries    ?? null,
      status:     body.status,
      notes:      body.notes       ?? null,
    })
    .where(and(eq(declarationsTable.id, id), eq(declarationsTable.owner_id, user.id)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeDeclaration(updated as unknown as Record<string, unknown>));
});

router.delete("/declarations/:id", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { id } = req.params;

  const [deleted] = await db
    .delete(declarationsTable)
    .where(and(eq(declarationsTable.id, id), eq(declarationsTable.owner_id, user.id)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).send();
});

export default router;
