// Usage: npm run eval -- --set tune|holdout [--modes rules,llm,hybrid] [--show-failures]
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { ADJUDICATOR_SYSTEM, adjudicate, type AdjudicationMode } from "../src/lib/adjudicator";
import type {
  Constraints,
  Fault,
  IntentEvidence,
  OrderEvidence,
  Ruling,
} from "../src/lib/domain";
import { parseInstruction } from "../src/lib/intents";
import { llm } from "../src/lib/llm";

loadEnvConfig(process.cwd());

// Fixed before any run. Stratified by label: 2 AGENT_ERROR, 4 MERCHANT_MISMATCH, 4 WITHIN_INTENT.
const TUNE_IDS = new Set([1, 4, 6, 9, 12, 29, 13, 16, 19, 22]);
const FAULTS: Fault[] = ["AGENT_ERROR", "MERCHANT_MISMATCH", "WITHIN_INTENT"];
const CACHE_DIR = ".eval-cache";

type TestCase = {
  id: number;
  instruction: string;
  listing: {
    title: string;
    variant: string;
    color: string;
    size: string;
    price: number;
    description: string;
  };
  complaint: string;
  correct_label: Fault;
  reason: string;
};

const argValue = (name: string) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

// All rulings use one pinned model so modes stay comparable; quota only allows ~20 calls a day.
const model = () => {
  if (!process.env.GEMINI_MODEL) throw new Error("Pin GEMINI_MODEL for an eval run");
  return process.env.GEMINI_MODEL;
};
const PARSE_MODEL = process.env.EVAL_PARSE_MODEL || "gemini-3.5-flash-lite";

async function withModel<T>(name: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env.GEMINI_MODEL;
  process.env.GEMINI_MODEL = name;
  try {
    return await run();
  } finally {
    process.env.GEMINI_MODEL = previous;
  }
}
const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 10);

async function cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const path = join(CACHE_DIR, `${key}.json`);
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8")) as T;
  const value = await compute();
  writeFileSync(path, JSON.stringify(value));
  return value;
}

function evidence(testCase: TestCase, constraints: Constraints) {
  const priceCents = Math.round(testCase.listing.price * 100);
  const intent: IntentEvidence = {
    rawInstruction: testCase.instruction,
    constraints,
    budgetCents: constraints.maxPriceCents ?? priceCents,
  };
  const order: OrderEvidence = {
    items: [{ ...testCase.listing, priceCents, quantity: undefined }],
    amountCents: priceCents,
  };
  return { intent, order };
}

type Result = { id: number; mode: AdjudicationMode; expected: Fault; ruling: Ruling };

async function runCase(testCase: TestCase, mode: AdjudicationMode): Promise<Result> {
  const constraints = await cached(`parse-${testCase.id}`, () =>
    withModel(PARSE_MODEL, () => parseInstruction(llm, testCase.instruction)),
  );
  const { intent, order } = evidence(testCase, constraints);
  const promptVersion = mode === "rules" ? "rules" : hash(ADJUDICATOR_SYSTEM);
  const ruling =
    mode === "rules"
      ? await adjudicate(intent, order, testCase.complaint, { llm, mode })
      : await cached(`rule-${model()}-${mode}-${promptVersion}-${testCase.id}`, () =>
          adjudicate(intent, order, testCase.complaint, { llm, mode }),
        );
  return { id: testCase.id, mode, expected: testCase.correct_label, ruling };
}

function summarize(results: Result[]) {
  const correct = results.filter((r) => r.ruling.fault === r.expected);
  const perFault = Object.fromEntries(
    FAULTS.map((fault) => {
      const rows = results.filter((r) => r.expected === fault);
      return [
        fault,
        { correct: rows.filter((r) => r.ruling.fault === fault).length, total: rows.length },
      ];
    }),
  );
  return {
    correct: correct.length,
    total: results.length,
    accuracy: Number((correct.length / results.length).toFixed(3)),
    perFault,
    flaggedForReview: results.filter((r) => r.ruling.confidence < 0.7).length,
    failures: results
      .filter((r) => r.ruling.fault !== r.expected)
      .map((r) => ({
        id: r.id,
        expected: r.expected,
        got: r.ruling.fault,
        confidence: r.ruling.confidence,
      })),
  };
}

async function main() {
  const set = argValue("--set");
  if (set !== "tune" && set !== "holdout") throw new Error("Pass --set tune or --set holdout");
  const modes = (argValue("--modes") ?? "rules,llm,hybrid").split(",") as AdjudicationMode[];

  const { cases } = JSON.parse(readFileSync("test_cases.json", "utf8")) as { cases: TestCase[] };
  const selected = cases.filter((c) => TUNE_IDS.has(c.id) === (set === "tune"));

  const summary: Record<string, ReturnType<typeof summarize>> = {};
  const save = () => {
    mkdirSync("eval-results", { recursive: true });
    writeFileSync(
      join("eval-results", `${set}.json`),
      JSON.stringify(
        { set, model: model(), prompt: hash(ADJUDICATOR_SYSTEM), cases: selected.length, summary },
        null,
        2,
      ) + "\n",
    );
  };

  for (const mode of modes) {
    const results: Result[] = [];
    for (const testCase of selected) {
      results.push(await runCase(testCase, mode));
      process.stdout.write(".");
    }
    console.log(` ${mode}`);
    summary[mode] = summarize(results);
    save();

    if (process.argv.includes("--show-failures")) {
      for (const failure of results.filter((r) => r.ruling.fault !== r.expected)) {
        console.log(
          `  #${failure.id} expected ${failure.expected}, got ${failure.ruling.fault}: ${failure.ruling.explanation}`,
        );
      }
    }
  }

  for (const [mode, s] of Object.entries(summary)) {
    const faults = FAULTS.map((f) => `${f} ${s.perFault[f].correct}/${s.perFault[f].total}`).join("  ");
    console.log(`${mode.padEnd(7)} ${s.correct}/${s.total} (${(s.accuracy * 100).toFixed(0)}%)  ${faults}  review=${s.flaggedForReview}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
