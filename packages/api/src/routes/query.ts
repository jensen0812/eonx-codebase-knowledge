import { Router, Request, Response } from "express";
import { hybridSearch } from "../search.js";
import pool from "../db/index.js";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    const { question, repo_id, top_k = 5 } = req.body;

    if (!question || !repo_id) {
      res.status(400).json({ error: "question and repo_id are required" });
      return;
    }

    const chunks = await hybridSearch(question, repo_id, top_k);

    // Log the query
    await pool.query(
      `INSERT INTO queries (question, repo_id, chunks_used, embedding_tokens, total_cost)
       VALUES ($1, $2, $3, $4, $5)`,
      [question, repo_id, chunks.length, 0, 0]
    );

    res.json({
      question,
      results: chunks.map((c) => ({
        content: c.content,
        file_path: c.file_path,
        start_line: c.start_line,
        end_line: c.end_line,
        chunk_type: c.chunk_type,
        language: c.language,
        similarity: parseFloat(String(c.similarity)).toFixed(4),
      })),
    });
  } catch (err) {
    console.error("Query error:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
