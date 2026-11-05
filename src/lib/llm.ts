const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.5-flash";
const MAX_ATTEMPTS = 6;
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
  error?: { message?: string; details?: { retryDelay?: string }[] };
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

async function generate(body: Record<string, unknown>): Promise<GeminiContent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });
    const parsed = (await res.json().catch(() => ({}))) as GeminiResponse;

    if (res.ok) {
      const content = parsed.candidates?.[0]?.content;
      if (!content?.parts?.length) {
        throw new LlmError(
          `Gemini returned no content (finishReason=${parsed.candidates?.[0]?.finishReason})`,
          res.status,
        );
      }
      return content;
    }

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
    return JSON.parse(textOf(content)) as T;
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
