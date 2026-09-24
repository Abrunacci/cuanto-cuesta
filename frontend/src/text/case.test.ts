import { describe, expect, it } from "vitest";

import { lowerFirst } from "./case.ts";

describe("lowerFirst", () => {
  it.each([
    ["Recargo P2P por pagar con Payoneer", "recargo P2P por pagar con Payoneer"],
    ["Dólar MEP (compra)", "dólar MEP (compra)"],
    ["ARQ recibe la transferencia", "ARQ recibe la transferencia"],
    ["USDT depositado", "USDT depositado"],
    ["", ""],
  ])("turns %j into %j", (text, expected) => {
    expect(lowerFirst(text)).toBe(expected);
  });
});
