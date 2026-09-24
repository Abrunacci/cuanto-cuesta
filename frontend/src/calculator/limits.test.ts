import { describe, expect, it } from "vitest";

import { fixedFee, percentFee } from "./fees.ts";
import { MAX_PERCENT, maxFixed, valueCap, valueProblem } from "./limits.ts";
import { Decimal } from "./money.ts";

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
