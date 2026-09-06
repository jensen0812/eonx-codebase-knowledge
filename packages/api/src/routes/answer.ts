import { Router, Request, Response } from "express";
import OpenAI from "openai";
import { hybridSearch } from "../search.js";
import pool from "../db/index.js";
import dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post("/", async (req: Request, res: Response) => {
  try {
    const { question, repo_id, top_k = 5 } = req.body;

    if (!question || !repo_id) {
      res.status(400).json({ error: "question and repo_id are required" });
      return;
    }

    const chunks = await hybridSearch(question, repo_id, top_k);

    if (chunks.length === 0) {
      res.json({
        question,
        answer: "No relevant code found in the indexed repository.",
        citations: [],
      });
      return;
    }

    const context = chunks
      .map(
        (c, i) =>
          `[Source ${i + 1}: ${c.file_path} (lines ${c.start_line}-${c.end_line})]\n\`\`\`${c.language || ""}\n${c.content}\n\`\`\``
      )
      .join("\n\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1024,
      messages: [
        {
          role: "system",
          content:
            "You are a code expert. Answer questions about the codebase using ONLY the provided source code context. Cite your sources using [Source N] notation. If the context doesn't contain enough information, say so.",
        },
        {
          role: "user",
          content: `Context:\n${context}\n\nQuestion: ${question}`,
        },
      ],
    });

    const answerText = response.choices[0]?.message?.content || "";

    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const embeddingTokens = question.split(/\s+/).length * 2;

    // Cost estimate: GPT-4o-mini input $0.15/M, output $0.60/M, embeddings $0.02/M
    const cost =
      (inputTokens * 0.15) / 1_000_000 +
      (outputTokens * 0.6) / 1_000_000 +
      (embeddingTokens * 0.02) / 1_000_000;

    await pool.query(
      `INSERT INTO queries (question, answer, repo_id, chunks_used, input_tokens, output_tokens, embedding_tokens, total_cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        question,
        answerText,
        repo_id,
        chunks.length,
        inputTokens,
        outputTokens,
        embeddingTokens,
        cost,
      ]
    );

    res.json({
      question,
      answer: answerText,
      citations: chunks.map((c) => ({
        file_path: c.file_path,
        start_line: c.start_line,
        end_line: c.end_line,
        similarity: parseFloat(String(c.similarity)).toFixed(4),
      })),
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        embedding_tokens: embeddingTokens,
        estimated_cost: `$${cost.toFixed(6)}`,
      },
    });
  } catch (err) {
    console.error("Answer error:", err);
    res.status(500).json({ error: "Answer generation failed" });
  }
});

export default router;