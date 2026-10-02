/**
 * Fees, rates and routes shaped like the real ones. They were copied from the Python domain's
 * sample, since removed, so the frozen results computed with it still apply. The values are test
 * inputs, not the app's defaults.
 */

import type { RateDefinition } from "./rates.ts";
import { fixedFee, percentFee, type Fee } from "./fees.ts";
import {
  positiveAmount,
  positivePrice,
  type PositiveAmount,
  type PositivePrice,
} from "./inputs.ts";
import { Decimal, money } from "./money.ts";
import type { Route } from "./routes.ts";

export const SAMPLE_FEES: ReadonlyMap<string, Fee> = new Map(
  [
    fixedFee("payoneer_p2p_transfer", "4", "USD"),
    percentFee("p2p_premium", "1"),
    fixedFee("binance_p2p_taker", "0.08", "USDT"),
    fixedFee("binance_withdrawal_polygon", "0.07", "USDT"),
    percentFee("bitso_taker", "0.6"),
    fixedFee("bitso_ars_withdrawal", "0", "ARS"),
    percentFee("payoneer_us_withdrawal", "4", money("20", "USD")),
    fixedFee("arq_ach_deposit", "3", "USD"),
    fixedFee("arq_ars_withdrawal", "0", "ARS"),
    percentFee("payoneer_ar_withdrawal", "2"),
    fixedFee("bank_usd_credit", "0", "USD"),
    percentFee("broker_buy", "0.05"),
    percentFee("broker_sell", "0.05"),
    percentFee("byma_buy", "0.01"),
    percentFee("byma_sell", "0.01"),
  ].map((fee) => [fee.id, fee]),
);

/** Python's sample had bid and ask; each route used one side, so the price here is that side. */
export const SAMPLE_RATE_DEFINITIONS: readonly RateDefinition[] = [
  { key: "binance_p2p_usdt_usd", base: "USDT", quote: "USD" }, // ask 1.03: buying USDT with USD
  { key: "bitso_usdt_ars", base: "USDT", quote: "ARS" }, // bid 1596.21: selling USDT
  { key: "arq_usd_ars", base: "USD", quote: "ARS" }, // bid 1593.385: selling USD
  { key: "mep", base: "USD", quote: "ARS" },
];

/** A price the tests know is valid; throws otherwise. */
export function validPrice(text: string): PositivePrice {
  const result = positivePrice(new Decimal(text));
  if (!result.ok) {
    throw new Error(`Invalid test price ${text}: ${result.problem.code}`);
  }
  return result.value;
}

/** A USD amount the tests know is valid; throws otherwise. */
export function validAmount(text: string): PositiveAmount {
  const result = positiveAmount(new Decimal(text), "USD");
  if (!result.ok) {
    throw new Error(`Invalid test amount ${text}: ${result.problem.code}`);
  }
  return result.value;
}

export const SAMPLE_PRICES: ReadonlyMap<string, PositivePrice> = new Map([
  ["binance_p2p_usdt_usd", validPrice("1.03")],
  ["bitso_usdt_ars", validPrice("1596.21")],
  ["arq_usd_ars", validPrice("1593.385")],
  ["mep", validPrice("1536.16")],
]);

export const BINANCE: Route = {
  id: "binance_p2p_bitso",
  source: "USD",
  target: "ARS",
  steps: [
    {
      id: "p2p_sell",
      feeIds: ["payoneer_p2p_transfer", "p2p_premium", "binance_p2p_taker"],
      conversion: { rateKey: "binance_p2p_usdt_usd", target: "USDT" },
    },
    {
      id: "usdt_to_bitso",
      feeIds: ["binance_withdrawal_polygon"],
      conversion: null,
    },
    {
      id: "bitso_sell",
      feeIds: ["bitso_taker"],
      conversion: { rateKey: "bitso_usdt_ars", target: "ARS" },
    },
    { id: "ars_to_bank", feeIds: ["bitso_ars_withdrawal"], conversion: null },
  ],
  risk: null,
};

export const ARQ: Route = {
  id: "arq",
  source: "USD",
  target: "ARS",
  steps: [
    {
      id: "payoneer_to_arq",
      feeIds: ["payoneer_us_withdrawal"],
      conversion: null,
    },
    { id: "arq_ach", feeIds: ["arq_ach_deposit"], conversion: null },
    {
      id: "arq_convert",
      feeIds: [],
      conversion: { rateKey: "arq_usd_ars", target: "ARS" },
    },
    { id: "ars_to_bank", feeIds: ["arq_ars_withdrawal"], conversion: null },
  ],
  risk: null,
};

export const MEP_ROUTE: Route = {
  id: "mep",
  source: "USD",
  target: "ARS",
  steps: [
    {
      id: "payoneer_to_bank",
      feeIds: ["payoneer_ar_withdrawal"],
      conversion: null,
    },
    { id: "bank_credit", feeIds: ["bank_usd_credit"], conversion: null },
    {
      id: "mep_bonds",
      feeIds: ["broker_buy", "broker_sell", "byma_buy", "byma_sell"],
      conversion: { rateKey: "mep", target: "ARS" },
    },
  ],
  risk: null,
};

export const SAMPLE_ROUTES: readonly Route[] = [BINANCE, ARQ, MEP_ROUTE];
