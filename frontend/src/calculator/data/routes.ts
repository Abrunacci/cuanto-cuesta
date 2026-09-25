/**
 * The four routes, as data. This is their only definition: `data.test.ts` checks that they chain
 * their currencies and use only fees and rates that exist.
 */

import type { RateDefinition } from "../rates.ts";
import type { Route } from "../routes.ts";

/** Every route ends in pesos: that is what reaches the bank. */
export const TARGET_CURRENCY = "ARS";

export const ROUTES: readonly Route[] = [
  {
    id: "binance_card_bitso",
    name: "Binance con tarjeta + Bitso",
    source: "USD",
    target: "ARS",
    steps: [
      {
        label: "Comprar USDT con la tarjeta de Payoneer en Binance",
        feeIds: ["binance_card_purchase"],
        conversion: { rateKey: "binance_card_usd_usdt", target: "USDT" },
      },
      {
        label: "Retirar USDT a Bitso por Polygon",
        feeIds: ["binance_withdrawal_polygon", "bitso_usdt_deposit"],
        conversion: null,
      },
      {
        label: "Vender USDT por ARS en Bitso",
        feeIds: ["bitso_taker"],
        conversion: { rateKey: "bitso_usdt_ars", target: "ARS" },
      },
      { label: "Retirar ARS al banco", feeIds: ["bitso_ars_withdrawal"], conversion: null },
    ],
    warnings: [],
    risk: null,
  },
  {
    id: "binance_p2p_bitso",
    name: "Binance P2P + Bitso",
    source: "USD",
    target: "ARS",
    steps: [
      {
        label: "Vender USD por USDT en Binance P2P",
        feeIds: ["payoneer_p2p_transfer", "p2p_premium", "binance_p2p_taker"],
        conversion: { rateKey: "binance_p2p_usdt_usd", target: "USDT" },
      },
      {
        label: "Retirar USDT a Bitso por Polygon",
        feeIds: ["binance_withdrawal_polygon", "bitso_usdt_deposit"],
        conversion: null,
      },
      {
        label: "Vender USDT por ARS en Bitso",
        feeIds: ["bitso_taker"],
        conversion: { rateKey: "bitso_usdt_ars", target: "ARS" },
      },
      { label: "Retirar ARS al banco", feeIds: ["bitso_ars_withdrawal"], conversion: null },
    ],
    warnings: [
      "Pagar P2P con Payoneer puede hacer que Binance bloquee tu cuenta. El precio P2P es el de la oferta genérica USDT/USD.",
    ],
    risk: {
      label: "Riesgo de bloqueo",
      detail: "con riesgo de bloqueo de tu cuenta de Binance",
    },
  },
  {
    id: "arq",
    name: "ARQ (ex DolarApp)",
    source: "USD",
    target: "ARS",
    steps: [
      { label: "Retirar de Payoneer a ARQ", feeIds: ["payoneer_us_withdrawal"], conversion: null },
      {
        label: "ARQ recibe la transferencia ACH",
        feeIds: ["arq_ach_deposit", "arq_usd_usdc_conversion"],
        conversion: null,
      },
      {
        label: "Convertir USDc a ARS en ARQ",
        feeIds: [],
        conversion: { rateKey: "arq_usd_ars", target: "ARS" },
      },
      { label: "Retirar ARS al banco", feeIds: ["arq_ars_withdrawal"], conversion: null },
    ],
    warnings: [],
    risk: null,
  },
  {
    id: "mep",
    name: "Dólar MEP",
    source: "USD",
    target: "ARS",
    steps: [
      {
        label: "Retirar de Payoneer a una cuenta argentina en USD",
        feeIds: ["payoneer_ar_withdrawal"],
        conversion: null,
      },
      {
        label: "El banco acredita la transferencia",
        feeIds: ["bank_usd_credit"],
        conversion: null,
      },
      {
        label: "Comprar AL30D y vender AL30",
        feeIds: ["broker_buy", "broker_sell", "byma_buy", "byma_sell"],
        conversion: { rateKey: "mep", target: "ARS" },
      },
    ],
    warnings: [
      "[Verificá las restricciones sobre el dólar MEP](https://www.bcra.gob.ar/Pdfs/comytexord/A8481.pdf)",
    ],
    risk: null,
  },
];

export interface RateField extends RateDefinition {
  /** Shown on screen, in Spanish. */
  readonly label: string;
  /** A word or two, where there is room for little: "MEP". */
  readonly shortLabel: string;
  /** Where to find this price, in a line, shown on screen in Spanish. */
  readonly help: string;
}

/**
 * Every price the person types. ARQ credits incoming dollars as USDc and the app treats USDc at
 * par with USD (the fee `arq_usd_usdc_conversion` holds the assumption), so ARQ's rate is USD/ARS.
 */
export const RATE_FIELDS: readonly RateField[] = [
  {
    key: "mep",
    base: "USD",
    quote: "ARS",
    label: "Dólar MEP (compra)",
    shortLabel: "MEP",
    help: "Lo que te pagan por cada dólar vendido por MEP. Lo ves en tu banco o broker.",
  },
  {
    key: "binance_p2p_usdt_usd",
    base: "USDT",
    quote: "USD",
    label: "Precio P2P en Binance (USD por USDT)",
    shortLabel: "precio P2P",
    help: "En Binance P2P, cuántos USD cuesta cada USDT en los avisos para comprar.",
  },
  {
    key: "bitso_usdt_ars",
    base: "USDT",
    quote: "ARS",
    label: "Precio de venta en Bitso (ARS por USDT)",
    shortLabel: "precio Bitso",
    help: "En Bitso, cuántos pesos te dan por cada USDT que vendés.",
  },
  {
    key: "arq_usd_ars",
    base: "USD",
    quote: "ARS",
    label: "Cotización de ARQ (ARS por USDc)",
    shortLabel: "cotización ARQ",
    help: "En la app de ARQ, cuántos pesos te dan por cada dólar digital (USDc).",
  },
  {
    key: "binance_card_usd_usdt",
    base: "USD",
    quote: "USDT",
    label: "Binance con tarjeta (USDT por USD)",
    shortLabel: "precio con tarjeta",
    help: "En Binance, Comprar con tarjeta: los USDT por cada USD de la pantalla final de pago, antes de confirmar. No uses el de la lista de métodos de pago: es más alto que el real.",
  },
];
