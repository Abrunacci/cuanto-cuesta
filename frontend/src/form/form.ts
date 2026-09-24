/**
 * The form as data: the text in every field, and what that text means for the calculation.
 * `readForm` is pure, so the whole screen logic is tested without rendering anything.
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
  REFERENCE_KEY,
  ROUTES,
  valueProblem,
  type Big,
  type Comparison,
  type Fee,
  type FeeDefault,
  type PositiveAmount,
  type PositivePrice,
} from "../calculator/index.ts";
import { formatMoney, formatUnambiguous, parseNumber, toInputText } from "../text/numbers.ts";
import {
  didYouMean,
  implausiblePriceMessage,
  inputProblemMessage,
  NOT_A_NUMBER,
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
}

/** Which part of a fee cannot be used yet. */
export type FeeGap = "value" | "minimum" | "both";

export interface FormReading {
  readonly comparison: Comparison;
  /** Why a field cannot be used, by field id; fields that are fine or empty are absent. */
  readonly problems: ReadonlyMap<string, string>;
  /** How a valid amount or price was read, by field id, e.g. "Leímos 1,03 USD por USDT." */
  readonly echoes: ReadonlyMap<string, string>;
  /** Fees that cannot be used, by fee id, and which part of them is missing or wrong. */
  readonly feeGaps: ReadonlyMap<string, FeeGap>;
}

export const fieldId = {
  amount: "amount",
  price: (key: string) => `price-${key}`,
  fee: (id: string) => `fee-${id}`,
  minimum: (id: string) => `fee-${id}-minimum`,
};

/** Prices and the amount start empty (an old price misleads); fees start at the researched value. */
export function initialTexts(): FormTexts {
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
  };
}

export function readForm(texts: FormTexts): FormReading {
  const problems = new Map<string, string>();
  const echoes = new Map<string, string>();
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
        return read.value;
    }
  };

  const amount = valueOf(fieldId.amount, readAmount(texts.amount));

  const prices = new Map<string, PositivePrice | null>();
  for (const field of RATE_FIELDS) {
    const id = fieldId.price(field.key);
    prices.set(field.key, valueOf(id, readPrice(field.key, texts.prices[field.key] ?? "")));
  }

  const fees = new Map<string, Fee | null>();
  for (const feeDefault of FEE_DEFAULTS) {
    const { id } = feeDefault.fee;
    const parts = readFee(feeDefault, texts);
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
    rateDefinitions: RATE_FIELDS,
    referenceKey: REFERENCE_KEY,
    amount,
    prices,
    fees,
  });
  return { comparison, problems, echoes, feeGaps };
}

type FieldRead<T> =
  | { readonly kind: "empty" }
  | { readonly kind: "problem"; readonly message: string }
  | { readonly kind: "ok"; readonly value: T; readonly echo: string | null };

interface Typed {
  readonly value: Big;
  readonly typedDecimals: number;
  readonly alternative: Big | null;
}

type Check<T> = (typed: Typed) => FieldRead<T>;

/** Parse a field's text and hand the number to `check`; empty and non-numeric text stop here. */
function readField<T>(text: string, check: Check<T>): FieldRead<T> {
  const parsed = parseNumber(text);
  switch (parsed.kind) {
    case "empty":
      return { kind: "empty" };
    case "invalid":
      return { kind: "problem", message: NOT_A_NUMBER };
    case "number":
      return check(parsed);
  }
}

const AMOUNT_DECIMALS = 2;

function readAmount(text: string): FieldRead<PositiveAmount> {
  return readField(text, ({ value, typedDecimals, alternative }) => {
    if (typedDecimals > AMOUNT_DECIMALS) {
      const tooMany = inputProblemMessage({ code: "too_many_decimals", max: AMOUNT_DECIMALS });
      // "1,000" typed for a thousand dollars: suggest the reading with a thousands separator.
      const message =
        alternative?.gt(0) === true ? `${tooMany} ${didYouMean(alternative)}` : tooMany;
      return { kind: "problem", message };
    }
    const result = positiveAmount(value, "USD");
    return result.ok
      ? {
          kind: "ok",
          value: result.value,
          echo: `Leímos ${formatMoney(result.value.amount, "USD")}.`,
        }
      : { kind: "problem", message: inputProblemMessage(result.problem) };
  });
}

function readPrice(key: string, text: string): FieldRead<PositivePrice> {
  const check = PRICE_CHECKS[key];
  return readField(text, ({ value, typedDecimals, alternative }) => {
    if (typedDecimals > MAX_PRICE_DECIMALS) {
      return {
        kind: "problem",
        message: inputProblemMessage({ code: "too_many_decimals", max: MAX_PRICE_DECIMALS }),
      };
    }
    // The plausible range goes before the calculator's own caps, so its message (with the
    // suggestion) is the one the person sees.
    if (check !== undefined && value.gt(0) && !inRange(value, check)) {
      const fix = alternative !== null && positivePrice(alternative).ok ? alternative : null;
      return { kind: "problem", message: implausiblePriceMessage(value, fix, check) };
    }
    const result = positivePrice(value);
    if (!result.ok) {
      return { kind: "problem", message: inputProblemMessage(result.problem) };
    }
    return {
      kind: "ok",
      value: result.value,
      echo: check === undefined ? null : `Leímos ${formatUnambiguous(value)} ${check.unit}.`,
    };
  });
}

/** A number between 0 and `cap`, or why it is not. */
function readBounded(text: string, cap: Big, unit: string): FieldRead<Big> {
  return readField(text, ({ value }) => {
    const problem = valueProblem(value, cap);
    return problem === null
      ? { kind: "ok", value, echo: null }
      : { kind: "problem", message: valueProblemMessage(problem, unit) };
  });
}

interface FeeParts {
  readonly value: FieldRead<Big>;
  /** Null when the fee has no minimum. */
  readonly minimum: FieldRead<Big> | null;
  readonly build: (value: Big | null, minimum: Big | null) => Fee | null;
}

function readFee({ fee }: FeeDefault, texts: FormTexts): FeeParts {
  const text = texts.fees[fee.id] ?? "";
  switch (fee.kind) {
    case "fixed": {
      const { currency } = fee.amount;
      return {
        value: readBounded(text, maxFixed(currency), currency),
        minimum: null,
        build: (value) => (value === null ? null : fixedFee(fee.id, value, currency)),
      };
    }
    case "percent": {
      const rate = readBounded(text, MAX_PERCENT, "%");
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
        minimum: readBounded(texts.minimums[fee.id] ?? "", maxFixed(currency), currency),
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
