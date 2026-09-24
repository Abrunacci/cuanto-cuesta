import { describe, expect, it } from "vitest";

import { compareRoutes } from "../compare.ts";
import type { Fee } from "../fees.ts";
import { feeProblems } from "../limits.ts";
import { validAmount, validPrice } from "../sample.fixture.ts";
import { feeIds, rateKeys, routeProblems } from "../routes.ts";
import { FEE_DEFAULTS } from "./fees.ts";
import { RATE_FIELDS, REFERENCE_KEY, ROUTES } from "./routes.ts";

const feeIdsInDefaults = FEE_DEFAULTS.map((d) => d.fee.id);
const usedFeeIds = new Set(ROUTES.flatMap((r) => [...feeIds(r)]));

describe("the bundled routes and fees", () => {
  it("are well-formed routes", () => {
    expect(ROUTES.flatMap(routeProblems)).toEqual([]);
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

  it("only use rates the person can type, and the MEP is one of them", () => {
    const fields = new Set(RATE_FIELDS.map((f) => f.key));
    expect(ROUTES.flatMap((r) => [...rateKeys(r)]).filter((k) => !fields.has(k))).toEqual([]);
    expect(fields.has(REFERENCE_KEY)).toBe(true);
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

  it("warn on the MEP route with a link to the BCRA rules", () => {
    const [warning] = ROUTES.find((r) => r.id === "mep")?.warnings ?? [];
    expect(warning).toBe(
      "[Verificá las restricciones sobre el dólar MEP](https://www.bcra.gob.ar/Pdfs/comytexord/A8481.pdf)",
    );
  });
});

describe("the bundled data, calculated end to end", () => {
  // Same prices as the Python domain's sample; expected values computed with the Python domain
  // on backend/config/fees.yaml and routes.yaml.
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
      rateDefinitions: RATE_FIELDS,
      referenceKey: REFERENCE_KEY,
      amount: validAmount(amount),
      prices,
      fees,
    });
    return {
      atReference: comparison.atReference?.amount.toFixed(2),
      routes: comparison.routes.map((r) =>
        r.status === "complete"
          ? [r.route.id, ...[r.result.final, r.feeCost, r.fxLoss].map((m) => m.amount.toFixed(2))]
          : [r.route.id, "incomplete"],
      ),
    };
  };

  it("computes the three routes for 1000 USD", () => {
    // Binance: 1000.00 - 4.00 = 996.00 USD / 1.03 = 966.99 USDT - 0.08 = 966.91; - 0.07 = 966.84;
    // 0.6 % = 5.80104 -> 5.81; 961.03 x 1596.21 = 1534005.6963
    expect(summarize("1000.00")).toEqual({
      atReference: "1536160.00",
      routes: [
        ["binance_bitso", "1534005.69", "15706.71", "-13552.40"],
        ["arq", "1524869.44", "68515.56", "-57225.00"],
        ["mep", "1503624.13", "32535.87", "0.00"],
      ],
    });
  });

  it("computes the three routes for 100 USD, where the Payoneer minimum applies to ARQ", () => {
    expect(summarize("100.00")).toEqual({
      atReference: "153616.00",
      routes: [
        ["mep", "150359.34", "3256.66", "0.00"],
        ["binance_bitso", "147633.46", "7326.60", "-1344.06"],
        ["arq", "122690.64", "36647.86", "-5722.50"],
      ],
    });
  });
});
