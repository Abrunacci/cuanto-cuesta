/**
 * The researched fee defaults, bundled with the page. They mirror `backend/config/fees.yaml`,
 * whose Spanish label and note mirror the Spanish texts (`src/i18n/es.ts`);
 * `tests/config-parity.test.ts` fails if they drift apart.
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

/** A fee's researched value. Its name and note on screen are in each language's texts. */
export interface FeeDefault {
  readonly fee: Fee;
  readonly provenance: Provenance;
}

export const FEE_DEFAULTS: readonly FeeDefault[] = [
  {
    fee: percentFee("binance_card_purchase", "2", null),
    provenance: {
      kind: "verified",
      sourceUrl:
        "https://www.binance.com/en/blog/fiat/can-you-buy-cryptocurrency-with-a-credit-card-421499824684903691",
      verifiedAt: "2026-09-25",
    },
  },
  {
    fee: fixedFee("payoneer_p2p_transfer", "4.00", "USD"),
    provenance: {
      kind: "estimate",
      sourceUrl: "https://www.payoneer.com/pricing/",
      verifiedAt: "2026-09-23",
      upperBound: true,
    },
  },
  {
    fee: percentFee("p2p_premium", "0", null),
    provenance: {
      kind: "user_defined",
      referenceUrl: "https://docs.criptoya.com/argentina/",
      checkedAt: "2026-09-23",
    },
  },
  {
    fee: fixedFee("binance_p2p_taker", "0.08", "USDT"),
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
    provenance: {
      kind: "verified",
      sourceUrl: "https://www.binance.com/bapi/capital/v1/public/capital/getNetworkCoinAll",
      verifiedAt: "2026-09-23",
    },
  },
  {
    fee: fixedFee("bitso_usdt_deposit", "0", "USDT"),
    provenance: {
      kind: "verified",
      sourceUrl: "https://bitso.com/ar/fees/transactions",
      verifiedAt: "2026-09-23",
    },
  },
  {
    fee: percentFee("bitso_taker", "0.60", null),
    provenance: {
      kind: "verified",
      sourceUrl: "https://bitso.com/ar/fees",
      verifiedAt: "2026-09-23",
    },
  },
  {
    fee: fixedFee("bitso_ars_withdrawal", "0", "ARS"),
    provenance: {
      kind: "verified",
      sourceUrl: "https://bitso.com/ar/fees/transactions",
      verifiedAt: "2026-09-23",
    },
  },
  {
    fee: percentFee("payoneer_us_withdrawal", "4", money("20.00", "USD")),
    provenance: {
      kind: "estimate",
      sourceUrl: "https://www.payoneer.com/pricing/",
      verifiedAt: "2026-09-23",
      upperBound: true,
    },
  },
  {
    fee: fixedFee("arq_ach_deposit", "3.00", "USD"),
    provenance: {
      kind: "verified",
      sourceUrl:
        "https://help.arqfinance.com/es/articles/13532861-cuenta-sin-fronteras-recarga-en-multiples-monedas",
      verifiedAt: "2026-09-23",
    },
  },
  {
    fee: percentFee("arq_usd_usdc_conversion", "0", null),
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
    provenance: {
      kind: "verified",
      sourceUrl:
        "https://help.arqfinance.com/es/articles/13532861-cuenta-sin-fronteras-recarga-en-multiples-monedas",
      verifiedAt: "2026-09-23",
    },
  },
  {
    fee: percentFee("payoneer_ar_withdrawal", "2", null),
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
    provenance: {
      kind: "verified",
      sourceUrl: "https://www.bcra.gob.ar/Pdfs/comytexord/A8481.pdf",
      verifiedAt: "2026-09-23",
    },
  },
  {
    fee: percentFee("broker_buy", "0.05", null),
    provenance: {
      kind: "estimate",
      sourceUrl: "https://balanz.com/comisiones/",
      verifiedAt: "2026-09-23",
      upperBound: true,
    },
  },
  {
    fee: percentFee("broker_sell", "0.05", null),
    provenance: {
      kind: "estimate",
      sourceUrl: "https://balanz.com/comisiones/",
      verifiedAt: "2026-09-23",
      upperBound: true,
    },
  },
  {
    fee: percentFee("byma_buy", "0.01", null),
    provenance: {
      kind: "verified",
      sourceUrl:
        "https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a2875749a418f0439d7de8f_BYMA-Derechos-Mercado-sobre-Operaciones_2026-06-09.pdf",
      verifiedAt: "2026-09-23",
    },
  },
  {
    fee: percentFee("byma_sell", "0.01", null),
    provenance: {
      kind: "verified",
      sourceUrl:
        "https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a2875749a418f0439d7de8f_BYMA-Derechos-Mercado-sobre-Operaciones_2026-06-09.pdf",
      verifiedAt: "2026-09-23",
    },
  },
];

/** The default of the fee with this id, if there is one. */
export function feeDefault(id: string): FeeDefault | undefined {
  return FEE_DEFAULTS.find((d) => d.fee.id === id);
}
