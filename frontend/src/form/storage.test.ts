import { afterEach, describe, expect, it, vi } from "vitest";

import { initialTexts, type FormTexts } from "./form.ts";
import { FORMAT_VERSION, fromStored, loadTexts, saveTexts, toStored } from "./storage.ts";

const start = initialTexts();
const texts = (overrides: Partial<FormTexts>): FormTexts => ({ ...start, ...overrides });
const roundTrip = (form: FormTexts) => fromStored(toStored(form));

describe("the stored form", () => {
  it("keeps nothing on a first visit", () => {
    expect(toStored(start)).toBeNull();
    expect(fromStored(null)).toEqual(start);
  });

  it("brings back the amount and the fees the person set, marked as theirs", () => {
    const back = roundTrip(
      texts({
        amount: "1.000",
        fees: { ...start.fees, p2p_premium: "0", bitso_taker: "0,5" },
        minimums: { ...start.minimums, payoneer_us_withdrawal: "0" },
        ownFees: new Set(["p2p_premium", "bitso_taker", "payoneer_us_withdrawal"]),
      }),
    );
    expect(back.amount).toBe("1.000");
    expect(back.fees.p2p_premium).toBe("0");
    expect(back.fees.bitso_taker).toBe("0,5");
    expect(back.minimums.payoneer_us_withdrawal).toBe("0");
    expect(back.ownFees).toEqual(new Set(["p2p_premium", "bitso_taker", "payoneer_us_withdrawal"]));
  });

  it("keeps an emptied fee empty, so it is not silently back at the reference", () => {
    const back = roundTrip(
      texts({ fees: { ...start.fees, bitso_taker: "" }, ownFees: new Set(["bitso_taker"]) }),
    );
    expect(back.fees.bitso_taker).toBe("");
    expect(back.ownFees.has("bitso_taker")).toBe(true);
  });

  it("stores only the fees the person set, so the rest follow the reference", () => {
    const stored = toStored(
      texts({ fees: { ...start.fees, bitso_taker: "0,5" }, ownFees: new Set(["bitso_taker"]) }),
    );
    expect(JSON.parse(stored ?? "")).toEqual({
      version: FORMAT_VERSION,
      amount: "",
      fees: { bitso_taker: "0,5" },
      minimums: {},
    });
  });

  it("never keeps prices: an old price misleads", () => {
    const back = roundTrip(texts({ amount: "1000", prices: { ...start.prices, mep: "1.536" } }));
    expect(back.prices).toEqual(start.prices);
    expect(toStored(texts({ prices: { ...start.prices, mep: "1.536" } }))).toBeNull();
  });

  it.each([
    ["text that is not JSON", "{"],
    ["another format version", JSON.stringify({ version: 0, amount: "5", fees: {}, minimums: {} })],
    ["a missing part", JSON.stringify({ version: FORMAT_VERSION, amount: "5", fees: {} })],
    [
      "a list instead of fees",
      JSON.stringify({ version: FORMAT_VERSION, amount: "5", fees: [], minimums: {} }),
    ],
    ["null", "null"],
  ])("starts over from %s", (_, text) => {
    expect(fromStored(text)).toEqual(start);
  });

  it("drops fees that no longer exist, values that are not text, and overlong texts", () => {
    const back = fromStored(
      JSON.stringify({
        version: FORMAT_VERSION,
        amount: "9".repeat(65),
        fees: { gone: "1", bitso_taker: 1, broker_buy: "0,5", arq_ach_deposit: "9".repeat(65) },
        minimums: { broker_buy: "3" },
      }),
    );
    expect(back.amount).toBe("");
    expect(back.ownFees).toEqual(new Set(["broker_buy"]));
    expect(back.fees.broker_buy).toBe("0,5");
    expect(back.fees.bitso_taker).toBe(start.fees.bitso_taker);
    expect(back.fees.arq_ach_deposit).toBe(start.fees.arq_ach_deposit);
    // broker_buy has no minimum: a stored one is ignored.
    expect(back.minimums).toEqual(start.minimums);
  });
});

describe("a browser that refuses to store", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps working when the storage is full", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    expect(() => {
      saveTexts(texts({ amount: "1.000" }));
    }).not.toThrow();
    expect(localStorage.length).toBe(0);
  });

  it("starts from a first visit when reading the storage fails", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Access denied.", "SecurityError");
    });
    expect(loadTexts()).toEqual(start);
  });
});
