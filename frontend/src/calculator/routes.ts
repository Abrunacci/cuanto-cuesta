/**
 * Routes are data: ordered steps. A step may charge fees, convert currency, or both. Within a
 * step:
 *
 * 1. percent fees and fixed fees in the step's input currency are deducted;
 * 2. the conversion (if any) is applied;
 * 3. fixed fees in the conversion's target currency are deducted.
 *
 * Ported from the Python domain's `calculation.py`, since removed; the tests keep the results it
 * gave.
 */

import { charge, type Fee } from "./fees.ts";
import {
  CurrencyMismatchError,
  isNegative,
  roundedDown,
  subtract,
  zero,
  type Currency,
  type Money,
} from "./money.ts";
import { convert, type Rate } from "./rates.ts";

export interface Conversion {
  readonly rateKey: string;
  readonly target: Currency;
}

export interface Step {
  readonly label: string;
  readonly feeIds: readonly string[];
  readonly conversion: Conversion | null;
}

export interface Route {
  readonly id: string;
  readonly name: string;
  readonly source: Currency;
  readonly target: Currency;
  readonly steps: readonly Step[];
  readonly warnings: readonly string[];
  /** A route that can cost the person more than money is never recommended; null for most. */
  readonly risk: RouteRisk | null;
}

/** What a risky route can cost the person, shown on screen in Spanish. */
export interface RouteRisk {
  /** A few words next to the route's name: "Riesgo de bloqueo". */
  readonly label: string;
  /** Said after what the route delivers: "con riesgo de bloqueo de tu cuenta de Binance". */
  readonly detail: string;
}

export interface ChargedFee {
  readonly fee: Fee;
  readonly amount: Money;
}

export interface StepResult {
  readonly step: Step;
  readonly amountIn: Money;
  readonly fees: readonly ChargedFee[];
  readonly rate: Rate | null;
  readonly amountOut: Money;
}

export interface RouteResult {
  readonly route: Route;
  readonly steps: readonly StepResult[];
  readonly final: Money;
  /** True when fees consumed the whole amount at some step. */
  readonly exhausted: boolean;
}

export class UnknownFeeError extends Error {
  override name = "UnknownFeeError";
}

export class UnknownRateError extends Error {
  override name = "UnknownRateError";
}

/** Problems with a route's shape: empty, a step that does nothing, or a broken currency chain. */
export function routeProblems(route: Route): string[] {
  if (route.steps.length === 0) {
    return [`Route ${route.id} has no steps`];
  }
  const problems: string[] = [];
  let currency = route.source;
  for (const step of route.steps) {
    if (step.conversion === null && step.feeIds.length === 0) {
      problems.push(`Route ${route.id}: step ${step.label} neither charges fees nor converts`);
    }
    if (step.conversion !== null) {
      if (step.conversion.target === currency) {
        problems.push(`Route ${route.id}: step ${step.label} converts ${currency} to itself`);
      }
      currency = step.conversion.target;
    }
  }
  if (currency !== route.target) {
    problems.push(`Route ${route.id} ends in ${currency}, expected ${route.target}`);
  }
  return problems;
}

export function feeIds(route: Route): ReadonlySet<string> {
  return new Set(route.steps.flatMap((step) => step.feeIds));
}

export function rateKeys(route: Route): ReadonlySet<string> {
  return new Set(
    route.steps.flatMap((step) => (step.conversion !== null ? [step.conversion.rateKey] : [])),
  );
}

export function runRoute(
  route: Route,
  amount: Money,
  fees: ReadonlyMap<string, Fee>,
  rates: ReadonlyMap<string, Rate>,
): RouteResult {
  if (amount.currency !== route.source) {
    throw new CurrencyMismatchError(
      `Route ${route.id} starts in ${route.source}, got ${amount.currency}`,
    );
  }
  let current = amount;
  let exhausted = false;
  const results: StepResult[] = [];
  for (const step of route.steps) {
    const result = runStep(step, current, fees, rates);
    exhausted ||= result.exhausted;
    results.push(result.step);
    current = result.step.amountOut;
  }
  if (current.currency !== route.target) {
    throw new CurrencyMismatchError(
      `Route ${route.id} ends in ${current.currency}, it declares ${route.target}`,
    );
  }
  return { route, steps: results, final: current, exhausted };
}

function runStep(
  step: Step,
  amountIn: Money,
  fees: ReadonlyMap<string, Fee>,
  rates: ReadonlyMap<string, Rate>,
): { step: StepResult; exhausted: boolean } {
  const target = step.conversion !== null ? step.conversion.target : amountIn.currency;
  const before: Fee[] = [];
  const after: Fee[] = [];
  for (const fee of step.feeIds.map((id) => lookupFee(fees, id))) {
    switch (fee.kind) {
      case "percent":
        if (fee.minimum !== null && fee.minimum.currency !== amountIn.currency) {
          throw new CurrencyMismatchError(
            `Step ${step.label}: fee ${fee.id} has its minimum in ${fee.minimum.currency}, ` +
              `expected ${amountIn.currency}`,
          );
        }
        before.push(fee);
        break;
      case "fixed":
        if (fee.amount.currency === amountIn.currency) {
          before.push(fee);
        } else if (fee.amount.currency === target) {
          after.push(fee);
        } else {
          throw new CurrencyMismatchError(
            `Step ${step.label}: fee ${fee.id} is in ${fee.amount.currency}, ` +
              `expected ${amountIn.currency} or ${target}`,
          );
        }
        break;
    }
  }

  const charged: ChargedFee[] = [];
  let current = amountIn;
  for (const fee of before) {
    const amount = charge(fee, amountIn);
    charged.push({ fee, amount });
    current = subtract(current, amount);
  }
  let exhausted = isNegative(current);
  if (exhausted) {
    current = zero(current.currency);
  }

  let rate: Rate | null = null;
  if (step.conversion !== null) {
    rate = lookupRate(rates, step.conversion.rateKey);
    current = convert(rate, current, step.conversion.target);
  }

  for (const fee of after) {
    const amount = charge(fee, current);
    charged.push({ fee, amount });
    current = subtract(current, amount);
  }
  if (isNegative(current)) {
    exhausted = true;
    current = zero(current.currency);
  }

  return {
    step: { step, amountIn, fees: charged, rate, amountOut: roundedDown(current) },
    exhausted,
  };
}

function lookupFee(fees: ReadonlyMap<string, Fee>, id: string): Fee {
  const fee = fees.get(id);
  if (fee === undefined) {
    throw new UnknownFeeError(`Fee ${id} was not provided`);
  }
  return fee;
}

function lookupRate(rates: ReadonlyMap<string, Rate>, key: string): Rate {
  const found = rates.get(key);
  if (found === undefined) {
    throw new UnknownRateError(`Rate ${key} was not provided`);
  }
  return found;
}
