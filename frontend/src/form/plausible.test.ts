import { describe, expect, it } from "vitest";

import { Decimal, RATE_FIELDS } from "../calculator/index.ts";
import { PRICE_CHECKS, thousandfoldFix } from "./plausible.ts";

describe("plausible prices", () => {
  it("has a range for every price the person types", () => {
    expect(RATE_FIELDS.map((f) => f.key).filter((key) => PRICE_CHECKS[key] === undefined)).toEqual(
      [],
    );
  });

  it("suggests the value a thousand times smaller or larger when that one is in range", () => {
    const p2p = PRICE_CHECKS.p2p_usdt_usd;
    const mep = PRICE_CHECKS.mep;
    expect(p2p && thousandfoldFix(new Decimal(1030), p2p)?.toString()).toBe("1.03");
    expect(mep && thousandfoldFix(new Decimal("1.536"), mep)?.toString()).toBe("1536");
    expect(p2p && thousandfoldFix(new Decimal(50), p2p)).toBeNull();
  });
});
