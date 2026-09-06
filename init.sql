CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS repositories (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  indexed_at TIMESTAMPTZ,
  chunk_count INTEGER DEFAULT 0,
  total_chunks INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chunks (
  id SERIAL PRIMARY KEY,
  repo_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  chunk_index INTEGER,
  start_line INTEGER,
  end_line INTEGER,
  chunk_type TEXT,
  language TEXT,
  token_count INTEGER,
  embedding vector(1536),
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS queries (
  id SERIAL PRIMARY KEY,
  repo_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
  question TEXT,
  answer TEXT,
  query TEXT,
  mode TEXT,
  result TEXT,
  chunks_used INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  embedding_tokens INTEGER,
  total_cost NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_repo_id ON chunks(repo_id);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_queries_repo_id ON queries(repo_id);
