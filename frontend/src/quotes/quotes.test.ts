import { describe, expect, it } from "vitest";

import { estimatedPrices, parseRates, parseTimestamp } from "./quotes.ts";

const item = (overrides: Record<string, unknown> = {}) => ({
  key: "bitso_usdt_ars",
  base: "USDT",
  quote: "ARS",
  price: "1452.30",
  source: "bitso_api",
  source_url: null,
  observed_at: "2026-10-01T15:00:00Z",
  ...overrides,
});

const card = (overrides: Record<string, unknown> = {}) =>
  item({
    key: "binance_card_usd_usdt",
    base: "USD",
    quote: "USDT",
    price: "0.9850",
    estimated_final: "0.9712",
    ...overrides,
  });

const body = (...rates: unknown[]) => ({ server_time: "2026-10-01T15:02:10.123456Z", rates });

describe("parseRates", () => {
  it("reads the server time and each price", () => {
    const snapshot = parseRates(body(item(), card()));
    expect(snapshot?.serverTime).toBe(Date.UTC(2026, 9, 1, 15, 2, 10, 123));
    const bitso = snapshot?.quotes.get("bitso_usdt_ars");
    expect(bitso?.price.toFixed()).toBe("1452.3");
    expect(bitso?.estimatedFinal).toBeNull();
    expect(bitso?.observedAt).toBe(Date.UTC(2026, 9, 1, 15));
    expect(snapshot?.quotes.get("binance_card_usd_usdt")?.estimatedFinal?.toFixed()).toBe("0.9712");
  });

  it.each([null, "x", [], {}, { rates: [] }, { server_time: "2026-10-01", rates: [] }])(
    "rejects a body that is not a snapshot: %j",
    (value) => {
      expect(parseRates(value)).toBeNull();
    },
  );

  it.each([
    ["an unknown key", item({ key: "blue" })],
    ["an inverted pair", item({ base: "ARS", quote: "USDT" })],
    ["a price that is not a decimal string", item({ price: 1452.3 })],
    ["a price in another notation", item({ price: "1,452.30" })],
    ["a negative price", item({ price: "-1452" })],
    ["a price out of its plausible range", item({ price: "14523" + "0".repeat(2) })],
    [
      "more decimals than a field takes",
      item({ key: "binance_p2p_usdt_usd", base: "USDT", quote: "USD", price: "1.012345678" }),
    ],
    ["a time without a zone", item({ observed_at: "2026-10-01T15:00:00" })],
    ["a date that does not exist", item({ observed_at: "2026-09-31T15:00:00Z" })],
    ["something that is not an object", "bitso"],
  ])("drops an item with %s, and keeps the others", (_, bad) => {
    const snapshot = parseRates(body(bad, card()));
    expect(snapshot?.quotes.size).toBe(1);
    expect(snapshot?.quotes.has("binance_card_usd_usdt")).toBe(true);
  });

  it("ignores trailing zeros when counting decimals", () => {
    const snapshot = parseRates(
      body(
        item({ key: "binance_p2p_usdt_usd", base: "USDT", quote: "USD", price: "1.0300000000" }),
      ),
    );
    expect(snapshot?.quotes.get("binance_p2p_usdt_usd")?.price.toFixed()).toBe("1.03");
  });

  it("keeps the card without an estimate when there is none or it is not usable", () => {
    for (const estimated of [null, "5", "x", undefined]) {
      const snapshot = parseRates(body(card({ estimated_final: estimated })));
      expect(snapshot?.quotes.get("binance_card_usd_usdt")?.estimatedFinal).toBeNull();
    }
  });

  it("never takes an estimate for another key", () => {
    const snapshot = parseRates(body(item({ estimated_final: "1452" })));
    expect(snapshot?.quotes.get("bitso_usdt_ars")?.estimatedFinal).toBeNull();
  });

  it("keeps the first of two items with the same key", () => {
    const snapshot = parseRates(body(item(), item({ price: "1500" })));
    expect(snapshot?.quotes.get("bitso_usdt_ars")?.price.toFixed()).toBe("1452.3");
  });
});

describe("estimatedPrices", () => {
  it("holds the card's estimate, if any", () => {
    expect(estimatedPrices(null).size).toBe(0);
    expect(estimatedPrices(parseRates(body(card({ estimated_final: null })))).size).toBe(0);
    expect(
      estimatedPrices(parseRates(body(card())))
        .get("binance_card_usd_usdt")
        ?.toFixed(),
    ).toBe("0.9712");
  });
});

describe("parseTimestamp", () => {
  it("applies the zone", () => {
    expect(parseTimestamp("2026-10-01T12:00:00-03:00")).toBe(Date.UTC(2026, 9, 1, 15));
    expect(parseTimestamp("2026-10-01T18:30:00+03:30")).toBe(Date.UTC(2026, 9, 1, 15));
  });

  it.each(["2026-10-01T24:00:00Z", "2026-10-01 15:00:00Z", "", 0])("rejects %j", (text) => {
    expect(parseTimestamp(text)).toBeNull();
  });
});
