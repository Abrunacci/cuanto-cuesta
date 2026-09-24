import { describe, expect, it } from "vitest";

import { Decimal } from "../calculator/index.ts";
import { formatMoney, formatNumber, parseNumber, toInputText } from "./numbers.ts";

const read = (text: string) => {
  const parsed = parseNumber(text);
  return parsed.kind === "number" ? parsed.value.toString() : parsed.kind;
};

describe("parseNumber", () => {
  it.each([
    ["1.536,16", "1536.16"],
    ["1536,16", "1536.16"],
    ["1536.16", "1536.16"],
    ["1.03", "1.03"],
    ["0,6", "0.6"],
    ["1.536", "1536"],
    ["1.000.000", "1000000"],
    ["1.000.000,5", "1000000.5"],
    ["1000", "1000"],
    ["  1 000,50 ", "1000.5"],
    ["-2", "-2"],
    ["0", "0"],
  ])("reads %s as %s", (text, expected) => {
    expect(read(text)).toBe(expected);
  });

  it("treats blank text as empty", () => {
    expect(read("")).toBe("empty");
    expect(read("   ")).toBe("empty");
  });

  it.each(["abc", "1,2,3", "1.2.3", "1,000.50", ",5", "5,", "1e3", "--1", "NaN"])(
    "rejects %s",
    (text) => {
      expect(read(text)).toBe("invalid");
    },
  );
});

describe("formatting", () => {
  it("groups thousands with dots and uses a decimal comma", () => {
    expect(formatNumber(new Decimal("1534005.69"), 2)).toBe("1.534.005,69");
    expect(formatNumber(new Decimal("-13552.4"), 2)).toBe("-13.552,40");
    expect(formatNumber(new Decimal("999"), 0)).toBe("999");
  });

  it("writes money with its currency", () => {
    expect(formatMoney(new Decimal("1534005.69"), "ARS")).toBe("$ 1.534.005,69");
    expect(formatMoney(new Decimal("-13552.4"), "ARS")).toBe("-$ 13.552,40");
    expect(formatMoney(new Decimal("1000"), "USD")).toBe("US$ 1.000,00");
    expect(formatMoney(new Decimal("0.08"), "USDT")).toBe("0,08 USDT");
  });

  it("writes input values with a decimal comma and no grouping", () => {
    expect(toInputText(new Decimal("0.60"))).toBe("0,6");
    expect(toInputText(new Decimal("150000"))).toBe("150000");
    expect(toInputText(new Decimal("0.00000001"))).toBe("0,00000001");
  });

  it("reads back what it writes", () => {
    for (const value of ["0.6", "4", "0.07", "1596.21", "150000"]) {
      expect(read(toInputText(new Decimal(value)))).toBe(new Decimal(value).toString());
    }
  });
});
