import { describe, expect, it } from "vitest";

import { charge, fixedFee, InvalidFeeError, percentFee, withoutCharge } from "./fees.ts";
import { CurrencyMismatchError, money } from "./money.ts";

const usd = (amount: string) => money(amount, "USD");

describe("percent fees", () => {
  it("are a share of the amount, rounded up", () => {
    expect(charge(percentFee("p", "1"), usd("1000.00")).amount.toFixed(2)).toBe("10.00");
    // 0.6 % of 957.13 = 5.74278
    expect(charge(percentFee("p", "0.6"), money("957.13", "USDT")).amount.toFixed(2)).toBe("5.75");
  });

  it("are charged in the amount's currency", () => {
    expect(charge(percentFee("p", "0.6"), money("100", "USDT")).currency).toBe("USDT");
  });

  it("charge the minimum when the percentage is lower", () => {
    // 4 % of 100.00 = 4.00 < 20.00
    expect(charge(percentFee("p", "4", usd("20")), usd("100.00")).amount.toFixed(2)).toBe("20.00");
  });

  it("charge the percentage when it is higher than the minimum", () => {
    // 4 % of 1000.00 = 40.00 > 20.00
    expect(charge(percentFee("p", "4", usd("20")), usd("1000.00")).amount.toFixed(2)).toBe("40.00");
  });

  it("round the minimum up", () => {
    // 1 % of 100.00 = 1.00 < 19.991, which rounds up to 20.00
    expect(charge(percentFee("p", "1", usd("19.991")), usd("100.00")).amount.toFixed(2)).toBe(
      "20.00",
    );
  });

  it("reject a minimum in another currency", () => {
    expect(() => charge(percentFee("p", "1", money("1", "ARS")), usd("100"))).toThrow(
      CurrencyMismatchError,
    );
  });

  it("must be between 0 and 100 %", () => {
    expect(() => percentFee("p", "-0.01")).toThrow(InvalidFeeError);
    expect(() => percentFee("p", "100.01")).toThrow(InvalidFeeError);
    expect(percentFee("p", "100").rate.toString()).toBe("100");
  });
});

describe("fixed fees", () => {
  it("are their amount, rounded up", () => {
    expect(charge(fixedFee("f", "3.001", "USD"), usd("50")).amount.toFixed(2)).toBe("3.01");
  });

  it("must be in the amount's currency", () => {
    expect(() => charge(fixedFee("f", "3", "USD"), money("50", "ARS"))).toThrow(
      CurrencyMismatchError,
    );
  });

  it("must not be negative", () => {
    expect(() => fixedFee("f", "-1", "USD")).toThrow(InvalidFeeError);
  });
});

describe("withoutCharge", () => {
  it("zeroes a fee, minimum included", () => {
    expect(
      charge(withoutCharge(percentFee("p", "4", usd("20"))), usd("100")).amount.toFixed(2),
    ).toBe("0.00");
    expect(charge(withoutCharge(fixedFee("f", "3", "USD")), usd("100")).amount.toFixed(2)).toBe(
      "0.00",
    );
  });
});
