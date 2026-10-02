/**
 * Numbers as people type and read them, in the style of the page's language: in Spanish a dot
 * for thousands and a comma for decimals ("1.536,16"), in English the other way around
 * ("1,536.16"). Both languages read with the same rules, the two separators swapped:
 *
 * - Thousands groups, with or without decimals after them, read as expected ("1.536,16").
 * - A single decimal separator reads as expected ("1536,16").
 * - A single group separator is read as the decimal point, as a phone keyboard set to the other
 *   language often types it ("1.03" in Spanish, "1,03" in English), unless it is followed by
 *   exactly three digits: then it groups thousands ("1.536" in Spanish is one thousand five
 *   hundred thirty-six), and the other reading is kept so the screen can ask.
 *
 * Because the rules mirror each other, swapping the dots and commas of a text turns what it
 * means in one language into the same number in the other (`convertTyped`).
 */

import { Decimal, type Big, type Currency, type Fee } from "../calculator/index.ts";

/** No-break space, so a currency sign never ends up on a different line from its number. */
const NBSP = "\u00a0";

export interface NumberStyle {
  /** Between groups of thousands. */
  readonly group: "." | ",";
  /** Before the decimals. */
  readonly decimal: "," | ".";
  /** Before an amount, by currency: "$ ", "ARS ". */
  readonly prefix: Readonly<Record<Currency, string>>;
  /** After an amount, by currency: " USDT". */
  readonly suffix: Readonly<Record<Currency, string>>;
}

const SUFFIX: Readonly<Record<Currency, string>> = {
  ARS: "",
  USD: "",
  USDT: `${NBSP}USDT`,
  USDC: `${NBSP}USDC`,
};

export const SPANISH_NUMBERS: NumberStyle = {
  group: ".",
  decimal: ",",
  prefix: { ARS: `$${NBSP}`, USD: `US$${NBSP}`, USDT: "", USDC: "" },
  suffix: SUFFIX,
};

/** To someone who reads English, "$" means dollars: pesos say ARS. */
export const ENGLISH_NUMBERS: NumberStyle = {
  group: ",",
  decimal: ".",
  prefix: { ARS: `ARS${NBSP}`, USD: `US$${NBSP}`, USDT: "", USDC: "" },
  suffix: SUFFIX,
};

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

/** Reading and writing numbers in one style. */
export interface Numbers {
  readonly style: NumberStyle;
  readonly parse: (text: string) => ParsedNumber;
  /** A value as it goes back into an input, with no thousands separator: "0,6", "150000". */
  readonly toInput: (value: Big) => string;
  /** A number for reading, thousands grouped, with `decimals` decimals: "1.534.005,69". */
  readonly format: (value: Big, decimals: number) => string;
  /** A number with exactly the decimals it has: "1,03", "1.536", "0,00000001". */
  readonly exact: (value: Big) => string;
  /**
   * A number echoed back to the person, with at least two decimals so it cannot be read two
   * ways: "1.030,00" and "1,03" instead of "1.030", which reads as 1,03 to someone used to a
   * decimal point.
   */
  readonly unambiguous: (value: Big) => string;
  /** An amount of money in cents: "$ 1.534.005,69", "US$ 1.000,00", "ARS 1,534,005.69". */
  readonly money: (amount: Big, currency: Currency) => string;
  /** An amount in whole units, cut toward zero, for tight spaces: "$ 1.534.005". */
  readonly moneyWhole: (amount: Big, currency: Currency) => string;
  /** A fee's value with its unit: "0 %", "0,08 USDT". */
  readonly feeValue: (fee: Fee) => string;
}

export function numbersIn(style: NumberStyle): Numbers {
  const format = (value: Big, decimals: number) => formatNumber(value, decimals, style);
  const exact = (value: Big) => format(value, decimalsOf(value));
  const withCurrency = (text: string, currency: Currency, negative: boolean) =>
    `${negative ? "-" : ""}${style.prefix[currency]}${text}${style.suffix[currency]}`;
  return {
    style,
    parse: (text) => parseNumber(text, style),
    toInput: (value) => value.toFixed().replace(".", style.decimal),
    format,
    exact,
    unambiguous: (value) => format(value, Math.max(2, decimalsOf(value))),
    money: (amount, currency) => withCurrency(format(amount.abs(), 2), currency, amount.lt(0)),
    moneyWhole: (amount, currency) => {
      // Only for display: the calculation never rounds here. A cut to 0 has no sign.
      const whole = amount.abs().round(0, 0);
      return withCurrency(format(whole, 0), currency, amount.lt(0) && whole.gt(0));
    },
    feeValue: (fee) => {
      switch (fee.kind) {
        case "percent":
          return `${exact(fee.rate)}${NBSP}%`;
        case "fixed":
          return `${exact(fee.amount.amount)}${NBSP}${fee.amount.currency}`;
      }
    },
  };
}

/**
 * What `text`, typed in the style `from`, says in the style `to`: its dots and commas swapped
 * ("1.452,30" becomes "1,452.30"). Both styles read with the same rules, separators swapped, so
 * the result is the same number, ambiguity included. Text that is not a number is swapped too,
 * and stays as wrong as it was.
 */
export function convertTyped(text: string, from: NumberStyle, to: NumberStyle): string {
  if (from.decimal === to.decimal) {
    return text;
  }
  return text.replace(/[.,]/g, (separator) => (separator === "." ? "," : "."));
}

function parseNumber(text: string, { group, decimal }: NumberStyle): ParsedNumber {
  const compact = text.replace(/\s/g, "");
  if (compact === "") {
    return { kind: "empty" };
  }
  const negative = compact.startsWith("-");
  const digits = negative ? compact.slice(1) : compact;
  const g = `\\${group}`;
  const d = `\\${decimal}`;
  // A group of thousands never starts with 0: "0.015" and "0,500" have only one reading.
  const grouped = new RegExp(`^[1-9]\\d{0,2}(${g}\\d{3})+(${d}\\d+)?$`);
  const withDecimals = new RegExp(`^\\d+(${d}\\d+)?$`);
  const groupAsDecimal = new RegExp(`^\\d+${g}\\d+$`);
  let normalized: string;
  if (grouped.test(digits)) {
    normalized = digits.replaceAll(group, "").replace(decimal, ".");
  } else if (withDecimals.test(digits)) {
    normalized = digits.replace(decimal, ".");
  } else if (groupAsDecimal.test(digits)) {
    normalized = digits.replace(group, ".");
  } else {
    return { kind: "invalid" };
  }
  const typedDecimals = normalized.includes(".") ? (normalized.split(".")[1] ?? "").length : 0;
  const sign = negative ? "-" : "";
  return {
    kind: "number",
    value: new Decimal(`${sign}${normalized}`),
    typedDecimals,
    alternative: AMBIGUOUS.test(digits)
      ? new Decimal(`${sign}${otherReading(digits, normalized)}`)
      : null,
  };
}

/** One separator, either one, followed by exactly three digits: "1.030", "1,536". */
const AMBIGUOUS = /^[1-9]\d{0,2}[.,]\d{3}$/;

/**
 * The reading `parseNumber` did not choose for an ambiguous text, in JavaScript notation: read
 * as grouping thousands ("1.030" as 1030), the other reading takes the separator as the decimal
 * point (1.03); read as decimals ("1,536" as 1,536), the other drops it (1536).
 */
function otherReading(digits: string, chosen: string): string {
  const asThousands = digits.replace(/[.,]/, "");
  return chosen === asThousands ? digits.replace(/[.,]/, ".") : asThousands;
}

function formatNumber(value: Big, decimals: number, { group, decimal }: NumberStyle): string {
  const fixed = value.toFixed(decimals);
  const negative = fixed.startsWith("-");
  const [integer = "0", fraction] = (negative ? fixed.slice(1) : fixed).split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return `${negative ? "-" : ""}${grouped}${fraction === undefined ? "" : `${decimal}${fraction}`}`;
}

function decimalsOf(value: Big): number {
  const [, fraction = ""] = value.abs().toFixed().split(".");
  return fraction.length;
}
