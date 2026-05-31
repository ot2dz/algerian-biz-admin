import { Router, type IRouter } from "express";
import express from "express";
import * as fs from "fs";
import * as path from "path";

declare const __dirname: string;

const router: IRouter = Router();

const CNAS_DIR = path.resolve(__dirname, "..", "..", "..", "attached_assets", "Cnas");

router.get("/files", (_req, res) => {
  try {
    const entries = fs.readdirSync(CNAS_DIR, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile())
      .map((e) => {
        const stat = fs.statSync(path.join(CNAS_DIR, e.name));
        return {
          name: e.name,
          size: stat.size,
          lastModified: stat.mtimeMs,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json(files);
  } catch (err) {
    res.status(500).json({ error: "Failed to list files" });
  }
});

router.use("/files/serve", express.static(CNAS_DIR));

export default router;
