import { describe, expect, it } from "vitest";

import type { FeeGap } from "./form.ts";
import { missingInputLabel } from "./messages.ts";

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
    expect(missingInputLabel({ kind: "amount" }, gaps)).toBe("el monto en USD");
    expect(missingInputLabel({ kind: "rate", key: "mep" }, gaps)).toBe("dólar MEP (compra)");
  });
});
