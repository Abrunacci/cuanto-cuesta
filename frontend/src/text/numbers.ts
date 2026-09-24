/**
 * Numbers as people in Argentina type and read them: a dot for thousands and a comma for
 * decimals ("1.536,16"). A number with a single dot and no comma ("1536.16", "1.03") is read with
 * the dot as the decimal point, as a phone keyboard often types it, unless the dot is followed by
 * exactly three digits and there is no other separator ("1.536" is one thousand five hundred
 * thirty-six).
 */

import { Decimal, type Big, type Currency } from "../calculator/index.ts";

export type ParsedNumber =
  | { readonly kind: "empty" }
  | { readonly kind: "invalid" }
  | {
      readonly kind: "number";
      readonly value: Big;
      /** Decimals as typed, trailing zeros included: "1,000" has 3 even though it is 1. */
      readonly typedDecimals: number;
      /**
       * The other reading of an ambiguous text: one separator followed by exactly three digits
       * ("1.030" is read as 1030 but may mean 1,03; "1,536" is read as 1,536 but may mean 1536).
       */
      readonly alternative: Big | null;
    };

// A group of thousands never starts with 0: "0.015" and "0,500" have only one reading.
const AMBIGUOUS = /^[1-9]\d{0,2}[.,]\d{3}$/;

const THOUSANDS_WITH_COMMA_DECIMALS = /^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/;
const COMMA_DECIMALS = /^\d+(,\d+)?$/;
const DOT_DECIMALS = /^\d+\.\d+$/;

export function parseNumber(text: string): ParsedNumber {
  const compact = text.replace(/\s/g, "");
  if (compact === "") {
    return { kind: "empty" };
  }
  const negative = compact.startsWith("-");
  const digits = negative ? compact.slice(1) : compact;
  let normalized: string;
  if (THOUSANDS_WITH_COMMA_DECIMALS.test(digits)) {
    normalized = digits.replaceAll(".", "").replace(",", ".");
  } else if (COMMA_DECIMALS.test(digits)) {
    normalized = digits.replace(",", ".");
  } else if (DOT_DECIMALS.test(digits)) {
    normalized = digits;
  } else {
    return { kind: "invalid" };
  }
  const typedDecimals = normalized.includes(".") ? (normalized.split(".")[1] ?? "").length : 0;
  const sign = negative ? "-" : "";
  return {
    kind: "number",
    value: new Decimal(`${sign}${normalized}`),
    typedDecimals,
    alternative: AMBIGUOUS.test(digits) ? new Decimal(`${sign}${otherReading(digits)}`) : null,
  };
}

/**
 * The reading `parseNumber` did not choose, in JavaScript notation: "1,536" was read with a
 * decimal comma, so the other reading drops it as a thousands separator ("1536"); "1.030" was
 * read with a thousands dot, so the other reading keeps it as a decimal point ("1.030" = 1.03).
 */
function otherReading(digits: string): string {
  return digits.includes(",") ? digits.replace(",", "") : digits;
}

/** A value as it goes back into an input: comma decimals, no thousands separator. */
export function toInputText(value: Big): string {
  return value.toFixed().replace(".", ",");
}

/** A number for reading: thousands with dots, `decimals` decimals with a comma. */
export function formatNumber(value: Big, decimals: number): string {
  const fixed = value.toFixed(decimals);
  const negative = fixed.startsWith("-");
  const [integer = "0", fraction] = (negative ? fixed.slice(1) : fixed).split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${grouped}${fraction === undefined ? "" : `,${fraction}`}`;
}

/** A number with exactly the decimals it has: "1,03", "1.536", "0,00000001". */
export function formatExact(value: Big): string {
  const [, fraction = ""] = value.abs().toFixed().split(".");
  return formatNumber(value, fraction.length);
}

/**
 * A number echoed back to the person, with at least two decimals so it cannot be read two ways:
 * "1.030,00" and "1,03" instead of "1.030", which reads as 1,03 to someone used to a decimal point.
 */
export function formatUnambiguous(value: Big): string {
  const [, fraction = ""] = value.abs().toFixed().split(".");
  return formatNumber(value, Math.max(2, fraction.length));
}

/** No-break space, so a currency sign never ends up on a different line from its number. */
const NBSP = "\u00a0";

const CURRENCY_PREFIX: Record<Currency, string> = {
  ARS: `$${NBSP}`,
  USD: `US$${NBSP}`,
  USDT: "",
  USDC: "",
};

const CURRENCY_SUFFIX: Record<Currency, string> = {
  ARS: "",
  USD: "",
  USDT: `${NBSP}USDT`,
  USDC: `${NBSP}USDC`,
};

/** An amount of money in cents, e.g. "$ 1.534.005,69" or "US$ 1.000,00". */
export function formatMoney(amount: Big, currency: Currency): string {
  const negative = amount.lt(0);
  const text = formatNumber(amount.abs(), 2);
  return `${negative ? "-" : ""}${CURRENCY_PREFIX[currency]}${text}${CURRENCY_SUFFIX[currency]}`;
}
