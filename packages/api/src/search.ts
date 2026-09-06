import pool from "./db/index.js";
import { generateEmbedding } from "./embeddings.js";

export interface ChunkResult {
  id: number;
  content: string;
  file_path: string;
  start_line: number;
  end_line: number;
  chunk_type: string;
  language: string;
  similarity: number;
}

export async function hybridSearch(
  query: string,
  repoId: number,
  topK: number = 5
): Promise<ChunkResult[]> {
  const embedding = await generateEmbedding(query);
  const embeddingStr = `[${embedding.join(",")}]`;

  // Hybrid: vector similarity + keyword matching with RRF fusion
  const result = await pool.query(
    `
    WITH vector_results AS (
      SELECT id, content, file_path, start_line, end_line, chunk_type, language,
        1 - (embedding <=> $1::vector) AS vector_score,
        ROW_NUMBER() OVER (ORDER BY embedding <=> $1::vector) AS vector_rank
      FROM chunks
      WHERE repo_id = $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3 * 2
    ),
    keyword_results AS (
      SELECT id, content, file_path, start_line, end_line, chunk_type, language,
        ts_rank(to_tsvector('english', content), plainto_tsquery('english', $4)) AS text_score,
        ROW_NUMBER() OVER (ORDER BY ts_rank(to_tsvector('english', content), plainto_tsquery('english', $4)) DESC) AS text_rank
      FROM chunks
      WHERE repo_id = $2
        AND to_tsvector('english', content) @@ plainto_tsquery('english', $4)
      LIMIT $3 * 2
    )
    SELECT
      COALESCE(v.id, k.id) AS id,
      COALESCE(v.content, k.content) AS content,
      COALESCE(v.file_path, k.file_path) AS file_path,
      COALESCE(v.start_line, k.start_line) AS start_line,
      COALESCE(v.end_line, k.end_line) AS end_line,
      COALESCE(v.chunk_type, k.chunk_type) AS chunk_type,
      COALESCE(v.language, k.language) AS language,
      COALESCE(v.vector_score, 0) AS similarity,
      (
        COALESCE(1.0 / (60 + v.vector_rank), 0) +
        COALESCE(1.0 / (60 + k.text_rank), 0)
      ) AS rrf_score
    FROM vector_results v
    FULL OUTER JOIN keyword_results k ON v.id = k.id
    ORDER BY rrf_score DESC
    LIMIT $3
    `,
    [embeddingStr, repoId, topK, query]
  );

  return result.rows;
}

export async function vectorSearch(
  query: string,
  repoId: number,
  topK: number = 5
): Promise<ChunkResult[]> {
  const embedding = await generateEmbedding(query);
  const embeddingStr = `[${embedding.join(",")}]`;

  const result = await pool.query(
    `
    SELECT id, content, file_path, start_line, end_line, chunk_type, language,
      1 - (embedding <=> $1::vector) AS similarity
    FROM chunks
    WHERE repo_id = $2
    ORDER BY embedding <=> $1::vector
    LIMIT $3
    `,
    [embeddingStr, repoId, topK]
  );

  return result.rows;
}
