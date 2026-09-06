import { execSync } from "child_process";
import { readFileSync, readdirSync, statSync, rmSync } from "fs";
import { join, extname, relative } from "path";
import { tmpdir } from "os";
import pool from "./db/index.js";
import { generateEmbeddings } from "./embeddings.js";

const SUPPORTED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".rb",
  ".php",
  ".c",
  ".cpp",
  ".h",
  ".cs",
  ".swift",
  ".kt",
  ".scala",
  ".vue",
  ".svelte",
  ".md",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".sql",
  ".sh",
  ".bash",
  ".css",
  ".scss",
  ".html",
]);

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "__pycache__",
  "vendor",
  ".venv",
  "target",
  "coverage",
  ".turbo",
]);

const MAX_FILE_SIZE = 100_000; // 100KB

interface CodeChunk {
  content: string;
  file_path: string;
  start_line: number;
  end_line: number;
  chunk_type: string;
  language: string;
}

function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".rb": "ruby",
    ".php": "php",
    ".c": "c",
    ".cpp": "cpp",
    ".h": "c",
    ".cs": "csharp",
    ".swift": "swift",
    ".kt": "kotlin",
    ".scala": "scala",
    ".vue": "vue",
    ".svelte": "svelte",
    ".md": "markdown",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".sql": "sql",
    ".sh": "shell",
    ".bash": "shell",
    ".css": "css",
    ".scss": "scss",
    ".html": "html",
  };
  return langMap[ext] || "text";
}

function chunkCode(content: string, filePath: string): CodeChunk[] {
  const language = detectLanguage(filePath);
  const lines = content.split("\n");
  const chunks: CodeChunk[] = [];

  // For small files, keep as one chunk
  if (lines.length <= 60) {
    chunks.push({
      content,
      file_path: filePath,
      start_line: 1,
      end_line: lines.length,
      chunk_type: "file",
      language,
    });
    return chunks;
  }

  // Intelligent chunking: split on function/class boundaries
  const boundaryPatterns = [
    /^(export\s+)?(async\s+)?function\s+/,
    /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/,
    /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(\s*\)\s*=>/,
    /^(export\s+)?class\s+/,
    /^(export\s+)?interface\s+/,
    /^(export\s+)?type\s+/,
    /^(export\s+)?enum\s+/,
    /^def\s+/,
    /^class\s+/,
    /^async\s+def\s+/,
    /^func\s+/,
    /^fn\s+/,
    /^pub\s+(fn|struct|enum|trait|impl)/,
    /^(public|private|protected)\s+(static\s+)?(class|void|int|string)/,
  ];

  let chunkStart = 0;
  const boundaries: number[] = [0];

  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    const indent = lines[i].length - trimmed.length;

    // Only match top-level definitions (indent 0-2)
    if (indent <= 2 && boundaryPatterns.some((p) => p.test(trimmed))) {
      boundaries.push(i);
    }
  }

  boundaries.push(lines.length);

  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    const chunkContent = lines.slice(start, end).join("\n").trim();

    if (chunkContent.length < 10) continue;

    // If chunk is too large, split into overlapping windows
    if (end - start > 100) {
      const windowSize = 60;
      const overlap = 10;
      for (let j = start; j < end; j += windowSize - overlap) {
        const windowEnd = Math.min(j + windowSize, end);
        const windowContent = lines.slice(j, windowEnd).join("\n").trim();
        if (windowContent.length < 10) continue;
        chunks.push({
          content: windowContent,
          file_path: filePath,
          start_line: j + 1,
          end_line: windowEnd,
          chunk_type: "window",
          language,
        });
        if (windowEnd >= end) break;
      }
    } else {
      chunks.push({
        content: chunkContent,
        file_path: filePath,
        start_line: start + 1,
        end_line: end,
        chunk_type: "function",
        language,
      });
    }
  }

  return chunks.length > 0
    ? chunks
    : [
        {
          content,
          file_path: filePath,
          start_line: 1,
          end_line: lines.length,
          chunk_type: "file",
          language,
        },
      ];
}

function collectFiles(dir: string, basePath: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry) || entry.startsWith(".")) continue;

    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...collectFiles(fullPath, basePath));
    } else if (
      stat.isFile() &&
      stat.size < MAX_FILE_SIZE &&
      SUPPORTED_EXTENSIONS.has(extname(entry).toLowerCase())
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

export async function ingestRepository(
  repoId: number,
  url: string
): Promise<void> {
  const cloneDir = join(tmpdir(), `eonx-repo-${repoId}-${Date.now()}`);

  try {
    console.log(`Cloning ${url}...`);
    execSync(`git clone --depth 1 ${url} ${cloneDir}`, {
      stdio: "pipe",
      timeout: 60_000,
    });

    const files = collectFiles(cloneDir, cloneDir);
    console.log(`Found ${files.length} files to index`);

    const allChunks: CodeChunk[] = [];

    for (const file of files) {
      try {
        const content = readFileSync(file, "utf-8");
        const relPath = relative(cloneDir, file);
        const chunks = chunkCode(content, relPath);
        allChunks.push(...chunks);
      } catch {
        // Skip files that can't be read
      }
    }

    console.log(`Generated ${allChunks.length} chunks, generating embeddings...`);

    // Process in batches of 50
    const batchSize = 50;
    for (let i = 0; i < allChunks.length; i += batchSize) {
      const batch = allChunks.slice(i, i + batchSize);
      const texts = batch.map(
        (c) => `File: ${c.file_path}\n${c.content}`
      );

      const { embeddings } = await generateEmbeddings(texts);

      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const embeddingStr = `[${embeddings[j].join(",")}]`;

        await pool.query(
          `INSERT INTO chunks (repo_id, content, file_path, start_line, end_line, chunk_type, language, embedding)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)`,
          [
            repoId,
            chunk.content,
            chunk.file_path,
            chunk.start_line,
            chunk.end_line,
            chunk.chunk_type,
            chunk.language,
            embeddingStr,
          ]
        );
      }

      console.log(
        `Processed ${Math.min(i + batchSize, allChunks.length)}/${allChunks.length} chunks`
      );
    }

    await pool.query(
      "UPDATE repositories SET status = $1, total_chunks = $2, indexed_at = NOW() WHERE id = $3",
      ["ready", allChunks.length, repoId]
    );

    console.log(`Repository indexed: ${allChunks.length} chunks stored`);
  } catch (err) {
    console.error("Ingestion error:", err);
    await pool.query(
      "UPDATE repositories SET status = $1, error = $2 WHERE id = $3",
      ["error", (err as Error).message, repoId]
    );
    throw err;
  } finally {
    try {
      rmSync(cloneDir, { recursive: true, force: true });
    } catch {}
  }
}
