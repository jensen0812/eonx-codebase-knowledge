import React, { useState, useEffect } from "react";

const API = "http://localhost:3001";

interface Repo {
  id: number;
  url: string;
  name: string;
  status: string;
  total_chunks: number;
  indexed_at: string;
  error: string | null;
}

interface QueryResult {
  content: string;
  file_path: string;
  start_line: number;
  end_line: number;
  chunk_type: string;
  language: string;
  similarity: string;
}

interface AnswerResponse {
  question: string;
  answer: string;
  citations: { file_path: string; start_line: number; end_line: number; similarity: string }[];
  usage: { input_tokens: number; output_tokens: number; embedding_tokens: number; estimated_cost: string };
}

interface QueryHistory {
  id: number;
  question: string;
  answer: string;
  repo_name: string;
  chunks_used: number;
  input_tokens: number;
  output_tokens: number;
  total_cost: string;
  created_at: string;
}

type Tab = "repos" | "query" | "history";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ready: "bg-green-500/20 text-green-400",
    indexing: "bg-yellow-500/20 text-yellow-400",
    error: "bg-red-500/20 text-red-400",
    pending: "bg-gray-500/20 text-gray-400",
  };
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[status] || colors.pending}`}>
      {status}
    </span>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("repos");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoUrl, setRepoUrl] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [results, setResults] = useState<QueryResult[]>([]);
  const [answer, setAnswer] = useState<AnswerResponse | null>(null);
  const [history, setHistory] = useState<QueryHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"search" | "answer">("answer");

  useEffect(() => {
    fetchRepos();
  }, []);

  useEffect(() => {
    if (tab === "history") fetchHistory();
  }, [tab]);

  // Poll repos for status updates
  useEffect(() => {
    const hasIndexing = repos.some((r) => r.status === "indexing");
    if (!hasIndexing) return;
    const interval = setInterval(fetchRepos, 3000);
    return () => clearInterval(interval);
  }, [repos]);

    async function fetchRepos() {
    try {
      const res = await fetch(`${API}/repos`);
      const data = await res.json();
      setRepos(Array.isArray(data) ? data : []);
    } catch {}
  }

  async function fetchHistory() {
    try {
      const res = await fetch(`${API}/repos/queries`);
      setHistory(await res.json());
    } catch {}
  }

  async function addRepo() {
    if (!repoUrl) return;
    setLoading(true);
    try {
      await fetch(`${API}/repos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: repoUrl }),
      });
      setRepoUrl("");
      fetchRepos();
    } catch {}
    setLoading(false);
  }

  async function handleQuery() {
    if (!question || !selectedRepo) return;
    setLoading(true);
    setAnswer(null);
    setResults([]);

    try {
      if (mode === "search") {
        const res = await fetch(`${API}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, repo_id: selectedRepo }),
        });
        const data = await res.json();
        setResults(data.results || []);
      } else {
        const res = await fetch(`${API}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, repo_id: selectedRepo }),
        });
        const data = await res.json();
        if (data && data.answer) { setAnswer(data); } else { console.error('Answer failed:', data); }
      }
    } catch {}
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-bold text-white">EonX Codebase Knowledge</h1>
        <p className="text-sm text-gray-400">Index repositories, ask questions, get grounded answers</p>
      </header>

      <nav className="flex gap-1 px-6 pt-4">
        {(["repos", "query", "history"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-t text-sm font-medium ${
              tab === t ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            {t === "repos" ? "Repositories" : t === "query" ? "Query" : "History"}
          </button>
        ))}
      </nav>

      <main className="px-6 py-4">
        {tab === "repos" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="https://github.com/owner/repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addRepo()}
                className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={addRepo}
                disabled={loading || !repoUrl}
                className="px-6 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-500 disabled:opacity-50"
              >
                {loading ? "Adding..." : "Index"}
              </button>
            </div>

            <div className="space-y-2">
              {repos.map((repo) => (
                <div key={repo.id} className="p-4 bg-gray-900 border border-gray-800 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-white">{repo.name}</span>
                      <StatusBadge status={repo.status} />
                    </div>
                    <div className="text-sm text-gray-400 mt-1">
                      {repo.total_chunks} chunks
                      {repo.indexed_at && ` · Indexed ${new Date(repo.indexed_at).toLocaleDateString()}`}
                      {repo.error && <span className="text-red-400 ml-2">{repo.error}</span>}
                    </div>
                  </div>
                  {repo.status === "ready" && (
                    <button
                      onClick={() => { setSelectedRepo(repo.id); setTab("query"); }}
                      className="px-3 py-1 text-sm bg-gray-800 text-gray-300 rounded hover:bg-gray-700"
                    >
                      Query
                    </button>
                  )}
                </div>
              ))}
              {repos.length === 0 && (
                <p className="text-gray-500 text-center py-8">No repositories indexed yet. Add one above.</p>
              )}
            </div>
          </div>
        )}

        {tab === "query" && (
          <div className="space-y-4">
            <div className="flex gap-2 items-center">
              <select
                value={selectedRepo || ""}
                onChange={(e) => setSelectedRepo(Number(e.target.value))}
                className="px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white focus:outline-none"
              >
                <option value="">Select repository</option>
                {repos.filter((r) => r.status === "ready").map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <div className="flex bg-gray-900 border border-gray-700 rounded overflow-hidden">
                <button
                  onClick={() => setMode("search")}
                  className={`px-3 py-2 text-sm ${mode === "search" ? "bg-gray-700 text-white" : "text-gray-400"}`}
                >
                  Search
                </button>
                <button
                  onClick={() => setMode("answer")}
                  className={`px-3 py-2 text-sm ${mode === "answer" ? "bg-gray-700 text-white" : "text-gray-400"}`}
                >
                  Answer
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ask about the codebase..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleQuery()}
                className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleQuery}
                disabled={loading || !question || !selectedRepo}
                className="px-6 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-500 disabled:opacity-50"
              >
                {loading ? "Searching..." : mode === "search" ? "Search" : "Ask"}
              </button>
            </div>

            {answer && (
              <div className="space-y-3">
                <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-400 mb-2">Answer</h3>
                  <div className="text-white whitespace-pre-wrap">{answer.answer}</div>
                  <div className="mt-3 flex gap-4 text-xs text-gray-500">
                    <span>Tokens: {answer.usage.input_tokens} in / {answer.usage.output_tokens} out</span>
                    <span>Cost: {answer.usage.estimated_cost}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-400">Citations</h3>
                  {answer.citations.map((c, i) => (
                    <div key={i} className="p-3 bg-gray-900 border border-gray-800 rounded text-sm">
                      <span className="text-blue-400">{c.file_path}</span>
                      <span className="text-gray-500 ml-2">L{c.start_line}-{c.end_line}</span>
                      <span className="text-gray-600 ml-2">({c.similarity})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {results.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-400">Results ({results.length})</h3>
                {results.map((r, i) => (
                  <div key={i} className="p-4 bg-gray-900 border border-gray-800 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-blue-400 text-sm">{r.file_path}</span>
                      <div className="flex gap-2 text-xs text-gray-500">
                        <span>L{r.start_line}-{r.end_line}</span>
                        <span>{r.chunk_type}</span>
                        <span>sim: {r.similarity}</span>
                      </div>
                    </div>
                    <pre className="text-sm text-gray-300 overflow-x-auto bg-gray-950 p-3 rounded">
                      <code>{r.content}</code>
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-2">
            {history.map((q) => (
              <div key={q.id} className="p-4 bg-gray-900 border border-gray-800 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-white font-medium">{q.question}</p>
                    {q.answer && (
                      <p className="text-gray-400 text-sm mt-1 line-clamp-2">{q.answer}</p>
                    )}
                  </div>
                  <div className="text-right text-xs text-gray-500 whitespace-nowrap ml-4">
                    <div>{q.repo_name}</div>
                    <div>{new Date(q.created_at).toLocaleString()}</div>
                    <div className="mt-1">
                      {q.input_tokens + q.output_tokens} tokens · ${parseFloat(q.total_cost).toFixed(6)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {history.length === 0 && (
              <p className="text-gray-500 text-center py-8">No queries yet.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
