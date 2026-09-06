import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

export async function generateEmbeddings(
  texts: string[]
): Promise<{ embeddings: number[][]; tokens: number }> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });
  return {
    embeddings: response.data.map((d) => d.embedding),
    tokens: response.usage.total_tokens,
  };
}