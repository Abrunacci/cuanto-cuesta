/** What each problem code means on screen, in Spanish. */

import type { Big, InputProblem, MissingInput, ValueProblem } from "../calculator/index.ts";
import { FEE_DEFAULTS, RATE_FIELDS } from "../calculator/index.ts";
import { formatNumber } from "../text/numbers.ts";

export const NOT_A_NUMBER = "Escribí un número, por ejemplo 1.234,56.";

export function inputProblemMessage(problem: InputProblem): string {
  switch (problem.code) {
    case "not_positive":
      return "Tiene que ser mayor que 0.";
    case "too_many_decimals":
      return `Usá como mucho ${String(problem.max)} decimales.`;
    case "too_large":
      return `Tiene que ser como mucho ${formatNumber(problem.max, 0)}.`;
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

export function missingInputLabel(missing: MissingInput): string {
  switch (missing.kind) {
    case "amount":
      return "el monto en USD";
    case "rate":
      return RATE_FIELDS.find((field) => field.key === missing.key)?.label ?? missing.key;
    case "fee":
      return FEE_DEFAULTS.find((d) => d.fee.id === missing.id)?.label ?? missing.id;
  }
}

function formatCap(cap: Big): string {
  return formatNumber(cap, cap.eq(cap.round(0)) ? 0 : 2);
}
