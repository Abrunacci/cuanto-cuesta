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
  | { readonly kind: "number"; readonly value: Big };

const THOUSANDS_WITH_COMMA_DECIMALS = /^\d{1,3}(\.\d{3})+(,\d+)?$/;
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
  return { kind: "number", value: new Decimal(negative ? `-${normalized}` : normalized) };
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

const CURRENCY_PREFIX: Record<Currency, string> = {
  ARS: "$ ",
  USD: "US$ ",
  USDT: "",
  USDC: "",
};

const CURRENCY_SUFFIX: Record<Currency, string> = {
  ARS: "",
  USD: "",
  USDT: " USDT",
  USDC: " USDC",
};

/** An amount of money in cents, e.g. "$ 1.534.005,69" or "US$ 1.000,00". */
export function formatMoney(amount: Big, currency: Currency): string {
  const negative = amount.lt(0);
  const text = formatNumber(amount.abs(), 2);
  return `${negative ? "-" : ""}${CURRENCY_PREFIX[currency]}${text}${CURRENCY_SUFFIX[currency]}`;
}
