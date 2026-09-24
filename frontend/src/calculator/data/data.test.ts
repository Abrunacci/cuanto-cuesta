import { describe, expect, it } from "vitest";

import { valueCap, valueProblem } from "../limits.ts";
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

  it("only use fees that have a default", () => {
    expect([...usedFeeIds].filter((id) => !feeIdsInDefaults.includes(id))).toEqual([]);
  });

  it("only use rates the person can type, and the MEP is one of them", () => {
    const fields = new Set(RATE_FIELDS.map((f) => f.key));
    expect(ROUTES.flatMap((r) => [...rateKeys(r)]).filter((k) => !fields.has(k))).toEqual([]);
    expect(fields.has(REFERENCE_KEY)).toBe(true);
  });

  it("keep every default within the caps", () => {
    const outside = FEE_DEFAULTS.filter((d) => {
      const value = d.fee.kind === "fixed" ? d.fee.amount.amount : d.fee.rate;
      return valueProblem(value, valueCap(d.fee)) !== null;
    });
    expect(outside.map((d) => d.fee.id)).toEqual([]);
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

  it("warn on the MEP route about selling dollars, citing the BCRA", () => {
    const [warning] = ROUTES.find((r) => r.id === "mep")?.warnings ?? [];
    expect(warning).toContain("no podés vender dólares por MEP");
    expect(warning).toContain('Com. "A" 8336');
    expect(warning).toContain("https://www.bcra.gob.ar/Pdfs/comytexord/A8481.pdf");
  });
});
