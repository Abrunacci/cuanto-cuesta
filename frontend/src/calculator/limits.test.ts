import { describe, expect, it } from "vitest";

import { fixedFee, percentFee } from "./fees.ts";
import { feeProblems, MAX_PERCENT, maxFixed, valueCap, valueProblem } from "./limits.ts";
import { Decimal, money } from "./money.ts";

describe("caps", () => {
  it("match the backend's caps", () => {
    expect(MAX_PERCENT.toString()).toBe("20");
    expect(maxFixed("USD").toString()).toBe("100");
    expect(maxFixed("USDT").toString()).toBe("100");
    expect(maxFixed("USDC").toString()).toBe("100");
    expect(maxFixed("ARS").toString()).toBe("150000");
  });

  it("depend on the fee's kind and currency", () => {
    expect(valueCap(percentFee("p", "1")).toString()).toBe("20");
    expect(valueCap(fixedFee("f", "1", "ARS")).toString()).toBe("150000");
  });
});

describe("valueProblem", () => {
  const cap = new Decimal(20);

  it("accepts zero and the cap itself", () => {
    expect(valueProblem(new Decimal(0), cap)).toBeNull();
    expect(valueProblem(new Decimal(20), cap)).toBeNull();
  });

  it("reports a negative value", () => {
    expect(valueProblem(new Decimal("-0.01"), cap)).toEqual({ code: "negative" });
  });

  it("reports a value above the cap, with the cap", () => {
    expect(valueProblem(new Decimal("20.01"), cap)).toEqual({ code: "above_cap", cap });
  });
});

describe("feeProblems", () => {
  it("accepts a fee within its caps, minimum included", () => {
    expect(feeProblems(percentFee("p", "20", money("100", "USD")))).toEqual([]);
  });

  it("reports the value and the minimum separately", () => {
    expect(feeProblems(percentFee("p", "20.01", money("100.01", "USD")))).toEqual([
      { field: "value", problem: { code: "above_cap", cap: new Decimal(20) } },
      { field: "minimum", problem: { code: "above_cap", cap: new Decimal(100) } },
    ]);
    expect(feeProblems(fixedFee("f", "150000.01", "ARS"))).toEqual([
      { field: "value", problem: { code: "above_cap", cap: new Decimal(150000) } },
    ]);
  });
});
