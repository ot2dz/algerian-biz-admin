import { Router, type IRouter } from "express";
import { db, profilesTable, userFilesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import multer from "multer";
import * as fs from "fs";
import * as path from "path";
import crypto from "crypto";

declare const __dirname: string;

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";
const ADMIN_TOKEN = Buffer.from(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}`).toString("base64");

const USER_FILES_DIR = path.resolve(__dirname, "..", "..", "..", "attached_assets", "user_files");
const CNAS_DIR = path.resolve(__dirname, "..", "..", "..", "attached_assets", "Cnas");

if (!fs.existsSync(USER_FILES_DIR)) {
  fs.mkdirSync(USER_FILES_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, USER_FILES_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const storedName = `${crypto.randomUUID()}${ext}`;
    cb(null, storedName);
  },
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

const cnasUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, CNAS_DIR),
    filename: (_req, file, cb) => cb(null, file.originalname),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const router: IRouter = Router();

function requireAdminToken(authHeader: string | undefined): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  return token === ADMIN_TOKEN;
}

router.get("/admin/me", (req, res): void => {
  const is_admin = requireAdminToken(req.headers.authorization);
  res.json({ is_admin });
});

router.post("/admin/claim", (req, res): void => {
  const { username, password } = req.body as Record<string, unknown>;
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  res.json({ success: true, token: ADMIN_TOKEN });
});

router.get("/admin/global-files", (req, res): void => {
  if (!requireAdminToken(req.headers.authorization)) { res.status(403).json({ error: "Forbidden" }); return; }

  try {
    const entries = fs.readdirSync(CNAS_DIR, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile())
      .map((e) => {
        const stat = fs.statSync(path.join(CNAS_DIR, e.name));
        return { name: e.name, size: stat.size, lastModified: stat.mtimeMs };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json(files);
  } catch {
    res.status(500).json({ error: "Failed to list files" });
  }
});

router.post("/admin/global-files", cnasUpload.single("file"), (req, res): void => {
  if (!requireAdminToken(req.headers.authorization)) { res.status(403).json({ error: "Forbidden" }); return; }

  if (!req.file) { res.status(400).json({ error: "File required" }); return; }
  res.status(201).json({ name: req.file.filename, size: req.file.size });
});

router.patch("/admin/global-files/:filename", (req, res): void => {
  if (!requireAdminToken(req.headers.authorization)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { filename } = req.params;
  const { new_name } = req.body as Record<string, unknown>;
  if (!new_name || typeof new_name !== "string") {
    res.status(400).json({ error: "new_name string required" });
    return;
  }

  const safeOld = path.resolve(CNAS_DIR, path.basename(filename));
  const safeNew = path.resolve(CNAS_DIR, path.basename(new_name));

  if (!safeOld.startsWith(CNAS_DIR) || !safeNew.startsWith(CNAS_DIR)) {
    res.status(400).json({ error: "Invalid filename" });
    return;
  }
  if (!fs.existsSync(safeOld)) { res.status(404).json({ error: "File not found" }); return; }
  if (fs.existsSync(safeNew)) { res.status(409).json({ error: "File already exists" }); return; }

  fs.renameSync(safeOld, safeNew);
  res.json({ success: true, name: path.basename(new_name) });
});

router.delete("/admin/global-files/:filename", (req, res): void => {
  if (!requireAdminToken(req.headers.authorization)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { filename } = req.params;
  const filePath = path.resolve(CNAS_DIR, path.basename(filename));

  if (!filePath.startsWith(CNAS_DIR)) { res.status(400).json({ error: "Invalid filename" }); return; }
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: "File not found" }); return; }

  fs.unlinkSync(filePath);
  res.json({ success: true });
});

router.get("/admin/global-files/serve/:filename", (req, res): void => {
  if (!requireAdminToken(req.headers.authorization)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { filename } = req.params;
  const filePath = path.resolve(CNAS_DIR, path.basename(filename));

  if (!filePath.startsWith(CNAS_DIR) || !fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  res.sendFile(filePath);
});

router.get("/admin/users", async (req, res): Promise<void> => {
  if (!requireAdminToken(req.headers.authorization)) { res.status(403).json({ error: "Forbidden" }); return; }

  const rows = await db
    .select({
      id: profilesTable.id,
      email: profilesTable.email,
      first_name: profilesTable.first_name,
      last_name: profilesTable.last_name,
      phone: profilesTable.phone,
      full_name: profilesTable.full_name,
      company_name: profilesTable.company_name,
      nif: profilesTable.nif,
      nis: profilesTable.nis,
      is_active: profilesTable.is_active,
      created_at: profilesTable.created_at,
      file_count: sql<number>`CAST(COUNT(DISTINCT ${userFilesTable.id}) AS INT)`,
    })
    .from(profilesTable)
    .leftJoin(userFilesTable, eq(userFilesTable.owner_id, profilesTable.id))
    .groupBy(profilesTable.id)
    .orderBy(profilesTable.created_at);

  res.json(rows.map((r) => ({
    ...r,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at ?? null,
  })));
});

router.patch("/admin/users/:id/status", async (req, res): Promise<void> => {
  if (!requireAdminToken(req.headers.authorization)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { id } = req.params;
  const { is_active } = req.body;
  if (typeof is_active !== "boolean") {
    res.status(400).json({ error: "is_active boolean required" });
    return;
  }

  const [updated] = await db
    .update(profilesTable)
    .set({ is_active })
    .where(eq(profilesTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  res.json({
    ...updated,
    created_at: updated.created_at instanceof Date ? updated.created_at.toISOString() : updated.created_at,
  });
});

router.get("/admin/users/:id/files", async (req, res): Promise<void> => {
  if (!requireAdminToken(req.headers.authorization)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { id } = req.params;
  const rows = await db
    .select()
    .from(userFilesTable)
    .where(and(eq(userFilesTable.owner_id, id), eq(userFilesTable.is_active, true)))
    .orderBy(userFilesTable.created_at);

  res.json(rows.map((r) => ({
    ...r,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  })));
});

router.post("/admin/users/:id/files", upload.single("file"), async (req, res): Promise<void> => {
  if (!requireAdminToken(req.headers.authorization)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { id } = req.params;
  const file = req.file;
  if (!file) { res.status(400).json({ error: "File required" }); return; }

  const body: Record<string, unknown> = req.body;
  const category = typeof body.category === "string" ? body.category : "";
  if (!category) {
    fs.unlinkSync(file.path);
    res.status(400).json({ error: "category required" });
    return;
  }

  const [inserted] = await db
    .insert(userFilesTable)
    .values({
      owner_id: id,
      uploaded_by: "admin",
      category,
      original_name: file.originalname,
      stored_name: file.filename,
      mime_type: file.mimetype,
      size: file.size,
    } as any)
    .returning();

  res.status(201).json({
    ...inserted,
    created_at: inserted.created_at instanceof Date ? inserted.created_at.toISOString() : inserted.created_at,
  });
});

router.delete("/admin/files/:fileId", async (req, res): Promise<void> => {
  if (!requireAdminToken(req.headers.authorization)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { fileId } = req.params;
  const [updated] = await db
    .update(userFilesTable)
    .set({ is_active: false })
    .where(eq(userFilesTable.id, fileId))
    .returning();

  if (!updated) { res.status(404).json({ error: "File not found" }); return; }
  res.json({ success: true });
});

router.patch("/admin/files/:fileId", async (req, res): Promise<void> => {
  if (!requireAdminToken(req.headers.authorization)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { fileId } = req.params;
  const { original_name } = req.body;
  if (!original_name || typeof original_name !== "string") {
    res.status(400).json({ error: "original_name string required" });
    return;
  }

  const [updated] = await db
    .update(userFilesTable)
    .set({ original_name })
    .where(eq(userFilesTable.id, fileId))
    .returning();

  if (!updated) { res.status(404).json({ error: "File not found" }); return; }
  res.json({
    ...updated,
    created_at: updated.created_at instanceof Date ? updated.created_at.toISOString() : updated.created_at,
  });
});

router.get("/admin/files/serve/:storedName", (req, res): void => {
  if (!requireAdminToken(req.headers.authorization)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { storedName } = req.params;
  const filePath = path.resolve(USER_FILES_DIR, storedName);

  if (!filePath.startsWith(USER_FILES_DIR) || !fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  res.sendFile(filePath);
});

export default router;
