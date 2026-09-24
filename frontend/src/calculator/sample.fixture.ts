/**
 * Fees, rates and routes shaped like the real ones, copied from
 * `backend/tests/unit/domain/sample.py` so the parity tests run the same inputs as the Python
 * domain. The values are test inputs, not the app's defaults.
 */

import type { RateDefinition } from "./compare.ts";
import { fixedFee, percentFee, type Fee } from "./fees.ts";
import { Decimal, money, type Big } from "./money.ts";
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

/** Python's sample has bid and ask; each route uses one side, so the price here is that side. */
export const SAMPLE_RATE_DEFINITIONS: readonly RateDefinition[] = [
  { key: "p2p_usdt_usd", base: "USDT", quote: "USD" }, // ask 1.03: buying USDT with USD
  { key: "bitso_usdt_ars", base: "USDT", quote: "ARS" }, // bid 1596.21: selling USDT
  { key: "arq_usd_ars", base: "USD", quote: "ARS" }, // bid 1593.385: selling USD
  { key: "mep", base: "USD", quote: "ARS" },
];

export const SAMPLE_PRICES: ReadonlyMap<string, Big> = new Map([
  ["p2p_usdt_usd", new Decimal("1.03")],
  ["bitso_usdt_ars", new Decimal("1596.21")],
  ["arq_usd_ars", new Decimal("1593.385")],
  ["mep", new Decimal("1536.16")],
]);

export const BINANCE: Route = {
  id: "binance_bitso",
  name: "Binance + Bitso",
  source: "USD",
  target: "ARS",
  steps: [
    {
      label: "Sell USD on Binance P2P",
      feeIds: ["payoneer_p2p_transfer", "p2p_premium", "binance_p2p_taker"],
      conversion: { rateKey: "p2p_usdt_usd", target: "USDT" },
    },
    {
      label: "Withdraw to Bitso over Polygon",
      feeIds: ["binance_withdrawal_polygon"],
      conversion: null,
    },
    {
      label: "Sell USDT on Bitso",
      feeIds: ["bitso_taker"],
      conversion: { rateKey: "bitso_usdt_ars", target: "ARS" },
    },
    { label: "Withdraw to bank", feeIds: ["bitso_ars_withdrawal"], conversion: null },
  ],
  warnings: [],
};

export const ARQ: Route = {
  id: "arq",
  name: "ARQ",
  source: "USD",
  target: "ARS",
  steps: [
    {
      label: "Withdraw from Payoneer to ARQ",
      feeIds: ["payoneer_us_withdrawal"],
      conversion: null,
    },
    { label: "ARQ receives ACH", feeIds: ["arq_ach_deposit"], conversion: null },
    {
      label: "Convert to ARS",
      feeIds: [],
      conversion: { rateKey: "arq_usd_ars", target: "ARS" },
    },
    { label: "Withdraw to bank", feeIds: ["arq_ars_withdrawal"], conversion: null },
  ],
  warnings: [],
};

export const MEP_ROUTE: Route = {
  id: "mep",
  name: "Dólar MEP",
  source: "USD",
  target: "ARS",
  steps: [
    {
      label: "Withdraw from Payoneer to a USD account",
      feeIds: ["payoneer_ar_withdrawal"],
      conversion: null,
    },
    { label: "Bank credits the transfer", feeIds: ["bank_usd_credit"], conversion: null },
    {
      label: "Sell through MEP",
      feeIds: ["broker_buy", "broker_sell", "byma_buy", "byma_sell"],
      conversion: { rateKey: "mep", target: "ARS" },
    },
  ],
  warnings: ["90-day cross restriction"],
};

export const SAMPLE_ROUTES: readonly Route[] = [BINANCE, ARQ, MEP_ROUTE];
