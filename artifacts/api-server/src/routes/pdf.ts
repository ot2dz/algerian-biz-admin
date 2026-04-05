import { Router, type IRouter } from "express";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { createClient } from "@supabase/supabase-js";
import { db, companiesTable, declarationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

const router: IRouter = Router();

// ── Assets ──────────────────────────────────────────────────────────────────

const ASSETS_DIR = path.resolve(process.cwd(), "assets");

function loadAsset(name: string): Buffer {
  return fs.readFileSync(path.join(ASSETS_DIR, name));
}

// ── Auth helper (same pattern as other routes) ───────────────────────────────

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars not set");
  return createClient(url, key);
}

async function getUserFromToken(
  authHeader: string | undefined
): Promise<{ id: string; email: string } | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function activityFromRate(rate: string | null | undefined): "production" | "services" | "digital" {
  const r = parseFloat(rate ?? "0");
  if (r <= 0.006) return "digital";      // 0.5%
  if (r >= 0.10) return "services";      // 12%
  return "production";                    // 5%
}

function activityLabel(activity: ReturnType<typeof activityFromRate>) {
  if (activity === "services") return "Prestations de services";
  if (activity === "digital") return "Auto-entrepreneur";
  return "Production / Vente marchandises";
}

/** Format number with spaces as thousands separator (French DZ style) */
function fmtDA(n: number): string {
  if (!n || isNaN(n)) return "";
  return n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Draw value text on the form page */
function drawValue(
  page: ReturnType<PDFDocument["getPage"]>,
  text: string,
  x: number,
  y: number,
  opts: { size?: number; font: ReturnType<PDFDocument["embedFont"]> extends Promise<infer F> ? F : never }
) {
  if (!text) return;
  page.drawText(text, {
    x,
    y,
    size: opts.size ?? 9,
    font: opts.font,
    color: rgb(0, 0, 0.7),
  });
}

// ── Coordinate maps (tunable — y measured from bottom of page) ───────────────
// Page size: 595.3 × 841.9 pts  (standard A4)

/** G12 Preliminary — page 0 coordinates */
const G12_PAGE0 = {
  // Title year ("l'annee ………")
  year:              { x: 305, y: 741 },
  // Section I – Identification
  nom:               { x: 185, y: 674 },
  activite:          { x: 185, y: 658 },
  adresse_lieu:      { x: 185, y: 614 },
  adresse_domicile:  { x: 185, y: 598 },
  nif:               { x: 185, y: 582 },
  nin:               { x: 185, y: 566 },
  // Section II – Revenue table  (right side columns)
  //   Global: x≈248   Imposable: x≈314   Exonéré: x≈378   IFU dû: x≈450
  row_production:    { y: 470 },
  row_services:      { y: 440 },
  row_digital:       { y: 408 },
  col_global:        248,
  col_imposable:     314,
  col_exonere:       378,
  col_ifu:           448,
  // Totals
  total_ifu:         { x: 448, y: 382 },
  ifu_payer:         { x: 428, y: 321 },
  // Payment stub (bottom of page 0)
  pay_nif:           { x: 185, y: 198 },
  // Signature area
  sig_lieu:          { x: 80, y: 261 },
  sig_date:          { x: 185, y: 261 },
};

/** G12 Bis Final — page 0 coordinates */
const G12BIS_PAGE0 = {
  year:              { x: 305, y: 764 },
  period_from:       { x: 120, y: 742 },
  period_to:         { x: 260, y: 742 },
  // Section I
  nom:               { x: 185, y: 697 },
  activite:          { x: 185, y: 681 },
  adresse_lieu:      { x: 185, y: 637 },
  nif:               { x: 185, y: 605 },
  nin:               { x: 185, y: 589 },
  telephone:         { x: 185, y: 573 },
  // Section II – Salaries
  nb_salaries:       { x: 185, y: 548 },
  total_salaires:    { x: 185, y: 532 },
  charges_sociales:  { x: 185, y: 516 },
  irg_annuel:        { x: 185, y: 500 },
  // Section III – Revenue table (realized)
  // Realized cols: imposable_x=248, global_x=314
  // Preliminary cols: imposable_x=380, global_x=436
  // Complementary: x=490  IFU compl: x=524
  row_production:    { y: 440 },
  row_services:      { y: 408 },
  row_digital:       { y: 376 },
  col_realized_imposable: 248,
  col_realized_global:    314,
  col_prelim_imposable:   380,
  col_prelim_global:      436,
  col_complementaire:     490,
  col_ifu_comp:           524,
  // Complementary IFU total
  ifu_comp_total:    { x: 524, y: 348 },
};

// ── G12 Preliminary PDF generator ────────────────────────────────────────────

async function generateG12(
  company: { company_name: string; nif_number: string | null; rc_number: string | null },
  declaration: {
    period: string | null;
    revenue: string | null;
    tax_rate: string | null;
    tax_amount: string | null;
    irg_amount: string | null;
    salaries: string | null;
  }
): Promise<Uint8Array> {
  const templateBytes = loadAsset("g12_template.pdf");
  const fontBytes = loadAsset("arabic.ttf");

  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);

  const arabicFont = await pdfDoc.embedFont(fontBytes);
  const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const page = pdfDoc.getPage(0);

  function draw(text: string, coord: { x: number; y: number }, size = 9, arabic = false) {
    drawValue(page, text, coord.x, coord.y, { size, font: arabic ? arabicFont : latinFont });
  }

  const year = declaration.period?.substring(0, 4) ?? String(new Date().getFullYear());
  const rev = parseFloat(declaration.revenue ?? "0");
  const taxAmt = parseFloat(declaration.tax_amount ?? "0");
  const activity = activityFromRate(declaration.tax_rate);

  // ── Section header year
  draw(year, G12_PAGE0.year, 10);

  // ── Section I — Identification
  draw(company.company_name, G12_PAGE0.nom, 9, /[\u0600-\u06FF]/.test(company.company_name));
  draw(activityLabel(activity), G12_PAGE0.activite, 8);
  draw(company.nif_number ?? "", G12_PAGE0.nif, 9);

  // ── Section II — Revenue Table
  const c = G12_PAGE0;
  const rowY = activity === "production"
    ? c.row_production.y
    : activity === "services"
    ? c.row_services.y
    : c.row_digital.y;

  const revStr = fmtDA(rev);
  const taxStr = fmtDA(taxAmt);

  page.drawText(revStr, { x: c.col_global, y: rowY, size: 8, font: latinFont, color: rgb(0, 0, 0.7) });
  page.drawText(revStr, { x: c.col_imposable, y: rowY, size: 8, font: latinFont, color: rgb(0, 0, 0.7) });
  page.drawText(taxStr, { x: c.col_ifu, y: rowY, size: 8, font: latinFont, color: rgb(0, 0, 0.7) });

  // ── Totals
  draw(taxStr, c.total_ifu, 9);
  draw(taxStr, c.ifu_payer, 9);

  // ── Payment stub NIF
  draw(company.nif_number ?? "", c.pay_nif, 9);

  // ── Signature date
  draw(new Date().toLocaleDateString("fr-DZ"), c.sig_date, 8);

  return pdfDoc.save();
}

// ── G12 Bis Final PDF generator ──────────────────────────────────────────────

async function generateG12Bis(
  company: { company_name: string; nif_number: string | null },
  declaration: {
    period: string | null;
    revenue: string | null;
    tax_rate: string | null;
    tax_amount: string | null;
    salaries: string | null;
  },
  prelimRevenue?: number
): Promise<Uint8Array> {
  const templateBytes = loadAsset("g12bis_template.pdf");
  const fontBytes = loadAsset("arabic.ttf");

  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);

  const arabicFont = await pdfDoc.embedFont(fontBytes);
  const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const page = pdfDoc.getPage(0);

  function draw(text: string, coord: { x: number; y: number }, size = 9, arabic = false) {
    drawValue(page, text, coord.x, coord.y, { size, font: arabic ? arabicFont : latinFont });
  }

  const year = declaration.period?.substring(0, 4) ?? String(new Date().getFullYear());
  const rev = parseFloat(declaration.revenue ?? "0");
  const taxAmt = parseFloat(declaration.tax_amount ?? "0");
  const activity = activityFromRate(declaration.tax_rate);
  const salaries = parseFloat(declaration.salaries ?? "0");

  const c = G12BIS_PAGE0;

  // ── Header
  draw(year, c.year, 10);
  draw(`01/01/${year}`, c.period_from, 8);
  draw(`31/12/${year}`, c.period_to, 8);

  // ── Section I
  draw(company.company_name, c.nom, 9, /[\u0600-\u06FF]/.test(company.company_name));
  draw(activityLabel(activity), c.activite, 8);
  draw(company.nif_number ?? "", c.nif, 9);

  // ── Section II — Salaries (if applicable)
  if (salaries > 0) {
    draw(fmtDA(salaries), c.total_salaires, 8);
    const irg = parseFloat(declaration.tax_amount ?? "0") * 0.1;
    draw(fmtDA(irg), c.irg_annuel, 8);
  }

  // ── Section III — Revenue table
  const rowY = activity === "production"
    ? c.row_production.y
    : activity === "services"
    ? c.row_services.y
    : c.row_digital.y;

  const realizedStr = fmtDA(rev);
  const prelimStr = fmtDA(prelimRevenue ?? rev);

  // Realized column
  page.drawText(realizedStr, { x: c.col_realized_imposable, y: rowY, size: 8, font: latinFont, color: rgb(0, 0, 0.7) });

  // Preliminary column (use same if no prior G12 on file)
  page.drawText(prelimStr, { x: c.col_prelim_imposable, y: rowY, size: 8, font: latinFont, color: rgb(0, 0, 0.7) });

  // Complementary = realized - preliminary (if positive)
  const diff = rev - (prelimRevenue ?? rev);
  if (diff > 0) {
    const rate = parseFloat(declaration.tax_rate ?? "0.05");
    const compTax = Math.round(diff * rate);
    page.drawText(fmtDA(diff), { x: c.col_complementaire, y: rowY, size: 8, font: latinFont, color: rgb(0, 0, 0.7) });
    page.drawText(fmtDA(compTax), { x: c.col_ifu_comp, y: rowY, size: 8, font: latinFont, color: rgb(0, 0, 0.7) });
    draw(fmtDA(compTax), c.ifu_comp_total, 9);
  } else {
    draw(fmtDA(taxAmt), c.ifu_comp_total, 9);
  }

  return pdfDoc.save();
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.get("/generate-tax-pdf", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { declaration_id, type } = req.query as { declaration_id: string; type: string };

  if (!declaration_id) {
    res.status(400).json({ error: "declaration_id is required" });
    return;
  }

  try {
    // Fetch declaration (owned by user)
    const [declaration] = await db
      .select()
      .from(declarationsTable)
      .where(
        and(
          eq(declarationsTable.id, declaration_id),
          eq(declarationsTable.owner_id, user.id)
        )
      );

    if (!declaration) {
      res.status(404).json({ error: "Declaration not found" });
      return;
    }

    // Fetch company
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, declaration.company_id!));

    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const isG12Bis = type === "G12Bis";
    const year = declaration.period?.substring(0, 4) ?? String(new Date().getFullYear());

    const pdfBytes = isG12Bis
      ? await generateG12Bis(company, declaration)
      : await generateG12(company, declaration);

    const formType = isG12Bis ? "G12Bis" : "G12";
    const filename = `${formType}_${company.company_name}_${year}.pdf`
      .replace(/\s+/g, "_")
      .replace(/[^\w\-_.]/g, "");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBytes.length);
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

export default router;
