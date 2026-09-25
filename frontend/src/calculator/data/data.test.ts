import { describe, expect, it } from "vitest";

import { compareRoutes, routesInOrder } from "../compare.ts";
import { percentFee, type Fee } from "../fees.ts";
import { feeProblems } from "../limits.ts";
import { validAmount, validPrice } from "../sample.fixture.ts";
import { money } from "../money.ts";
import { rate } from "../rates.ts";
import { feeIds, rateKeys, routeProblems, runRoute } from "../routes.ts";
import { FEE_DEFAULTS } from "./fees.ts";
import { RATE_FIELDS, ROUTES, TARGET_CURRENCY } from "./routes.ts";

const feeIdsInDefaults = FEE_DEFAULTS.map((d) => d.fee.id);
const usedFeeIds = new Set(ROUTES.flatMap((r) => [...feeIds(r)]));

describe("the bundled routes and fees", () => {
  it("are well-formed routes", () => {
    expect(ROUTES.flatMap(routeProblems)).toEqual([]);
  });

  it("have unique ids, which the page uses as keys and element ids", () => {
    const ids = ROUTES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("have unique fee ids, all used by some route", () => {
    expect(new Set(feeIdsInDefaults).size).toBe(feeIdsInDefaults.length);
    expect(feeIdsInDefaults.filter((id) => !usedFeeIds.has(id))).toEqual([]);
  });

  it("use each fee at most once per route", () => {
    for (const route of ROUTES) {
      const uses = route.steps.flatMap((step) => step.feeIds);
      expect(uses.filter((id, index) => uses.indexOf(id) !== index)).toEqual([]);
    }
  });

  it("share the Bitso leg between the two Binance routes, and no fee is used by every route", () => {
    const routesOf = (id: string) => ROUTES.filter((r) => feeIds(r).has(id)).map((r) => r.id);
    const shared = [...usedFeeIds].filter((id) => routesOf(id).length > 1);
    expect(shared.map((id) => [id, routesOf(id)])).toEqual(
      [
        "binance_withdrawal_polygon",
        "bitso_usdt_deposit",
        "bitso_taker",
        "bitso_ars_withdrawal",
      ].map((id) => [id, ["binance_card_bitso", "binance_p2p_bitso"]]),
    );
  });

  it("only use fees that have a default", () => {
    expect([...usedFeeIds].filter((id) => !feeIdsInDefaults.includes(id))).toEqual([]);
  });

  it("all end in the comparison's currency", () => {
    expect(ROUTES.filter((r) => r.target !== TARGET_CURRENCY).map((r) => r.id)).toEqual([]);
  });

  it("only use rates the person can type", () => {
    const fields = new Set(RATE_FIELDS.map((f) => f.key));
    expect(ROUTES.flatMap((r) => [...rateKeys(r)]).filter((k) => !fields.has(k))).toEqual([]);
  });

  it("keep every default within the caps, minimums included", () => {
    expect(FEE_DEFAULTS.filter((d) => feeProblems(d.fee).length > 0).map((d) => d.fee.id)).toEqual(
      [],
    );
  });

  it("default user-defined fees to zero", () => {
    const userDefined = FEE_DEFAULTS.filter((d) => d.provenance.kind === "user_defined");
    expect(userDefined.map((d) => d.fee.id)).toEqual(["p2p_premium"]);
    expect(userDefined.every((d) => d.fee.kind === "percent" && d.fee.rate.eq(0))).toBe(true);
  });

  it("treat ARQ's USD to USDc conversion as an editable estimate at par", () => {
    const conversion = FEE_DEFAULTS.find((d) => d.fee.id === "arq_usd_usdc_conversion");
    expect(conversion?.provenance).toMatchObject({ kind: "estimate", upperBound: false });
    expect(conversion?.fee.kind === "percent" && conversion.fee.rate.eq(0)).toBe(true);
  });

  it("charge the broker and BYMA on each side of the MEP", () => {
    const mep = ROUTES.find((r) => r.id === "mep");
    expect(mep === undefined ? [] : [...feeIds(mep)]).toEqual(
      expect.arrayContaining(["broker_buy", "broker_sell", "byma_buy", "byma_sell"]),
    );
  });

  it("charge ARQ's USD to USDc conversion on what reaches ARQ", () => {
    const arq = ROUTES.find((r) => r.id === "arq");
    if (arq === undefined) {
      throw new Error("No ARQ route");
    }
    const defaults = new Map(FEE_DEFAULTS.map((d) => [d.fee.id, d.fee]));
    const rates = new Map([["arq_usd_ars", rate("arq_usd_ars", "USD", "ARS", validPrice("1500"))]]);
    const amount = money("1000.00", "USD");
    const atPar = runRoute(arq, amount, defaults, rates);
    const withSpread = runRoute(
      arq,
      amount,
      new Map([
        ...defaults,
        ["arq_usd_usdc_conversion", percentFee("arq_usd_usdc_conversion", "0.5")],
      ]),
      rates,
    );
    const receive = withSpread.steps[1];
    // 1000.00 - 4 % Payoneer = 960.00 reaches ARQ; 0.5 % of 960.00 = 4.80, plus 3.00 ACH
    expect(receive?.amountIn.amount.toFixed(2)).toBe("960.00");
    expect(receive?.fees.map((c) => c.amount.amount.toFixed(2))).toEqual(["3.00", "4.80"]);
    // 957.00 x 1500 = 1435500.00 at par; 952.20 x 1500 = 1428300.00 with the spread
    expect(atPar.final.amount.toFixed(2)).toBe("1435500.00");
    expect(withSpread.final.amount.toFixed(2)).toBe("1428300.00");
  });

  it("mark Binance P2P + Bitso as the one risky route, with what it risks", () => {
    expect(ROUTES.filter((r) => r.risk !== null).map((r) => [r.id, r.risk])).toEqual([
      [
        "binance_p2p_bitso",
        {
          label: "Riesgo de bloqueo",
          detail: "con riesgo de bloqueo de tu cuenta de Binance",
        },
      ],
    ]);
  });

  it("warn on the P2P route that paying with Payoneer can get the Binance account blocked", () => {
    // Payoneer is not a payment method in Binance's USD P2P ads: the warning must not suggest
    // there are ads that accept it.
    expect(ROUTES.find((r) => r.id === "binance_p2p_bitso")?.warnings).toEqual([
      "Pagar P2P con Payoneer puede hacer que Binance bloquee tu cuenta. El precio P2P es el de la oferta genérica USDT/USD.",
    ]);
  });

  it("warn on the MEP route with a link to the BCRA rules", () => {
    const [warning] = ROUTES.find((r) => r.id === "mep")?.warnings ?? [];
    expect(warning).toBe(
      "[Verificá las restricciones sobre el dólar MEP](https://www.bcra.gob.ar/Pdfs/comytexord/A8481.pdf)",
    );
  });
});

describe("the bundled data, calculated end to end", () => {
  // Same prices as the Python domain's sample; expected values computed with the Python domain,
  // since removed, on the same fees and routes. Binance's card price, added later, is the one
  // seen on its final payment screen on 25/09/2026, and its results are checked by hand.
  const prices = new Map([
    ["mep", validPrice("1536.16")],
    ["binance_p2p_usdt_usd", validPrice("1.03")],
    ["bitso_usdt_ars", validPrice("1596.21")],
    ["arq_usd_ars", validPrice("1593.385")],
    ["binance_card_usd_usdt", validPrice("0.95448")],
  ]);
  const fees = new Map<string, Fee | null>(FEE_DEFAULTS.map((d) => [d.fee.id, d.fee]));

  const summarize = (amount: string) => {
    const comparison = compareRoutes({
      routes: ROUTES,
      target: TARGET_CURRENCY,
      rateDefinitions: RATE_FIELDS,
      amount: validAmount(amount),
      prices,
      fees,
    });
    return routesInOrder(comparison).map((r) =>
      r.status === "complete"
        ? [r.route.id, ...[r.result.final, r.feeCost].map((m) => m.amount.toFixed(2))]
        : [r.route.id, "incomplete"],
    );
  };

  it("computes the four routes for 1000 USD", () => {
    // Binance P2P: 1000.00 - 4.00 = 996.00 USD / 1.03 = 966.99 USDT - 0.08 = 966.91; - 0.07 =
    // 966.84; 0.6 % = 5.80104 -> 5.81; 961.03 x 1596.21 = 1534005.6963
    // Binance with a card: 2 % = 20.00; 980.00 x 0.95448 = 935.3904 -> 935.39 USDT; - 0.07 =
    // 935.32; 0.6 % = 5.61192 -> 5.62; 929.70 x 1596.21 = 1483996.437. Without fees:
    // 954.48 x 1596.21 = 1523550.52, 39554.09 more.
    expect(summarize("1000.00")).toEqual([
      ["binance_p2p_bitso", "1534005.69", "15706.71"],
      ["arq", "1524869.44", "68515.56"],
      ["mep", "1503624.13", "32535.87"],
      ["binance_card_bitso", "1483996.43", "39554.09"],
    ]);
  });

  it("computes the card route for the 10 USD observed on Binance's final payment screen", () => {
    // 2 % = 0.20, as seen; 9.80 x 0.95448 = 9.353904 -> 9.35 USDT (Binance credited 9.35393217);
    // - 0.07 = 9.28; 0.6 % = 0.05568 -> 0.06; 9.22 x 1596.21 = 14717.0562
    const card = summarize("10.00").find(([id]) => id === "binance_card_bitso");
    expect(card?.[1]).toBe("14717.05");
  });

  it("computes the four routes for 100 USD, where the Payoneer minimum applies to ARQ", () => {
    // Binance with a card: 2 % = 2.00; 98.00 x 0.95448 = 93.53904 -> 93.53 USDT; - 0.07 = 93.46;
    // 0.6 % = 0.56076 -> 0.57; 92.89 x 1596.21 = 148271.9469. Without fees: 95.44 x 1596.21 =
    // 152342.28, 4070.34 more.
    expect(summarize("100.00")).toEqual([
      ["mep", "150359.34", "3256.66"],
      ["binance_card_bitso", "148271.94", "4070.34"],
      ["binance_p2p_bitso", "147633.46", "7326.60"],
      ["arq", "122690.64", "36647.86"],
    ]);
  });

  it("compares the routes with each other for 1500 USD with ARQ's price left empty", () => {
    // The example that showed the MEP route "losing" its own fees against the MEP.
    const comparison = compareRoutes({
      routes: ROUTES,
      target: TARGET_CURRENCY,
      rateDefinitions: RATE_FIELDS,
      amount: validAmount("1500.00"),
      prices: new Map([
        ["mep", validPrice("1500")],
        ["binance_p2p_usdt_usd", validPrice("1")],
        ["bitso_usdt_ars", validPrice("1600")],
        ["arq_usd_ars", null],
      ]),
      fees,
    });
    const [binance, mep, ...incomplete] = routesInOrder(comparison);
    // Binance P2P + Bitso delivers more, but it is risky: the MEP route is the best one, with no
    // other route without risk to compare it with.
    expect(binance?.status === "complete" && binance.standing).toMatchObject({
      kind: "over",
      other: { id: "mep" },
    });
    expect(mep?.status === "complete" && mep.standing).toEqual({ kind: "unrivaled" });
    const figures = [binance, mep].map((r) =>
      r?.status === "complete"
        ? [
            r.route.id,
            r.result.final.amount.toFixed(2),
            r.feeCost.amount.toFixed(2),
            r.standing.kind === "over" ? r.standing.by.amount.toFixed(2) : null,
          ]
        : null,
    );
    // 2378992.00 - 2202330.00 = 176662.00
    expect(figures).toEqual([
      ["binance_p2p_bitso", "2378992.00", "21008.00", "176662.00"],
      ["mep", "2202330.00", "47670.00", null],
    ]);
    // Neither ARQ nor Binance with a card has its price.
    expect(incomplete.map((r) => [r.route.id, r.status])).toEqual([
      ["binance_card_bitso", "incomplete"],
      ["arq", "incomplete"],
    ]);
  });
});
