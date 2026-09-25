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

  it("use each fee in a single route, so each fee field has a unique id on the page", () => {
    // Every step's fees, repeats kept: a fee twice in one route would also duplicate a field id.
    const uses = ROUTES.flatMap((r) => r.steps.flatMap((step) => step.feeIds));
    expect(uses.filter((id, index) => uses.indexOf(id) !== index)).toEqual([]);
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

  it("warn on the MEP route with a link to the BCRA rules", () => {
    const [warning] = ROUTES.find((r) => r.id === "mep")?.warnings ?? [];
    expect(warning).toBe(
      "[Verificá las restricciones sobre el dólar MEP](https://www.bcra.gob.ar/Pdfs/comytexord/A8481.pdf)",
    );
  });
});

describe("the bundled data, calculated end to end", () => {
  // Same prices as the Python domain's sample; expected values computed with the Python domain,
  // since removed, on the same fees and routes.
  const prices = new Map([
    ["mep", validPrice("1536.16")],
    ["p2p_usdt_usd", validPrice("1.03")],
    ["bitso_usdt_ars", validPrice("1596.21")],
    ["arq_usd_ars", validPrice("1593.385")],
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

  it("computes the three routes for 1000 USD", () => {
    // Binance: 1000.00 - 4.00 = 996.00 USD / 1.03 = 966.99 USDT - 0.08 = 966.91; - 0.07 = 966.84;
    // 0.6 % = 5.80104 -> 5.81; 961.03 x 1596.21 = 1534005.6963
    expect(summarize("1000.00")).toEqual([
      ["binance_bitso", "1534005.69", "15706.71"],
      ["arq", "1524869.44", "68515.56"],
      ["mep", "1503624.13", "32535.87"],
    ]);
  });

  it("computes the three routes for 100 USD, where the Payoneer minimum applies to ARQ", () => {
    expect(summarize("100.00")).toEqual([
      ["mep", "150359.34", "3256.66"],
      ["binance_bitso", "147633.46", "7326.60"],
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
        ["p2p_usdt_usd", validPrice("1")],
        ["bitso_usdt_ars", validPrice("1600")],
        ["arq_usd_ars", null],
      ]),
      fees,
    });
    const [binance, mep, arq] = routesInOrder(comparison);
    expect(binance?.status === "complete" && binance.standing).toMatchObject({
      kind: "ahead",
      other: { id: "mep" },
    });
    expect(mep?.status === "complete" && mep.standing).toMatchObject({
      kind: "behind",
      other: { id: "binance_bitso" },
    });
    const figures = [binance, mep].map((r) =>
      r?.status === "complete" && (r.standing.kind === "ahead" || r.standing.kind === "behind")
        ? [r.route.id, r.result.final, r.feeCost, r.standing.by].map((v) =>
            typeof v === "string" ? v : v.amount.toFixed(2),
          )
        : null,
    );
    // 2378992.00 - 2202330.00 = 176662.00
    expect(figures).toEqual([
      ["binance_bitso", "2378992.00", "21008.00", "176662.00"],
      ["mep", "2202330.00", "47670.00", "176662.00"],
    ]);
    expect(arq?.status).toBe("incomplete");
  });
});
