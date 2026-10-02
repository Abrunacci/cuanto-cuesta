import { describe, expect, it } from "vitest";

import { Decimal, fixedFee, percentFee } from "../calculator/index.ts";
import { convertTyped, ENGLISH_NUMBERS, numbersIn, SPANISH_NUMBERS } from "./numbers.ts";

const spanish = numbersIn(SPANISH_NUMBERS);
const english = numbersIn(ENGLISH_NUMBERS);
const {
  parse: parseNumber,
  format: formatNumber,
  money: formatMoney,
  moneyWhole: formatMoneyWhole,
  feeValue: formatFeeValue,
  unambiguous: formatUnambiguous,
  toInput: toInputText,
} = spanish;

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
    ["0.015", "0.015"],
    ["0.500", "0.5"],
    ["0,500", "0.5"],
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

describe("typed decimals", () => {
  it.each([
    ["1,000", 3],
    ["1.000", 0],
    ["1.536,160", 3],
    ["1.03", 2],
    ["1.030", 0],
    ["7", 0],
  ])("counts %s as %i decimals, as typed", (text, decimals) => {
    const parsed = parseNumber(text);
    expect(parsed.kind === "number" && parsed.typedDecimals).toBe(decimals);
  });
});

describe("the other reading of ambiguous text", () => {
  const alternative = (text: string) => {
    const parsed = parseNumber(text);
    return parsed.kind === "number" ? (parsed.alternative?.toString() ?? null) : "not a number";
  };

  it.each([
    ["1.030", "1.03"],
    ["1,536", "1536"],
    ["1,000", "1000"],
    ["153.616", "153.616"],
  ])("offers %s as %s too", (text, expected) => {
    expect(alternative(text)).toBe(expected);
  });

  it.each([
    "1.536,16",
    "1.03",
    "1536",
    "15",
    "99,9",
    "1.000.000",
    "1,5",
    "0.015",
    "0,500",
    "0.500",
  ])("offers nothing for %s, which reads only one way", (text) => {
    expect(alternative(text)).toBeNull();
  });
});

describe("formatting", () => {
  it("groups thousands with dots and uses a decimal comma", () => {
    expect(formatNumber(new Decimal("1534005.69"), 2)).toBe("1.534.005,69");
    expect(formatNumber(new Decimal("-13552.4"), 2)).toBe("-13.552,40");
    expect(formatNumber(new Decimal("999"), 0)).toBe("999");
  });

  it("writes money with its currency", () => {
    expect(formatMoney(new Decimal("1534005.69"), "ARS")).toBe("$\u00a01.534.005,69");
    expect(formatMoney(new Decimal("-13552.4"), "ARS")).toBe("-$\u00a013.552,40");
    expect(formatMoney(new Decimal("1000"), "USD")).toBe("US$\u00a01.000,00");
    expect(formatMoney(new Decimal("0.08"), "USDT")).toBe("0,08\u00a0USDT");
  });

  it("cuts money to whole units toward zero, without a sign on zero", () => {
    expect(formatMoneyWhole(new Decimal("1534005.99"), "ARS")).toBe("$\u00a01.534.005");
    expect(formatMoneyWhole(new Decimal("1000"), "ARS")).toBe("$\u00a01.000");
    expect(formatMoneyWhole(new Decimal("-13552.4"), "ARS")).toBe("-$\u00a013.552");
    expect(formatMoneyWhole(new Decimal("-0.5"), "ARS")).toBe("$\u00a00");
  });

  it("writes a fee's value with its unit", () => {
    expect(formatFeeValue(percentFee("p", "0"))).toBe("0\u00a0%");
    expect(formatFeeValue(fixedFee("f", "0.08", "USDT"))).toBe("0,08\u00a0USDT");
  });

  it("echoes numbers with at least two decimals", () => {
    expect(formatUnambiguous(new Decimal("1030"))).toBe("1.030,00");
    expect(formatUnambiguous(new Decimal("1.03"))).toBe("1,03");
    expect(formatUnambiguous(new Decimal("1593.385"))).toBe("1.593,385");
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

describe("in English", () => {
  const readEnglish = (text: string) => {
    const parsed = english.parse(text);
    return parsed.kind === "number" ? parsed.value.toString() : parsed.kind;
  };

  it.each([
    ["1,536.16", "1536.16"],
    ["1536.16", "1536.16"],
    ["1536,16", "1536.16"],
    ["1,03", "1.03"],
    ["1,536", "1536"],
    ["1,000,000.5", "1000000.5"],
    ["0.500", "0.5"],
  ])("reads %s as %s", (text, expected) => {
    expect(readEnglish(text)).toBe(expected);
  });

  it.each(["1.000,50", "1,2,3", "1.2.3"])("rejects %s", (text) => {
    expect(readEnglish(text)).toBe("invalid");
  });

  it("offers the other reading of ambiguous text", () => {
    const parsed = english.parse("1,030");
    expect(parsed.kind === "number" && parsed.alternative?.toString()).toBe("1.03");
  });

  it("groups thousands with commas, uses a decimal point and says ARS for pesos", () => {
    expect(english.format(new Decimal("1534005.69"), 2)).toBe("1,534,005.69");
    expect(english.money(new Decimal("1452.3"), "ARS")).toBe("ARS\u00a01,452.30");
    expect(english.money(new Decimal("-13552.4"), "ARS")).toBe("-ARS\u00a013,552.40");
    expect(english.money(new Decimal("1000"), "USD")).toBe("US$\u00a01,000.00");
    expect(english.moneyWhole(new Decimal("1534005.99"), "ARS")).toBe("ARS\u00a01,534,005");
    expect(english.feeValue(fixedFee("f", "0.08", "USDT"))).toBe("0.08\u00a0USDT");
    expect(english.unambiguous(new Decimal("1030"))).toBe("1,030.00");
    expect(english.toInput(new Decimal("0.60"))).toBe("0.6");
  });
});

describe("convertTyped", () => {
  it.each([
    ["1.452,30", "1,452.30"],
    ["1452,3", "1452.3"],
    ["1.03", "1,03"],
    ["1.536", "1,536"],
    ["150000", "150000"],
    ["abc", "abc"],
  ])("turns Spanish %s into English %s", (text, expected) => {
    expect(convertTyped(text, SPANISH_NUMBERS, ENGLISH_NUMBERS)).toBe(expected);
    expect(convertTyped(expected, ENGLISH_NUMBERS, SPANISH_NUMBERS)).toBe(text);
  });

  it("keeps the number and its other reading", () => {
    for (const text of ["1.452,30", "1452,3", "1.03", "1.536", "0,500", "1.000.000", "-2,5"]) {
      const before = spanish.parse(text);
      const after = english.parse(convertTyped(text, SPANISH_NUMBERS, ENGLISH_NUMBERS));
      expect(after.kind).toBe("number");
      if (before.kind === "number" && after.kind === "number") {
        expect(after.value.toString()).toBe(before.value.toString());
        expect(after.alternative?.toString()).toBe(before.alternative?.toString());
        expect(after.typedDecimals).toBe(before.typedDecimals);
      }
    }
  });

  it("leaves text alone between the same style", () => {
    expect(convertTyped("1.452,30", SPANISH_NUMBERS, SPANISH_NUMBERS)).toBe("1.452,30");
  });
});
