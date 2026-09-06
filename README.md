# EonX Codebase Knowledge Service

A minimal codebase knowledge service that indexes GitHub repositories and exposes them via a REST API, MCP server, and React dashboard. Allows AI coding agents to query indexed codebases for contextual, grounded answers.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Dashboard   │────▶│   REST API   │────▶│  PostgreSQL  │
│  (React)     │     │  (Express)   │     │  + pgvector  │
└─────────────┘     └──────┬───────┘     └──────────────┘
                           │
┌─────────────┐            │
│  MCP Server  │───────────┘
│  (stdio)     │
└─────────────┘
```

**Monorepo packages:**
- `packages/api` — Express REST API with ingestion pipeline, hybrid search, and LLM-powered answers
- `packages/mcp-server` — MCP server exposing `search_codebase` and `ask_codebase` tools
- `packages/dashboard` — React + Tailwind dashboard for repo management and querying

## Key Architecture Decisions

**Intelligent code chunking:** Instead of naive line splitting, the chunker detects function/class boundaries using regex patterns for multiple languages (TypeScript, Python, Go, Rust, Java). Small files stay as single chunks. Large blocks get windowed with overlap to preserve context.

**Hybrid search (RRF):** Combines vector similarity (pgvector cosine distance) with full-text keyword matching (PostgreSQL tsvector) using Reciprocal Rank Fusion. This catches both semantically similar code and exact keyword matches that embeddings might miss.

**Embeddings model:** OpenAI `text-embedding-3-small` (1536 dimensions). Chosen for cost efficiency and quality. Each chunk is embedded with its file path prepended for better retrieval.

**Answer grounding:** The `/answer` endpoint retrieves top-k chunks via hybrid search, passes them as context to GPT-4o-mini with strict instructions to only answer from provided sources and cite with `[Source N]` notation.

**MCP over stdio:** The MCP server communicates via stdio transport (the standard for local tool servers), proxying requests to the REST API. This makes it testable with Claude Code or Cursor.

## Tradeoffs

- **Shallow clone (`--depth 1`):** Faster indexing but no git history. A production system would benefit from commit-aware chunking.
- **Batch size 50 for embeddings:** Balances API rate limits vs speed. Could be tuned based on repo size.
- **No auth on API:** Kept simple for the exercise. Production would need API keys or OAuth.
- **IVFFlat index:** Requires enough rows to be effective (lists=100). For small repos, brute-force scan is faster. A production system would use HNSW.
- **Single LLM for answers:** No fallback model configured. Production would add retry logic with a fallback provider.

## Prerequisites

- Docker and Docker Compose
- Node.js 20+
- pnpm (`npm install -g pnpm`)
- OpenAI API key (for embeddings and answer generation)

## Setup

```bash
# 1. Clone the repo
git clone <repo-url> && cd eonx-codebase-knowledge

# 2. Copy env and add your API key
cp .env.example .env
# Edit .env with your OPENAI_API_KEY

# 3. Start PostgreSQL with pgvector
docker compose up -d

# 4. Install dependencies
pnpm install

# 5. Start the API server
pnpm dev:api

# 6. Start the dashboard (separate terminal)
pnpm dev:dashboard
```

The database schema is automatically initialized via `init.sql` when the Docker container starts for the first time.

## Usage

### Dashboard

Open `http://localhost:5174` to:
1. Add a GitHub repo URL and index it
2. Switch to the Query tab, select a repo, and ask questions in Search or Answer mode
3. View query history with token costs

### API Endpoints

```bash
# Index a repository
curl -X POST http://localhost:3001/repos \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/expressjs/express"}'

# Search for code chunks
curl -X POST http://localhost:3001/query \
  -H "Content-Type: application/json" \
  -d '{"question": "How does routing work?", "repo_id": 1}'

# Get an LLM-grounded answer
curl -X POST http://localhost:3001/answer \
  -H "Content-Type: application/json" \
  -d '{"question": "How does routing work?", "repo_id": 1}'

# List repositories
curl http://localhost:3001/repos

# Query history
curl http://localhost:3001/repos/queries
```

### MCP Server (Claude Code / Cursor)

```bash
# Build the MCP server
pnpm --filter @eonx/mcp-server build

# Add to your Claude Code or Cursor MCP config:
# See mcp-config.json for the configuration
```

The MCP server exposes two tools:
- **`search_codebase`** — Returns relevant code chunks for a query with file paths and similarity scores
- **`ask_codebase`** — Returns an LLM-generated answer grounded in the codebase with citations and token costs

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript (Node.js 20+) |
| Database | PostgreSQL 16 + pgvector |
| Package Manager | pnpm workspaces |
| API | Express |
| Embeddings | OpenAI text-embedding-3-small |
| LLM (Answers) | OpenAI GPT-4o-mini |
| MCP SDK | @modelcontextprotocol/sdk |
| Frontend | React 18 + Tailwind CSS |
| Containerization | Docker Compose |
