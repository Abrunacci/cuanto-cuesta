/**
 * The researched fee defaults, bundled with the page. They mirror `backend/config/fees.yaml`;
 * `tests/config-parity.test.ts` fails if the two drift apart.
 */

import { fixedFee, percentFee, type Fee } from "../fees.ts";
import { money } from "../money.ts";

export type Provenance =
  | { readonly kind: "verified"; readonly sourceUrl: string; readonly verifiedAt: string }
  | {
      readonly kind: "estimate";
      readonly sourceUrl: string;
      readonly verifiedAt: string;
      readonly upperBound: boolean;
    }
  | { readonly kind: "user_defined"; readonly referenceUrl: string; readonly checkedAt: string };

export interface FeeDefault {
  readonly fee: Fee;
  /** Shown on screen, in Spanish. */
  readonly label: string;
  readonly note: string | null;
  readonly provenance: Provenance;
}

export const FEE_DEFAULTS: readonly FeeDefault[] = [
  {
    fee: fixedFee("payoneer_p2p_transfer", "4.00", "USD"),
    label: "Transferencia de Payoneer al comprador P2P",
    note: "Hasta 4,00 USD si las dos cuentas son del mismo país; hasta 1 % más hasta 4,00 USD si son de países distintos.",
    provenance: {
      kind: "estimate",
      sourceUrl: "https://www.payoneer.com/pricing/",
      verifiedAt: "2026-09-23",
      upperBound: true,
    },
  },
  {
    fee: percentFee("p2p_premium", "0", null),
    label: "Recargo P2P por pagar con Payoneer",
    note: "El precio P2P en vivo no filtra por medio de pago y no se encontraron ofertas públicas que acepten Payoneer. Poné cuánto más pagás realmente sobre ese precio.",
    provenance: {
      kind: "user_defined",
      referenceUrl: "https://docs.criptoya.com/argentina/",
      checkedAt: "2026-09-23",
    },
  },
  {
    fee: fixedFee("binance_p2p_taker", "0.08", "USDT"),
    label: "Comisión taker de Binance P2P",
    note: "Entre 0,06 y 0,08 USDT por orden; el anuncio no dice cuál corresponde a USD.",
    provenance: {
      kind: "estimate",
      sourceUrl:
        "https://www.binance.com/en/support/announcement/detail/70c92ace9acb45529cd4541195248c91",
      verifiedAt: "2026-09-23",
      upperBound: true,
    },
  },
  {
    fee: fixedFee("binance_withdrawal_polygon", "0.07", "USDT"),
    label: "Retiro de USDT de Binance por Polygon",
    note: "Es la red más barata que acepta Bitso. Binance cambia esta comisión seguido.",
    provenance: {
      kind: "verified",
      sourceUrl: "https://www.binance.com/bapi/capital/v1/public/capital/getNetworkCoinAll",
      verifiedAt: "2026-09-23",
    },
  },
  {
    fee: fixedFee("bitso_usdt_deposit", "0", "USDT"),
    label: "Depósito de USDT en Bitso",
    note: null,
    provenance: {
      kind: "verified",
      sourceUrl: "https://bitso.com/ar/fees/transactions",
      verifiedAt: "2026-09-23",
    },
  },
  {
    fee: percentFee("bitso_taker", "0.60", null),
    label: "Comisión taker del libro de órdenes de Bitso",
    note: "Nivel base, con menos de ARS 1.625.000 de volumen en 30 días; en niveles más altos baja hasta 0,15 %.",
    provenance: {
      kind: "verified",
      sourceUrl: "https://bitso.com/ar/fees",
      verifiedAt: "2026-09-23",
    },
  },
  {
    fee: fixedFee("bitso_ars_withdrawal", "0", "ARS"),
    label: "Retiro de ARS de Bitso a CBU/CVU",
    note: null,
    provenance: {
      kind: "verified",
      sourceUrl: "https://bitso.com/ar/fees/transactions",
      verifiedAt: "2026-09-23",
    },
  },
  {
    fee: percentFee("payoneer_us_withdrawal", "4", money("20.00", "USD")),
    label: "Retiro de Payoneer a una cuenta de EE.UU.",
    note: "Entre 1,2 % y 4 % para titulares argentinos, con un mínimo de hasta 20,00 USD. Los valores exactos solo se ven dentro de la cuenta; si no te cobran mínimo, ponelo en 0.",
    provenance: {
      kind: "estimate",
      sourceUrl: "https://www.payoneer.com/pricing/",
      verifiedAt: "2026-09-23",
      upperBound: true,
    },
  },
  {
    fee: fixedFee("arq_ach_deposit", "3.00", "USD"),
    label: "Recepción de ACH en ARQ",
    note: null,
    provenance: {
      kind: "verified",
      sourceUrl:
        "https://help.arqfinance.com/es/articles/13532861-cuenta-sin-fronteras-recarga-en-multiples-monedas",
      verifiedAt: "2026-09-23",
    },
  },
  {
    fee: percentFee("arq_usd_usdc_conversion", "0", null),
    label: "Conversión USD→USDc en ARQ",
    note: 'ARQ acredita los USD que llegan por ACH directamente como USDc, pero no publica la tasa de esa conversión y no se encontró ningún spread documentado. La única comisión publicada para depósitos en USD es la fija de 3 USDc, en el plan Standard (https://help.arqfinance.com/es/articles/16785194-costes-y-comisiones-de-arq-argentina); los términos dicen "al valor equivalente en Dólares Digitales", sin dar la tasa (https://www.arqfinance.com/es-AR/legal/terminos_y_condiciones_cuenta_global_arg, punto 3.1).',
    provenance: {
      kind: "estimate",
      sourceUrl:
        "https://help.arqfinance.com/es/articles/13901700-recargar-mi-cuenta-con-dolares-usd",
      verifiedAt: "2026-09-23",
      upperBound: false,
    },
  },
  {
    fee: fixedFee("arq_ars_withdrawal", "0", "ARS"),
    label: "Retiro de ARS de ARQ a CBU",
    note: null,
    provenance: {
      kind: "verified",
      sourceUrl:
        "https://help.arqfinance.com/es/articles/13532861-cuenta-sin-fronteras-recarga-en-multiples-monedas",
      verifiedAt: "2026-09-23",
    },
  },
  {
    fee: percentFee("payoneer_ar_withdrawal", "2", null),
    label: "Retiro de Payoneer a una cuenta argentina en USD",
    note: '"Hasta 2 %" según esta página; otra página de Payoneer dice 3,3 % de punta a punta para Santander (https://pages.payoneer.com/es/withdrawal-of-funds/).',
    provenance: {
      kind: "estimate",
      sourceUrl:
        "https://www.payoneer.com/es/resources/estrategias-para-usar-y-mover-tus-fondos-en-argentina/",
      verifiedAt: "2026-09-23",
      upperBound: true,
    },
  },
  {
    fee: fixedFee("bank_usd_credit", "0", "USD"),
    label: "Comisión del banco por acreditar la transferencia",
    note: "Los bancos no pueden cobrar por estas operaciones (vigente desde el 15/09/2026).",
    provenance: {
      kind: "verified",
      sourceUrl: "https://www.bcra.gob.ar/Pdfs/comytexord/A8481.pdf",
      verifiedAt: "2026-09-23",
    },
  },
  {
    fee: percentFee("broker_buy", "0.05", null),
    label: "Comisión del broker, compra de AL30D",
    note: 'Balanz, "hasta 0,05 %" en bonos soberanos. Depende de tu broker o banco.',
    provenance: {
      kind: "estimate",
      sourceUrl: "https://balanz.com/comisiones/",
      verifiedAt: "2026-09-23",
      upperBound: true,
    },
  },
  {
    fee: percentFee("broker_sell", "0.05", null),
    label: "Comisión del broker, venta de AL30",
    note: 'Balanz, "hasta 0,05 %" en bonos soberanos. Depende de tu broker o banco.',
    provenance: {
      kind: "estimate",
      sourceUrl: "https://balanz.com/comisiones/",
      verifiedAt: "2026-09-23",
      upperBound: true,
    },
  },
  {
    fee: percentFee("byma_buy", "0.01", null),
    label: "Derechos de mercado BYMA, compra de AL30D",
    note: "Se cobra en cada punta de la operación MEP.",
    provenance: {
      kind: "verified",
      sourceUrl:
        "https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a2875749a418f0439d7de8f_BYMA-Derechos-Mercado-sobre-Operaciones_2026-06-09.pdf",
      verifiedAt: "2026-09-23",
    },
  },
  {
    fee: percentFee("byma_sell", "0.01", null),
    label: "Derechos de mercado BYMA, venta de AL30",
    note: "Se cobra en cada punta de la operación MEP.",
    provenance: {
      kind: "verified",
      sourceUrl:
        "https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a2875749a418f0439d7de8f_BYMA-Derechos-Mercado-sobre-Operaciones_2026-06-09.pdf",
      verifiedAt: "2026-09-23",
    },
  },
];
