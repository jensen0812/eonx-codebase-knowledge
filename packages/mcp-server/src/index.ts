import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

const API_URL = process.env.API_URL || "http://localhost:3001";

const server = new McpServer({
  name: "eonx-codebase-knowledge",
  version: "1.0.0",
});

// Tool: search_codebase
server.tool(
  "search_codebase",
  "Search the indexed codebase for relevant code chunks matching a natural language query. Returns source file paths, line numbers, and similarity scores.",
  {
    query: z.string().describe("Natural language question about the codebase"),
    repo_id: z.number().describe("Repository ID to search in"),
    top_k: z.number().optional().default(5).describe("Number of results to return"),
  },
  async ({ query, repo_id, top_k }) => {
    try {
      const response = await fetch(`${API_URL}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query, repo_id, top_k }),
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();

      const formatted = data.results
        .map(
          (r: any, i: number) =>
            `[${i + 1}] ${r.file_path} (L${r.start_line}-${r.end_line}) [similarity: ${r.similarity}]\n\`\`\`${r.language}\n${r.content}\n\`\`\``
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${data.results.length} relevant chunks:\n\n${formatted}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Search failed: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: ask_codebase
server.tool(
  "ask_codebase",
  "Ask a question about the indexed codebase and get an LLM-generated answer grounded in the actual source code, with citations.",
  {
    question: z.string().describe("Question about the codebase"),
    repo_id: z.number().describe("Repository ID to query"),
    top_k: z.number().optional().default(5).describe("Number of context chunks to use"),
  },
  async ({ question, repo_id, top_k }) => {
    try {
      const response = await fetch(`${API_URL}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, repo_id, top_k }),
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();

      const citations = data.citations
        .map(
          (c: any, i: number) =>
            `[${i + 1}] ${c.file_path} (L${c.start_line}-${c.end_line}) [similarity: ${c.similarity}]`
        )
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `${data.answer}\n\n---\nSources:\n${citations}\n\nTokens: ${data.usage.input_tokens} in / ${data.usage.output_tokens} out | Cost: ${data.usage.estimated_cost}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Answer failed: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("EonX Codebase Knowledge MCP Server running on stdio");
}

main().catch(console.error);
