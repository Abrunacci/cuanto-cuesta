/** What each problem code means on screen, in the page's language. */

import type {
  Big,
  Fee,
  InputProblem,
  MissingInput,
  Provenance,
  ValueProblem,
} from "../calculator/index.ts";
import { feeInSentence, rateInSentence, rateTexts, type Texts } from "../i18n/index.ts";
import type { FeeGap } from "./form.ts";
import { inRange, type PriceCheck } from "./plausible.ts";

export function inputProblemMessage(t: Texts, problem: InputProblem): string {
  switch (problem.code) {
    case "not_positive":
      return t.problems.notPositive;
    case "too_many_decimals":
      return t.problems.tooManyDecimals(problem.max);
    case "too_large":
      return t.problems.tooLarge(t.numbers.format(problem.max, 0));
  }
}

/** `unit` is "%" for a percentage or a currency code for an amount. */
export function valueProblemMessage(t: Texts, problem: ValueProblem, unit: string): string {
  switch (problem.code) {
    case "negative":
      return t.problems.negative;
    case "above_cap":
      return t.problems.aboveCap(formatCap(t, problem.cap), unit);
  }
}

/**
 * A price outside its plausible range, which is still used. When the text was ambiguous
 * ("1.030") and its other reading is plausible, suggest that reading; never a value the person
 * did not type.
 */
export function unusualPriceMessage(
  t: Texts,
  key: string,
  value: Big,
  alternative: Big | null,
  check: PriceCheck,
): string {
  const { numbers } = t;
  const read = t.problems.unusualPrice(
    numbers.unambiguous(value),
    rateTexts(t, key).unit,
    numbers.exact(check.min),
    numbers.exact(check.max),
  );
  return alternative !== null && inRange(alternative, check)
    ? `${read} ${didYouMean(t, alternative)}`
    : read;
}

export function didYouMean(t: Texts, value: Big): string {
  return t.problems.didYouMean(t.numbers.exact(value));
}

/** What a route is missing, as it reads inside a list ("monto en USD", "dólar MEP (compra)"). */
export function missingInputLabel(
  t: Texts,
  missing: MissingInput,
  feeGaps: ReadonlyMap<string, FeeGap>,
): string {
  switch (missing.kind) {
    case "amount":
      return t.missing.amount;
    case "rate":
      return rateInSentence(t, missing.key);
    case "fee": {
      const label = feeInSentence(t, missing.id);
      switch (feeGaps.get(missing.id) ?? "value") {
        case "value":
          return label;
        case "minimum":
          return t.missing.feeMinimum(label);
        case "both":
          return t.missing.feeAndMinimum(label);
      }
    }
  }
}

/** A few words for what is missing, where there is room for little: "monto", "MEP". */
export function missingInputShortLabel(t: Texts, missing: MissingInput): string {
  switch (missing.kind) {
    case "amount":
      return t.missing.amountShort;
    case "rate":
      return rateTexts(t, missing.key).shortLabel;
    case "fee":
      // Never missing in every route at once: no fee is used by every route, as a data test
      // checks. So this is never shown in the one-line bar.
      return feeInSentence(t, missing.id);
  }
}

function formatCap(t: Texts, cap: Big): string {
  return t.numbers.format(cap, cap.eq(cap.round(0)) ? 0 : 2);
}

/** A fee's status in words, as its badge shows it. */
export function statusText(t: Texts, provenance: Provenance): string {
  switch (provenance.kind) {
    case "verified":
      return t.feeStatus.verified;
    case "estimate":
      return t.feeStatus.estimate;
    case "user_defined":
      return t.feeStatus.userDefined;
  }
}

/** A fee's badge: the person's own value, or how far to trust the researched one. */
export function feeStatusText(t: Texts, provenance: Provenance, own: boolean): string {
  return own ? t.feeStatus.own : statusText(t, provenance);
}

/** The researched value of a fee, minimum included: "1 %, mínimo 5 USD". */
export function referenceValueText(t: Texts, fee: Fee): string {
  const value = t.numbers.feeValue(fee);
  if (fee.kind === "fixed" || fee.minimum === null) {
    return t.referenceValue(value, null);
  }
  return t.referenceValue(
    value,
    `${t.numbers.exact(fee.minimum.amount)}\u00a0${fee.minimum.currency}`,
  );
}
