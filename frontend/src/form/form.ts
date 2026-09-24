/**
 * The form as data: the text in every field, and what that text means for the calculation.
 * `readForm` is pure, so the whole screen logic is tested without rendering anything.
 */

import {
  compareRoutes,
  FEE_DEFAULTS,
  fixedFee,
  MAX_PERCENT,
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
import { parseNumber, toInputText } from "../text/numbers.ts";
import { inputProblemMessage, NOT_A_NUMBER, valueProblemMessage } from "./messages.ts";

export interface FormTexts {
  readonly amount: string;
  /** By rate key. */
  readonly prices: Readonly<Record<string, string>>;
  /** Main value of each fee, by fee id. */
  readonly fees: Readonly<Record<string, string>>;
  /** Minimum of each percent fee that has one, by fee id. */
  readonly minimums: Readonly<Record<string, string>>;
}

export interface FormReading {
  readonly comparison: Comparison;
  /** Why a field cannot be used, by field id; fields that are fine or empty are absent. */
  readonly problems: ReadonlyMap<string, string>;
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
  const note = (id: string, problem: string | null) => {
    if (problem !== null) {
      problems.set(id, problem);
    }
  };

  const amount = readAmount(texts.amount);
  note(fieldId.amount, amount.problem);

  const prices = new Map<string, PositivePrice | null>();
  for (const field of RATE_FIELDS) {
    const price = readPrice(texts.prices[field.key] ?? "");
    note(fieldId.price(field.key), price.problem);
    prices.set(field.key, price.value);
  }

  const fees = new Map<string, Fee | null>();
  for (const feeDefault of FEE_DEFAULTS) {
    const fee = readFee(feeDefault, texts);
    note(fieldId.fee(feeDefault.fee.id), fee.valueProblem);
    note(fieldId.minimum(feeDefault.fee.id), fee.minimumProblem);
    fees.set(feeDefault.fee.id, fee.fee);
  }

  const comparison = compareRoutes({
    routes: ROUTES,
    rateDefinitions: RATE_FIELDS,
    referenceKey: REFERENCE_KEY,
    amount: amount.value,
    prices,
    fees,
  });
  return { comparison, problems };
}

interface Read<T> {
  readonly value: T | null;
  readonly problem: string | null;
}

function readAmount(text: string): Read<PositiveAmount> {
  const parsed = parseNumber(text);
  switch (parsed.kind) {
    case "empty":
      return { value: null, problem: null };
    case "invalid":
      return { value: null, problem: NOT_A_NUMBER };
    case "number": {
      const result = positiveAmount(parsed.value, "USD");
      return result.ok
        ? { value: result.value, problem: null }
        : { value: null, problem: inputProblemMessage(result.problem) };
    }
  }
}

function readPrice(text: string): Read<PositivePrice> {
  const parsed = parseNumber(text);
  switch (parsed.kind) {
    case "empty":
      return { value: null, problem: null };
    case "invalid":
      return { value: null, problem: NOT_A_NUMBER };
    case "number": {
      const result = positivePrice(parsed.value);
      return result.ok
        ? { value: result.value, problem: null }
        : { value: null, problem: inputProblemMessage(result.problem) };
    }
  }
}

/** A number between 0 and `cap`, or why it is not. */
function readBounded(text: string, cap: Big, unit: string): Read<Big> {
  const parsed = parseNumber(text);
  switch (parsed.kind) {
    case "empty":
      return { value: null, problem: null };
    case "invalid":
      return { value: null, problem: NOT_A_NUMBER };
    case "number": {
      const problem = valueProblem(parsed.value, cap);
      return problem === null
        ? { value: parsed.value, problem: null }
        : { value: null, problem: valueProblemMessage(problem, unit) };
    }
  }
}

function readFee(
  { fee }: FeeDefault,
  texts: FormTexts,
): { fee: Fee | null; valueProblem: string | null; minimumProblem: string | null } {
  const text = texts.fees[fee.id] ?? "";
  switch (fee.kind) {
    case "fixed": {
      const { currency } = fee.amount;
      const value = readBounded(text, maxFixed(currency), currency);
      return {
        fee: value.value === null ? null : fixedFee(fee.id, value.value, currency),
        valueProblem: value.problem,
        minimumProblem: null,
      };
    }
    case "percent": {
      const rate = readBounded(text, MAX_PERCENT, "%");
      if (fee.minimum === null) {
        return {
          fee: rate.value === null ? null : percentFee(fee.id, rate.value),
          valueProblem: rate.problem,
          minimumProblem: null,
        };
      }
      const { currency } = fee.minimum;
      const minimum = readBounded(texts.minimums[fee.id] ?? "", maxFixed(currency), currency);
      return {
        fee:
          rate.value === null || minimum.value === null
            ? null
            : percentFee(fee.id, rate.value, money(minimum.value, currency)),
        valueProblem: rate.problem,
        minimumProblem: minimum.problem,
      };
    }
  }
}
