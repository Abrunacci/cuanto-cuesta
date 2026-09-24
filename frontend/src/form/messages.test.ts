import { describe, expect, it } from "vitest";

import type { FeeGap } from "./form.ts";
import { missingInputLabel, missingInputShortLabel } from "./messages.ts";

const id = "payoneer_us_withdrawal";
const label = (gap: FeeGap | null) =>
  missingInputLabel({ kind: "fee", id }, new Map(gap === null ? [] : [[id, gap]]));

describe("missingInputLabel", () => {
  it("names the part of a fee that is missing", () => {
    expect(label("value")).toBe("retiro de Payoneer a una cuenta de EE.UU.");
    expect(label("minimum")).toBe("el mínimo de retiro de Payoneer a una cuenta de EE.UU.");
    expect(label("both")).toBe("retiro de Payoneer a una cuenta de EE.UU. y su mínimo");
  });

  it("names the amount and prices in lower case, to read inside a sentence", () => {
    const gaps = new Map<string, FeeGap>();
    expect(missingInputLabel({ kind: "amount" }, gaps)).toBe("monto en USD");
    expect(missingInputLabel({ kind: "rate", key: "mep" }, gaps)).toBe("dólar MEP (compra)");
  });
});

describe("missingInputShortLabel", () => {
  it("names the amount and each price in a word or two", () => {
    expect(missingInputShortLabel({ kind: "amount" })).toBe("monto");
    expect(missingInputShortLabel({ kind: "rate", key: "mep" })).toBe("MEP");
    expect(missingInputShortLabel({ kind: "rate", key: "p2p_usdt_usd" })).toBe("precio P2P");
  });
});
