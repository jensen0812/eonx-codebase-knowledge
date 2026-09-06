import { Router, Request, Response } from "express";
import pool from "../db/index.js";
import { ingestRepository } from "../ingest.js";

const router = Router();

// List all repositories
router.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT * FROM repositories ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("List repos error:", err);
    res.status(500).json({ error: "Failed to list repositories" });
  }
});

// Add and index a repository
router.post("/", async (req: Request, res: Response) => {
  try {
    const { url } = req.body;

    if (!url) {
      res.status(400).json({ error: "url is required" });
      return;
    }

    const name = url.split("/").slice(-2).join("/").replace(".git", "");

    // Check if already exists
    const existing = await pool.query(
      "SELECT * FROM repositories WHERE url = $1",
      [url]
    );
    if (existing.rows.length > 0) {
      res.status(409).json({
        error: "Repository already indexed",
        repo: existing.rows[0],
      });
      return;
    }

    const result = await pool.query(
      "INSERT INTO repositories (url, name, status) VALUES ($1, $2, $3) RETURNING *",
      [url, name, "indexing"]
    );

    const repo = result.rows[0];

    // Start indexing in background
    ingestRepository(repo.id, url).catch((err) => {
      console.error("Ingestion failed:", err);
      pool.query("UPDATE repositories SET status = $1, error = $2 WHERE id = $3", [
        "error",
        err.message,
        repo.id,
      ]);
    });

    res.status(201).json(repo);
  } catch (err) {
    console.error("Add repo error:", err);
    res.status(500).json({ error: "Failed to add repository" });
  }
});

// Get query history
router.get("/queries", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT q.*, r.name AS repo_name
       FROM queries q
       LEFT JOIN repositories r ON q.repo_id = r.id
       ORDER BY q.created_at DESC
       LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Query history error:", err);
    res.status(500).json({ error: "Failed to fetch query history" });
  }
});

export default router;
