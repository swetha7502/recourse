import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { llmUsage } from "../db/schema";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Free-tier quotas are per model per day, so the app falls through this list when one runs out.
const DEFAULT_MODELS = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"];
const EXHAUSTED_COOLDOWN_MS = 60 * 60_000;
const MAX_ATTEMPTS = 6;
const REQUEST_TIMEOUT_MS = 45_000;
const RETRYABLE = new Set([429, 500, 503]);

export type JsonSchema = Record<string, unknown>;

export type LlmTool = {
  name: string;
  description: string;
  parameters: JsonSchema;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
};

export type ToolStep = { tool: string; args: Record<string, unknown>; result: unknown };

export type Llm = {
  generateJson<T>(request: {
    system: string;
    prompt: string;
    schema: JsonSchema;
    temperature?: number;
  }): Promise<T>;
  runTools(request: {
    system: string;
    prompt: string;
    tools: LlmTool[];
    maxTurns?: number;
  }): Promise<{ text: string; steps: ToolStep[] }>;
};

type GeminiPart = {
  text?: string;
  thought?: boolean;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
};
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };
type GeminiResponse = {
  candidates?: { content?: GeminiContent; finishReason?: string }[];
  error?: {
    message?: string;
    details?: { retryDelay?: string; violations?: { quotaId?: string }[] }[];
  };
};

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

function retryDelayMs(body: GeminiResponse, attempt: number): number {
  const hinted = body.error?.details?.find((d) => d.retryDelay)?.retryDelay;
  const seconds = hinted ? Number.parseFloat(hinted) : NaN;
  const backoff = 2 ** attempt * 1000 + Math.random() * 500;
  return Number.isFinite(seconds) ? seconds * 1000 + 500 : backoff;
}

const exhaustedUntil = new Map<string, number>();

// Gemini's daily quota resets at midnight Pacific.
export const quotaDay = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

async function recordUsage(model: string) {
  try {
    await getDb()
      .insert(llmUsage)
      .values({ day: quotaDay(), model, calls: 1 })
      .onConflictDoUpdate({
        target: [llmUsage.day, llmUsage.model],
        set: { calls: sql`${llmUsage.calls} + 1` },
      });
  } catch (error) {
    console.warn("[llm] usage not recorded:", error instanceof Error ? error.message : error);
  }
}

function configuredModels(): string[] {
  const list = process.env.GEMINI_MODELS?.split(",").map((m) => m.trim()).filter(Boolean);
  return list?.length ? list : DEFAULT_MODELS;
}

function isDailyQuota(body: GeminiResponse): boolean {
  return Boolean(
    body.error?.details?.some((d) => d.violations?.some((v) => v.quotaId?.includes("PerDay"))),
  );
}

async function generate(body: Record<string, unknown>): Promise<GeminiContent> {
  const pinned = process.env.GEMINI_MODEL;
  const models = pinned
    ? [pinned]
    : configuredModels().filter((m) => (exhaustedUntil.get(m) ?? 0) < Date.now());
  if (!models.length) throw new LlmError("All Gemini models are out of daily quota", 429);

  for (const [index, model] of models.entries()) {
    const content = await generateWith(model, body);
    if (content) return content;
    exhaustedUntil.set(model, Date.now() + EXHAUSTED_COOLDOWN_MS);
    console.warn(`[llm] ${model} is out of daily quota${index + 1 < models.length ? ", falling back" : ""}`);
  }
  throw new LlmError("All Gemini models are out of daily quota", 429);
}

async function generateWith(
  model: string,
  body: Record<string, unknown>,
): Promise<GeminiContent | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }).catch((error: Error) => {
      if (error.name !== "TimeoutError" || attempt + 1 >= MAX_ATTEMPTS) {
        throw new LlmError(`Gemini request failed: ${error.message}`, 0);
      }
      return new Response("{}", { status: 503 });
    });
    const parsed = (await res.json().catch(() => ({}))) as GeminiResponse;

    if (res.ok) {
      await recordUsage(model);
      const content = parsed.candidates?.[0]?.content;
      if (!content?.parts?.length) {
        throw new LlmError(
          `Gemini returned no content (finishReason=${parsed.candidates?.[0]?.finishReason})`,
          res.status,
        );
      }
      return content;
    }

    if (res.status === 429 && isDailyQuota(parsed)) return null;

    if (!RETRYABLE.has(res.status) || attempt + 1 >= MAX_ATTEMPTS) {
      throw new LlmError(`Gemini ${res.status}: ${parsed.error?.message ?? "unknown"}`, res.status);
    }
    const delay = retryDelayMs(parsed, attempt);
    console.warn(`[llm] ${res.status}, retrying in ${Math.round(delay / 1000)}s`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

const textOf = (content: GeminiContent) =>
  content.parts
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join("");

const systemInstruction = (system: string) => ({ parts: [{ text: system }] });

export const llm: Llm = {
  async generateJson<T>({
    system,
    prompt,
    schema,
    temperature = 0,
  }: {
    system: string;
    prompt: string;
    schema: JsonSchema;
    temperature?: number;
  }) {
    const content = await generate({
      systemInstruction: systemInstruction(system),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });
    try {
      return JSON.parse(textOf(content)) as T;
    } catch {
      throw new LlmError("Gemini returned malformed JSON", 0);
    }
  },

  async runTools({ system, prompt, tools, maxTurns = 8 }) {
    const contents: GeminiContent[] = [{ role: "user", parts: [{ text: prompt }] }];
    const steps: ToolStep[] = [];
    const declarations = tools.map(({ name, description, parameters }) => ({
      name,
      description,
      parameters,
    }));

    for (let turn = 0; turn < maxTurns; turn++) {
      const content = await generate({
        systemInstruction: systemInstruction(system),
        contents,
        tools: [{ functionDeclarations: declarations }],
        generationConfig: { temperature: 0 },
      });
      // Parts go back verbatim: thinking models attach signatures that must round-trip.
      contents.push({ role: "model", parts: content.parts });

      const calls = content.parts.filter((p) => p.functionCall);
      if (!calls.length) return { text: textOf(content), steps };

      const responses: GeminiPart[] = [];
      for (const { functionCall } of calls) {
        const { name, args = {} } = functionCall!;
        const tool = tools.find((t) => t.name === name);
        const result = tool ? await tool.handler(args) : { error: `Unknown tool ${name}` };
        steps.push({ tool: name, args, result });
        responses.push({ functionResponse: { name, response: { result } } });
      }
      contents.push({ role: "user", parts: responses });
    }
    throw new LlmError(`Tool loop exceeded ${maxTurns} turns`, 0);
  },
};
