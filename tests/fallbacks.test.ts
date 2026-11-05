import assert from "node:assert/strict";
import { test } from "node:test";
import { parseInstructionFallback } from "../src/lib/intents";

test("fallback parser reads only stated facts", () => {
  const parsed = parseInstructionFallback("Buy a black men's medium cotton hoodie under $40.");
  assert.equal(parsed.maxPriceCents, 4000);
  assert.equal(parsed.size, "medium");
  assert.equal(parsed.color, "black");
  assert.equal(parsed.quantity, null);
});

test("fallback parser invents nothing", () => {
  const parsed = parseInstructionFallback("Find me a nice gift");
  assert.equal(parsed.maxPriceCents, null);
  assert.equal(parsed.size, null);
  assert.equal(parsed.color, null);
});

test("fallback parser reads numeric shoe sizes", () => {
  assert.equal(parseInstructionFallback("Running shoes, size 9, under $80").size, "9");
});
