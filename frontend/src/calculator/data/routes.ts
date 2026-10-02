/**
 * The four routes, as data. This is their only definition: `data.test.ts` checks that they chain
 * their currencies and use only fees and rates that exist. What the screen calls each route, step
 * and price is in each language's texts (`src/i18n`), by id.
 */

import type { RateDefinition } from "../rates.ts";
import type { Route } from "../routes.ts";

/** Every route ends in pesos: that is what reaches the bank. */
export const TARGET_CURRENCY = "ARS";

export const ROUTES: readonly Route[] = [
  {
    id: "binance_card_bitso",
    source: "USD",
    target: "ARS",
    steps: [
      {
        id: "card_buy",
        feeIds: ["binance_card_purchase"],
        conversion: { rateKey: "binance_card_usd_usdt", target: "USDT" },
      },
      {
        id: "usdt_to_bitso",
        feeIds: ["binance_withdrawal_polygon", "bitso_usdt_deposit"],
        conversion: null,
      },
      {
        id: "bitso_sell",
        feeIds: ["bitso_taker"],
        conversion: { rateKey: "bitso_usdt_ars", target: "ARS" },
      },
      { id: "ars_to_bank", feeIds: ["bitso_ars_withdrawal"], conversion: null },
    ],
    // Adding funds with a card is a standard Binance feature, not a payment from a third party.
    risk: null,
  },
  {
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
        feeIds: ["binance_withdrawal_polygon", "bitso_usdt_deposit"],
        conversion: null,
      },
      {
        id: "bitso_sell",
        feeIds: ["bitso_taker"],
        conversion: { rateKey: "bitso_usdt_ars", target: "ARS" },
      },
      { id: "ars_to_bank", feeIds: ["bitso_ars_withdrawal"], conversion: null },
    ],
    risk: "account_block",
  },
  {
    id: "arq",
    source: "USD",
    target: "ARS",
    steps: [
      { id: "payoneer_to_arq", feeIds: ["payoneer_us_withdrawal"], conversion: null },
      {
        id: "arq_ach",
        feeIds: ["arq_ach_deposit", "arq_usd_usdc_conversion"],
        conversion: null,
      },
      {
        id: "arq_convert",
        feeIds: [],
        conversion: { rateKey: "arq_usd_ars", target: "ARS" },
      },
      { id: "ars_to_bank", feeIds: ["arq_ars_withdrawal"], conversion: null },
    ],
    risk: null,
  },
  {
    id: "mep",
    source: "USD",
    target: "ARS",
    steps: [
      {
        id: "payoneer_to_bank",
        feeIds: ["payoneer_ar_withdrawal"],
        conversion: null,
      },
      {
        id: "bank_credit",
        feeIds: ["bank_usd_credit"],
        conversion: null,
      },
      {
        id: "mep_bonds",
        feeIds: ["broker_buy", "broker_sell", "byma_buy", "byma_sell"],
        conversion: { rateKey: "mep", target: "ARS" },
      },
    ],
    risk: null,
  },
];

/** A price the person types; what the screen calls it is in each language's texts. */
export type RateField = RateDefinition;

/**
 * Every price the person types. ARQ credits incoming dollars as USDc and the app treats USDc at
 * par with USD (the fee `arq_usd_usdc_conversion` holds the assumption), so ARQ's rate is USD/ARS.
 */
export const RATE_FIELDS: readonly RateField[] = [
  {
    key: "mep",
    base: "USD",
    quote: "ARS",
  },
  {
    key: "binance_p2p_usdt_usd",
    base: "USDT",
    quote: "USD",
  },
  {
    key: "bitso_usdt_ars",
    base: "USDT",
    quote: "ARS",
  },
  {
    key: "arq_usd_ars",
    base: "USD",
    quote: "ARS",
  },
  {
    key: "binance_card_usd_usdt",
    base: "USD",
    quote: "USDT",
  },
];

/** The price the person types for this rate key, if there is one. */
export function rateField(key: string): RateField | undefined {
  return RATE_FIELDS.find((field) => field.key === key);
}
