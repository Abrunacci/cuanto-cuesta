import { describe, expect, it } from "vitest";

import { Decimal, RATE_FIELDS } from "../calculator/index.ts";
import { inRange, PRICE_CHECKS } from "./plausible.ts";

describe("plausible prices", () => {
  it("has a range for every price the person types", () => {
    expect(RATE_FIELDS.map((f) => f.key).filter((key) => PRICE_CHECKS[key] === undefined)).toEqual(
      [],
    );
  });

  it.each([
    ["mep", "1540"],
    ["bitso_usdt_ars", "1600"],
    ["arq_usd_ars", "1600"],
    ["p2p_usdt_usd", "1.02"],
    ["p2p_usdt_usd", "1.04"],
  ])("accepts today's %s of %s", (key, value) => {
    const check = PRICE_CHECKS[key];
    expect(check !== undefined && inRange(new Decimal(value), check)).toBe(true);
  });
});
