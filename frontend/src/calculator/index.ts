export { compareRoutes, isRecommended, routesInOrder } from "./compare.ts";
export type {
  Ahead,
  Alone,
  Behind,
  CompleteRoute,
  Comparison,
  DataError,
  FailedRoute,
  ComparisonInput,
  IncompleteRoute,
  MissingInput,
  Over,
  Ranking,
  RouteComparison,
  Standing,
  Tied,
  Unrivaled,
} from "./compare.ts";
export { FEE_DEFAULTS, feeDefault, feeLabel } from "./data/fees.ts";
export type { FeeDefault, Provenance } from "./data/fees.ts";
export { RATE_FIELDS, rateField, ROUTES, TARGET_CURRENCY } from "./data/routes.ts";
export type { RateField } from "./data/routes.ts";
export { charge, fixedFee, percentFee, withoutCharge } from "./fees.ts";
export type { Fee, FixedFee, PercentFee } from "./fees.ts";
export { MAX_AMOUNT, MAX_PRICE_DECIMALS, positiveAmount, positivePrice } from "./inputs.ts";
export type { InputProblem, PositiveAmount, PositivePrice, Validated } from "./inputs.ts";
export { feeProblems, MAX_PERCENT, maxFixed, valueCap, valueProblem } from "./limits.ts";
export type { FeeProblem, ValueProblem } from "./limits.ts";
export { Decimal, money } from "./money.ts";
export type { Big, Currency, Money } from "./money.ts";
export type { Route, RouteResult, RouteRisk, Step, StepResult } from "./routes.ts";
export type { RateDefinition } from "./rates.ts";
