/**
 * The form as data: the text in every field, and what that text means for the calculation.
 * `readForm` is pure, so the whole screen logic is tested without rendering anything. Numbers are
 * typed and messages written in the page's language (`Texts`).
 */

import {
  compareRoutes,
  FEE_DEFAULTS,
  fixedFee,
  MAX_PERCENT,
  MAX_PRICE_DECIMALS,
  maxFixed,
  money,
  percentFee,
  positiveAmount,
  positivePrice,
  RATE_FIELDS,
  ROUTES,
  TARGET_CURRENCY,
  valueProblem,
  type Big,
  type Comparison,
  type Fee,
  type FeeDefault,
  type PositiveAmount,
  type PositivePrice,
} from "../calculator/index.ts";
import type { Texts } from "../i18n/index.ts";
import { convertTyped, type Numbers } from "../text/numbers.ts";
import {
  didYouMean,
  unusualPriceMessage,
  inputProblemMessage,
  valueProblemMessage,
} from "./messages.ts";
import { inRange, PRICE_CHECKS } from "./plausible.ts";

export interface FormTexts {
  readonly amount: string;
  /** By rate key. */
  readonly prices: Readonly<Record<string, string>>;
  /** Main value of each fee, by fee id. */
  readonly fees: Readonly<Record<string, string>>;
  /** Minimum of each percent fee that has one, by fee id. */
  readonly minimums: Readonly<Record<string, string>>;
  /**
   * Ids of the fees the person typed into, value or minimum: their own value, even when it equals
   * the researched one (a 0 typed by hand in the P2P premium is a decision, not a default).
   */
  readonly ownFees: ReadonlySet<string>;
}

/** Which part of a fee cannot be used yet. */
export type FeeGap = "value" | "minimum" | "both";

export interface FormReading {
  readonly comparison: Comparison;
  /** Why a field cannot be used, by field id; fields that are fine or empty are absent. */
  readonly problems: ReadonlyMap<string, string>;
  /** How a value typed in an ambiguous way ("1.030") was read, by field id. */
  readonly echoes: ReadonlyMap<string, string>;
  /** Values that are used but look wrong, by field id, e.g. a price far outside its usual range. */
  readonly warnings: ReadonlyMap<string, string>;
  /** Fees that cannot be used, by fee id, and which part of them is missing or wrong. */
  readonly feeGaps: ReadonlyMap<string, FeeGap>;
  /** Ids of the fees the person set; the rest are at their researched value. */
  readonly ownFees: ReadonlySet<string>;
  /** Keys of the prices left empty that the comparison takes from an estimate. */
  readonly estimated: ReadonlySet<string>;
}

/** Longer than any number anyone types; fields stop there, and storage drops anything longer. */
export const MAX_FIELD_LENGTH = 64;

export const fieldId = {
  amount: "amount",
  price: (key: string) => `price-${key}`,
  fee: (id: string) => `fee-${id}`,
  minimum: (id: string) => `fee-${id}-minimum`,
};

/**
 * Prices and the amount start empty (the latest prices are prefilled once they arrive, see
 * `withPrefill`); fees start at the researched value, written as `numbers` types them.
 */
export function initialTexts({ toInput: toInputText }: Numbers): FormTexts {
  const fees: Record<string, string> = {};
  const minimums: Record<string, string> = {};
  for (const { fee } of FEE_DEFAULTS) {
    fees[fee.id] = toInputText(fee.kind === "fixed" ? fee.amount.amount : fee.rate);
    if (fee.kind === "percent" && fee.minimum !== null) {
      minimums[fee.id] = toInputText(fee.minimum.amount);
    }
  }
  return {
    amount: "",
    prices: Object.fromEntries(RATE_FIELDS.map((field) => [field.key, ""])),
    fees,
    minimums,
    ownFees: new Set(),
  };
}

/**
 * What the form means. A price left empty is taken from `estimates` when it has one (the card's
 * estimated final price): what the person types always wins.
 */
export function readForm(
  t: Texts,
  texts: FormTexts,
  estimates: ReadonlyMap<string, PositivePrice> = new Map(),
): FormReading {
  const problems = new Map<string, string>();
  const echoes = new Map<string, string>();
  const warnings = new Map<string, string>();
  const feeGaps = new Map<string, FeeGap>();
  const valueOf = <T>(id: string, read: FieldRead<T>): T | null => {
    switch (read.kind) {
      case "empty":
        return null;
      case "problem":
        problems.set(id, read.message);
        return null;
      case "ok":
        if (read.echo !== null) {
          echoes.set(id, read.echo);
        }
        if (read.warning !== null) {
          warnings.set(id, read.warning);
        }
        return read.value;
    }
  };

  const amount = valueOf(fieldId.amount, readAmount(t, texts.amount));

  const prices = new Map<string, PositivePrice | null>();
  const estimated = new Set<string>();
  for (const field of RATE_FIELDS) {
    const id = fieldId.price(field.key);
    const text = texts.prices[field.key] ?? "";
    const estimate = estimates.get(field.key);
    if (estimate !== undefined && text.trim() === "") {
      prices.set(field.key, estimate);
      estimated.add(field.key);
    } else {
      prices.set(field.key, valueOf(id, readPrice(t, field.key, text)));
    }
  }

  const fees = new Map<string, Fee | null>();
  for (const feeDefault of FEE_DEFAULTS) {
    const { id } = feeDefault.fee;
    const parts = readFee(t, feeDefault, texts);
    const value = valueOf(fieldId.fee(id), parts.value);
    const minimum = parts.minimum === null ? null : valueOf(fieldId.minimum(id), parts.minimum);
    const fee = parts.build(value, minimum);
    fees.set(id, fee);
    if (fee === null) {
      const gap = feeGap(value === null, parts.minimum !== null && minimum === null);
      if (gap !== null) {
        feeGaps.set(id, gap);
      }
    }
  }

  const comparison = compareRoutes({
    routes: ROUTES,
    target: TARGET_CURRENCY,
    rateDefinitions: RATE_FIELDS,
    amount,
    prices,
    fees,
  });
  return { comparison, problems, echoes, warnings, feeGaps, ownFees: texts.ownFees, estimated };
}

type FieldRead<T> =
  | { readonly kind: "empty" }
  | { readonly kind: "problem"; readonly message: string }
  | {
      readonly kind: "ok";
      readonly value: T;
      /** How an ambiguous text was read; null when it reads only one way. */
      readonly echo: string | null;
      /** The value is used, but looks wrong. */
      readonly warning: string | null;
    };

interface Typed {
  readonly value: Big;
  readonly typedDecimals: number;
  readonly alternative: Big | null;
}

type Check<T> = (typed: Typed) => FieldRead<T>;

/** Parse a field's text and hand the number to `check`; empty and non-numeric text stop here. */
function readField<T>(t: Texts, text: string, check: Check<T>): FieldRead<T> {
  const parsed = t.numbers.parse(text);
  switch (parsed.kind) {
    case "empty":
      return { kind: "empty" };
    case "invalid":
      return { kind: "problem", message: t.problems.notANumber };
    case "number":
      return check(parsed);
  }
}

const AMOUNT_DECIMALS = 2;

function readAmount(t: Texts, text: string): FieldRead<PositiveAmount> {
  return readField(t, text, ({ value, typedDecimals, alternative }) => {
    if (typedDecimals > AMOUNT_DECIMALS) {
      const tooMany = inputProblemMessage(t, { code: "too_many_decimals", max: AMOUNT_DECIMALS });
      // "1,000" typed for a thousand dollars: suggest the reading with a thousands separator.
      const message =
        alternative?.gt(0) === true ? `${tooMany} ${didYouMean(t, alternative)}` : tooMany;
      return { kind: "problem", message };
    }
    const result = positiveAmount(value, "USD");
    return result.ok
      ? {
          kind: "ok",
          value: result.value,
          // Never ambiguous: the other reading of "1.000" (1,000) has more decimals than an
          // amount allows, and "1,000" was already rejected above.
          echo: null,
          warning: null,
        }
      : { kind: "problem", message: inputProblemMessage(t, result.problem) };
  });
}

function readPrice(t: Texts, key: string, text: string): FieldRead<PositivePrice> {
  const check = PRICE_CHECKS[key];
  return readField(t, text, ({ value, typedDecimals, alternative }) => {
    if (typedDecimals > MAX_PRICE_DECIMALS) {
      return {
        kind: "problem",
        message: inputProblemMessage(t, { code: "too_many_decimals", max: MAX_PRICE_DECIMALS }),
      };
    }
    const result = positivePrice(value);
    if (!result.ok) {
      return { kind: "problem", message: inputProblemMessage(t, result.problem) };
    }
    // No echo for prices: the two readings of "1.030" differ a thousandfold and the widest range
    // spans a hundredfold, so they are never both plausible; the implausible one gets a warning.
    const echo = null;
    // Outside the plausible range the price is still used: a jump in the exchange rate must not
    // make the calculator useless. The person is only warned.
    if (check === undefined || inRange(value, check)) {
      return { kind: "ok", value: result.value, echo, warning: null };
    }
    const fix = alternative !== null && positivePrice(alternative).ok ? alternative : null;
    return {
      kind: "ok",
      value: result.value,
      echo: null,
      warning: unusualPriceMessage(t, key, value, fix, check),
    };
  });
}

/**
 * A fee value between 0 and `cap`, or why it is not. An ambiguous text ("1,500") is echoed back
 * so the person sees how it was read; above the cap, the message says what was read and suggests
 * the other reading when that one fits.
 */
function readBounded(t: Texts, text: string, cap: Big, unit: string): FieldRead<Big> {
  return readField(t, text, ({ value, alternative }) => {
    const read = t.problems.read(t.numbers.unambiguous(value), unit);
    const problem = valueProblem(value, cap);
    if (problem === null) {
      // Echo only when the other reading is a value this fee could also hold.
      const bothValid = alternative !== null && valueProblem(alternative, cap) === null;
      return { kind: "ok", value, echo: bothValid ? read : null, warning: null };
    }
    const message = valueProblemMessage(t, problem, unit);
    if (problem.code === "negative") {
      return { kind: "problem", message };
    }
    const fits = alternative !== null && valueProblem(alternative, cap) === null;
    const fix = fits ? ` ${didYouMean(t, alternative)}` : "";
    return { kind: "problem", message: `${message} ${read}${fix}` };
  });
}

interface FeeParts {
  readonly value: FieldRead<Big>;
  /** Null when the fee has no minimum. */
  readonly minimum: FieldRead<Big> | null;
  readonly build: (value: Big | null, minimum: Big | null) => Fee | null;
}

function readFee(t: Texts, { fee }: FeeDefault, texts: FormTexts): FeeParts {
  const text = texts.fees[fee.id] ?? "";
  switch (fee.kind) {
    case "fixed": {
      const { currency } = fee.amount;
      return {
        value: readBounded(t, text, maxFixed(currency), currency),
        minimum: null,
        build: (value) => (value === null ? null : fixedFee(fee.id, value, currency)),
      };
    }
    case "percent": {
      const rate = readBounded(t, text, MAX_PERCENT, "%");
      if (fee.minimum === null) {
        return {
          value: rate,
          minimum: null,
          build: (value) => (value === null ? null : percentFee(fee.id, value)),
        };
      }
      const { currency } = fee.minimum;
      return {
        value: rate,
        minimum: readBounded(t, texts.minimums[fee.id] ?? "", maxFixed(currency), currency),
        build: (value, minimum) =>
          value === null || minimum === null
            ? null
            : percentFee(fee.id, value, money(minimum, currency)),
      };
    }
  }
}

function feeGap(valueMissing: boolean, minimumMissing: boolean): FeeGap | null {
  if (valueMissing && minimumMissing) {
    return "both";
  }
  if (valueMissing) {
    return "value";
  }
  return minimumMissing ? "minimum" : null;
}

/**
 * The latest prices in the fields still empty: a price that arrives never replaces what the
 * person typed. The texts come back as they are when nothing changes.
 */
export function withPrefill(texts: FormTexts, values: Readonly<Record<string, string>>): FormTexts {
  const prices = { ...texts.prices };
  let changed = false;
  for (const [key, value] of Object.entries(values)) {
    if (key in prices && (prices[key] ?? "").trim() === "") {
      prices[key] = value;
      changed = true;
    }
  }
  return changed ? { ...texts, prices } : texts;
}

/**
 * One fee back to its researched value, minimum included, and no longer the person's own. A fee
 * that is not the person's own already holds its researched value: the texts come back as they
 * are, so nothing renders again.
 */
export function withFeeReset(numbers: Numbers, texts: FormTexts, id: string): FormTexts {
  if (!texts.ownFees.has(id)) {
    return texts;
  }
  const start = initialTexts(numbers);
  const ownFees = new Set(texts.ownFees);
  ownFees.delete(id);
  const value = start.fees[id];
  const minimum = start.minimums[id];
  return {
    ...texts,
    fees: value === undefined ? texts.fees : { ...texts.fees, [id]: value },
    minimums: minimum === undefined ? texts.minimums : { ...texts.minimums, [id]: minimum },
    ownFees,
  };
}

/**
 * Every number the person typed, rewritten from the style of one language to the other's
 * ("1.452,30" becomes "1,452.30"), so changing the page's language never changes what a field
 * means. The texts come back as they are when both styles are the same.
 */
export function withNumbersIn(texts: FormTexts, from: Numbers, to: Numbers): FormTexts {
  if (from.style === to.style) {
    return texts;
  }
  return {
    ...texts,
    amount: convertTyped(texts.amount, from.style, to.style),
    prices: recordIn(texts.prices, from, to),
    fees: recordIn(texts.fees, from, to),
    minimums: recordIn(texts.minimums, from, to),
  };
}

/** Each text of `record` rewritten as `withNumbersIn` does. */
export function recordIn(
  record: Readonly<Record<string, string>>,
  from: Numbers,
  to: Numbers,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(record).map(([key, text]) => [key, convertTyped(text, from.style, to.style)]),
  );
}
