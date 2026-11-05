import { formatCents, type Measure, type IntentEvidence, type OrderEvidence, type OrderItem, type RulingCheck } from "../domain";

const SIZE_WORDS: Record<string, string> = {
  xs: "XS",
  "x-small": "XS",
  "extra small": "XS",
  s: "S",
  small: "S",
  m: "M",
  medium: "M",
  l: "L",
  large: "L",
  xl: "XL",
  "x-large": "XL",
  "extra large": "XL",
  xxl: "XXL",
};

export function normalizeSize(value: string): string | null {
  const text = value.trim().toLowerCase().replace(/^size\s+/, "");
  if (SIZE_WORDS[text]) return SIZE_WORDS[text];
  return /^\d{1,2}(\.5)?$/.test(text) ? text : null;
}

const UNITS: [RegExp, string, number][] = [
  [/^(ml|milliliters?|millilitres?)$/, "volume", 1],
  [/^(l|liters?|litres?)$/, "volume", 1000],
  [/^(w|watts?)$/, "power", 1],
  [/^(cm|centimeters?|centimetres?)$/, "length", 10],
  [/^(mm|millimeters?|millimetres?)$/, "length", 1],
  [/^(m|meters?|metres?)$/, "length", 1000],
  [/^(in|inch|inches)$/, "length", 25.4],
  [/^(ft|feet|foot)$/, "length", 304.8],
  [/^(oz|ounces?)$/, "weight", 28.35],
  [/^(g|grams?)$/, "weight", 1],
  [/^(kg|kilograms?)$/, "weight", 1000],
];

function toBase(value: number, unit: string): { dimension: string; base: number } | null {
  const match = UNITS.find(([pattern]) => pattern.test(unit.trim().toLowerCase()));
  return match ? { dimension: match[1], base: value * match[2] } : null;
}

type Listed = { dimension: string; base: number; upTo: boolean };

function listedMeasures(item: OrderItem): Listed[] {
  const pattern = /(up to\s+)?(\d+(?:\.\d+)?)[\s-]*([a-z]+)\b/gi;
  const found: Listed[] = [];
  for (const text of [item.size, item.variant, item.title, item.description]) {
    for (const [, upTo, value, unit] of text.matchAll(pattern)) {
      const converted = toBase(Number(value), unit);
      if (converted) found.push({ ...converted, upTo: Boolean(upTo) });
    }
  }
  return found;
}

function measureCheck(measure: Measure, item: OrderItem): RulingCheck | null {
  const wanted = toBase(measure.value, measure.unit);
  if (!wanted) return null;
  const listed = listedMeasures(item).find((m) => m.dimension === wanted.dimension);
  if (!listed) return null;

  const tolerance = wanted.base * 0.01;
  const passed =
    measure.op === "min" || listed.upTo
      ? listed.base >= wanted.base - tolerance
      : measure.op === "max"
        ? listed.base <= wanted.base + tolerance
        : Math.abs(listed.base - wanted.base) <= tolerance;

  return {
    name: `measure:${measure.name}`,
    source: "rules",
    passed,
    detail: `Mandate needs ${measure.op} ${measure.value} ${measure.unit}; listing "${item.size}".`,
  };
}

export function runRules(intent: IntentEvidence, order: OrderEvidence): RulingCheck[] {
  const { constraints, budgetCents } = intent;
  const checks: RulingCheck[] = [];
  const add = (name: string, passed: boolean, detail: string) =>
    checks.push({ name, source: "rules", passed, detail });

  add(
    "budget",
    order.amountCents <= budgetCents,
    `Charged ${formatCents(order.amountCents)} against a budget of ${formatCents(budgetCents)}.`,
  );

  for (const item of order.items) {
    if (constraints.maxPriceCents !== null) {
      add(
        "price",
        item.priceCents <= constraints.maxPriceCents,
        `Listed at ${formatCents(item.priceCents)}; limit ${formatCents(constraints.maxPriceCents)}.`,
      );
    }

    const wantedSize = constraints.size && normalizeSize(constraints.size);
    const listedSize = normalizeSize(item.size) ?? normalizeSize(item.variant);
    if (wantedSize && listedSize) {
      add("size", wantedSize === listedSize, `Mandate says ${wantedSize}; listing is ${listedSize}.`);
    }

    if (constraints.quantity !== null && item.quantity !== undefined) {
      add(
        "quantity",
        item.quantity === constraints.quantity,
        `Mandate says ${constraints.quantity}; bought ${item.quantity}.`,
      );
    }

    if (constraints.maxDeliveryDays !== null && item.deliveryDays !== undefined) {
      add(
        "delivery",
        item.deliveryDays <= constraints.maxDeliveryDays,
        `Needed within ${constraints.maxDeliveryDays} days; listed at ${item.deliveryDays}.`,
      );
    }

    for (const measure of constraints.measures) {
      const check = measureCheck(measure, item);
      if (check) checks.push(check);
    }
  }
  return checks;
}
