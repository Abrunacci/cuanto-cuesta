/**
 * The three routes, as data. They mirror `backend/config/routes.yaml`;
 * `tests/config-parity.test.ts` fails if the two drift apart.
 */

import type { RateDefinition } from "../rates.ts";
import type { Route } from "../routes.ts";

export const ROUTES: readonly Route[] = [
  {
    id: "binance_bitso",
    name: "Binance P2P + Bitso",
    source: "USD",
    target: "ARS",
    steps: [
      {
        label: "Vender USD por USDT en Binance P2P",
        feeIds: ["payoneer_p2p_transfer", "p2p_premium", "binance_p2p_taker"],
        conversion: { rateKey: "p2p_usdt_usd", target: "USDT" },
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
      "El precio P2P es el de la oferta genérica USDT/USD, no el de avisos que acepten Payoneer.",
    ],
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
      "Si en los últimos 90 días compraste dólar oficial o transferiste dólares de tu cuenta en un banco argentino a una cuenta bancaria tuya en el exterior, no podés vender dólares por MEP (BCRA, texto ordenado de Exterior y Cambios, puntos 3.8.5 y 3.14.1.2): https://www.bcra.gob.ar/Pdfs/comytexord/A8481.pdf",
    ],
  },
];

export interface RateField extends RateDefinition {
  /** Shown on screen, in Spanish. */
  readonly label: string;
  /** Where to find this price, in a line, shown on screen in Spanish. */
  readonly help: string;
}

/** The MEP dollar is both the reference and the rate of the MEP route. */
export const REFERENCE_KEY = "mep";

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
    help: "Lo que te pagan por cada dólar vendido por MEP. Lo ves en tu banco o broker.",
  },
  {
    key: "p2p_usdt_usd",
    base: "USDT",
    quote: "USD",
    label: "Precio P2P en Binance (USD por USDT)",
    help: "En Binance P2P, cuántos USD cuesta cada USDT en los avisos para comprar.",
  },
  {
    key: "bitso_usdt_ars",
    base: "USDT",
    quote: "ARS",
    label: "Precio de venta en Bitso (ARS por USDT)",
    help: "En Bitso, cuántos pesos te dan por cada USDT que vendés.",
  },
  {
    key: "arq_usd_ars",
    base: "USD",
    quote: "ARS",
    label: "Cotización de ARQ (ARS por USDc)",
    help: "En la app de ARQ, cuántos pesos te dan por cada dólar digital (USDc).",
  },
];
