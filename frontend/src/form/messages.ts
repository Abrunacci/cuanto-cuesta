/** What each problem code means on screen, in Spanish. */

import type {
  Big,
  Fee,
  InputProblem,
  MissingInput,
  Provenance,
  ValueProblem,
} from "../calculator/index.ts";
import type { FeeGap } from "./form.ts";
import { inRange, type PriceCheck } from "./plausible.ts";
import { FEE_DEFAULTS, RATE_FIELDS } from "../calculator/index.ts";
import { lowerFirst } from "../text/case.ts";
import { formatExact, formatFeeValue, formatNumber, formatUnambiguous } from "../text/numbers.ts";

export const NOT_A_NUMBER = "Escribí un número, por ejemplo 1.234,56.";

export function inputProblemMessage(problem: InputProblem): string {
  switch (problem.code) {
    case "not_positive":
      return "Tiene que ser mayor que 0.";
    case "too_many_decimals":
      return `Usá como mucho ${String(problem.max)} decimales.`;
    case "too_large":
      return `No puede ser más de ${formatNumber(problem.max, 0)}.`;
  }
}

/** `unit` is "%" for a percentage or a currency code for an amount. */
export function valueProblemMessage(problem: ValueProblem, unit: string): string {
  switch (problem.code) {
    case "negative":
      return "No puede ser negativo.";
    case "above_cap":
      return `Como máximo ${formatCap(problem.cap)} ${unit}.`;
  }
}

/**
 * A price outside its plausible range, which is still used. When the text was ambiguous
 * ("1.030") and its other reading is plausible, suggest that reading; never a value the person
 * did not type.
 */
export function unusualPriceMessage(
  value: Big,
  alternative: Big | null,
  check: PriceCheck,
): string {
  const read = `Valor inusual: leímos ${formatUnambiguous(value)} ${check.unit} y lo común está entre ${formatExact(check.min)} y ${formatExact(check.max)}. Revisalo.`;
  return alternative !== null && inRange(alternative, check)
    ? `${read} ${didYouMean(alternative)}`
    : read;
}

export function didYouMean(value: Big): string {
  return `¿Quisiste poner ${formatExact(value)}?`;
}

/** What a route is missing, as it reads inside a list ("monto en USD", "dólar MEP (compra)"). */
export function missingInputLabel(
  missing: MissingInput,
  feeGaps: ReadonlyMap<string, FeeGap>,
): string {
  switch (missing.kind) {
    case "amount":
      return "monto en USD";
    case "rate":
      return lowerFirst(
        RATE_FIELDS.find((field) => field.key === missing.key)?.label ?? missing.key,
      );
    case "fee": {
      const label = lowerFirst(
        FEE_DEFAULTS.find((d) => d.fee.id === missing.id)?.label ?? missing.id,
      );
      switch (feeGaps.get(missing.id) ?? "value") {
        case "value":
          return label;
        case "minimum":
          return `el mínimo de ${label}`;
        case "both":
          return `${label} y su mínimo`;
      }
    }
  }
}

/** A few words for what is missing, where there is room for little: "monto", "MEP". */
export function missingInputShortLabel(missing: MissingInput): string {
  switch (missing.kind) {
    case "amount":
      return "monto";
    case "rate":
      return RATE_FIELDS.find((field) => field.key === missing.key)?.shortLabel ?? missing.key;
    case "fee":
      // Never missing in every route at once: each fee belongs to one route, as a data test
      // checks. So this is never shown in the one-line bar.
      return lowerFirst(FEE_DEFAULTS.find((d) => d.fee.id === missing.id)?.label ?? missing.id);
  }
}

function formatCap(cap: Big): string {
  return formatNumber(cap, cap.eq(cap.round(0)) ? 0 : 2);
}

/** A fee's status in words, as its badge shows it. */
export function statusText(provenance: Provenance): string {
  switch (provenance.kind) {
    case "verified":
      return "Verificado";
    case "estimate":
      return "Estimado";
    case "user_defined":
      return "Lo definís vos";
  }
}

/** A fee's badge: the person's own value, or how far to trust the researched one. */
export function feeStatusText(provenance: Provenance, own: boolean): string {
  return own ? "Tu valor" : statusText(provenance);
}

/** The researched value of a fee, minimum included: "1 %, mínimo 5 USD". */
export function referenceValueText(fee: Fee): string {
  const value = formatFeeValue(fee);
  if (fee.kind === "fixed" || fee.minimum === null) {
    return value;
  }
  return `${value}, mínimo ${formatExact(fee.minimum.amount)}\u00a0${fee.minimum.currency}`;
}
