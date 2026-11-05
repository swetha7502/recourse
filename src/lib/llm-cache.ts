import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { llmCache } from "../db/schema";
import { canonicalize } from "./intents";
import { llm, type Llm } from "./llm";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

export async function readCache<T>(key: string): Promise<T | null> {
  const [row] = await getDb().select().from(llmCache).where(eq(llmCache.key, key));
  return row ? (row.value as T) : null;
}

export async function writeCache(key: string, kind: string, value: unknown) {
  await getDb().insert(llmCache).values({ key, kind, value }).onConflictDoNothing();
}

// The key covers system prompt, evidence and schema, so a prompt change is a cache miss.
export function withCache(base: Llm): Llm {
  return {
    ...base,
    async generateJson<T>(request: Parameters<Llm["generateJson"]>[0]) {
      const key = `json:${sha256(JSON.stringify([request.system, request.prompt, request.schema]))}`;
      const hit = await readCache<T>(key);
      if (hit !== null) return hit;
      const value = await base.generateJson<T>(request);
      await writeCache(key, "json", value);
      return value;
    },
  };
}

export const cachedLlm = withCache(llm);

export const agentCacheKey = (instruction: string, constraints: unknown) =>
  `agent:${sha256(JSON.stringify([instruction, canonicalize(constraints)]))}`;
