import { describe, expect, it } from "vitest";

import { compareRoutes, type ComparisonInput, type RouteComparison } from "./compare.ts";
import { fixedFee, type Fee } from "./fees.ts";
import { positivePrice, type PositivePrice } from "./inputs.ts";
import { CurrencyMismatchError, Decimal, type Money } from "./money.ts";
import {
  SAMPLE_FEES,
  SAMPLE_PRICES,
  SAMPLE_RATE_DEFINITIONS,
  SAMPLE_ROUTES,
  validAmount,
  validPrice,
} from "./sample.fixture.ts";

const cents = (value: Money | null) => (value === null ? null : value.amount.toFixed(2));

function input(overrides: Partial<ComparisonInput> = {}): ComparisonInput {
  return {
    routes: SAMPLE_ROUTES,
    rateDefinitions: SAMPLE_RATE_DEFINITIONS,
    referenceKey: "mep",
    amount: validAmount("1000.00"),
    prices: SAMPLE_PRICES,
    fees: SAMPLE_FEES,
    ...overrides,
  };
}

function byId(routes: readonly RouteComparison[]) {
  return new Map(routes.map((r) => [r.route.id, r]));
}

describe("losses against the reference, as in the Python domain tests", () => {
  it("sorts the routes best first", () => {
    const comparison = compareRoutes(input());
    expect(comparison.routes.map((r) => r.route.id)).toEqual(["arq", "binance_bitso", "mep"]);
    expect(cents(comparison.atReference)).toBe("1536160.00");
  });

  it("splits each route's loss into fees and exchange rate", () => {
    const routes = byId(compareRoutes(input()).routes);
    const summary = (id: string) => {
      const r = routes.get(id);
      return r?.status === "complete"
        ? [cents(r.result.final), cents(r.feeCost), cents(r.fxLoss), cents(r.lossVsReference)]
        : null;
    };
    // Without fees: 1000.00 / 1.03 = 970.87 USDT x 1596.21 = 1549712.40
    // feeCost = 1549712.40 - 1518602.26; fxLoss = 1536160.00 - 1549712.40 (beats MEP)
    expect(summary("binance_bitso")).toEqual(["1518602.26", "31110.14", "-13552.40", "17557.74"]);
    // Without fees: 1000.00 x 1593.385 = 1593385.00
    expect(summary("arq")).toEqual(["1524869.44", "68515.56", "-57225.00", "11290.56"]);
    // The MEP route converts at the reference itself, so its only loss is fees.
    expect(summary("mep")).toEqual(["1503624.13", "32535.87", "0.00", "32535.87"]);
  });

  // Final, fee cost and FX loss computed once with the Python domain on the same sample inputs.
  // Frozen here on purpose: the table stays valid after the Python calculation is removed.
  const PYTHON: readonly (readonly [string, string, string, string, string])[] = [
    ["0.01", "arq", "0.00", "15.93", "-0.57"],
    ["0.01", "binance_bitso", "0.00", "0.00", "15.36"],
    ["0.01", "mep", "0.00", "15.36", "0.00"],
    ["1.00", "mep", "1443.99", "92.17", "0.00"],
    ["1.00", "arq", "0.00", "1593.38", "-57.22"],
    ["1.00", "binance_bitso", "0.00", "1548.32", "-12.16"],
    ["23.00", "mep", "34532.87", "798.81", "0.00"],
    ["23.00", "binance_bitso", "28667.93", "6975.43", "-311.68"],
    ["23.00", "arq", "0.00", "36647.85", "-1316.17"],
    ["100.00", "mep", "150359.34", "3256.66", "0.00"],
    ["100.00", "binance_bitso", "146085.13", "8874.93", "-1344.06"],
    ["100.00", "arq", "122690.64", "36647.86", "-5722.50"],
    ["500.00", "arq", "760044.64", "36647.86", "-28612.50"],
    ["500.00", "binance_bitso", "756092.75", "18755.47", "-6768.22"],
    ["500.00", "mep", "751796.70", "16283.30", "0.00"],
    ["777.77", "arq", "1184920.75", "54366.30", "-44507.89"],
    ["777.77", "binance_bitso", "1179679.00", "25635.13", "-10534.97"],
    ["777.77", "mep", "1169432.52", "25346.64", "0.00"],
    ["12345.67", "arq", "18879763.92", "791641.47", "-706480.97"],
    ["12345.67", "binance_bitso", "18820912.11", "311388.64", "-167376.33"],
    ["12345.67", "mep", "18563310.75", "401613.67", "0.00"],
    ["99999.99", "arq", "152960163.91", "6378320.15", "-5722499.43"],
    ["99999.99", "binance_bitso", "152495167.39", "2476647.51", "-1355830.27"],
    ["99999.99", "mep", "150363012.22", "3252972.41", "0.00"],
  ];

  it.each(PYTHON)("matches the Python domain for %s USD on %s", (amount, id, final, fees, fx) => {
    const route = byId(compareRoutes(input({ amount: validAmount(amount) })).routes).get(id);
    expect(route?.status).toBe("complete");
    if (route?.status === "complete") {
      expect([cents(route.result.final), cents(route.feeCost), cents(route.fxLoss)]).toEqual([
        final,
        fees,
        fx,
      ]);
    }
  });

  it.each(["0.01", "1.00", "100.00", "12345.67"])(
    "final + fees + FX loss equals the amount at the reference, for %s USD",
    (amount) => {
      const comparison = compareRoutes(input({ amount: validAmount(amount) }));
      for (const r of comparison.routes) {
        expect(r.status === "complete" && r.fxLoss !== null).toBe(true);
        if (r.status === "complete" && r.fxLoss !== null) {
          const total = r.result.final.amount.plus(r.feeCost.amount).plus(r.fxLoss.amount);
          expect(total.toFixed(2)).toBe(cents(comparison.atReference));
        }
      }
    },
  );
});

describe("empty inputs are never read as zero", () => {
  const withPrice = (key: string, price: PositivePrice | null) =>
    new Map<string, PositivePrice | null>([...SAMPLE_PRICES, [key, price]]);
  const withFee = (id: string, fee: Fee | null) =>
    new Map<string, Fee | null>([...SAMPLE_FEES, [id, fee]]);
  const missingOf = (comparison: ReturnType<typeof compareRoutes>, id: string) => {
    const route = byId(comparison.routes).get(id);
    return route?.status === "incomplete" ? route.missing : null;
  };

  it("leaves every route incomplete without an amount", () => {
    const comparison = compareRoutes(input({ amount: null }));
    expect(comparison.atReference).toBeNull();
    expect(comparison.routes.every((r) => r.status === "incomplete")).toBe(true);
    expect(missingOf(comparison, "arq")).toEqual([{ kind: "amount" }]);
  });

  it("computes the routes that do not convert with the MEP without it", () => {
    const comparison = compareRoutes(input({ prices: withPrice("mep", null) }));
    expect(comparison.atReference).toBeNull();
    expect(missingOf(comparison, "mep")).toEqual([{ kind: "rate", key: "mep" }]);
    const routes = comparison.routes.map((r) =>
      r.status === "complete"
        ? [r.route.id, cents(r.result.final), cents(r.feeCost), r.fxLoss, r.lossVsReference]
        : [r.route.id, r.status],
    );
    // Same finals and fee costs as with the MEP; only the split against it is unknown.
    expect(routes).toEqual([
      ["arq", "1524869.44", "68515.56", null, null],
      ["binance_bitso", "1518602.26", "31110.14", null, null],
      ["mep", "incomplete"],
    ]);
  });

  it("only affects the route that needs a missing rate", () => {
    const comparison = compareRoutes(input({ prices: withPrice("bitso_usdt_ars", null) }));
    expect(missingOf(comparison, "binance_bitso")).toEqual([
      { kind: "rate", key: "bitso_usdt_ars" },
    ]);
    expect(comparison.routes.map((r) => [r.route.id, r.status])).toEqual([
      ["arq", "complete"],
      ["mep", "complete"],
      ["binance_bitso", "incomplete"],
    ]);
  });

  it("keeps computing the other routes when a typed price is invalid", () => {
    // What the form does: validate what was typed, and pass null when it is not valid.
    const typed = positivePrice(new Decimal("0"));
    const comparison = compareRoutes(
      input({ prices: withPrice("bitso_usdt_ars", typed.ok ? typed.value : null) }),
    );
    expect(missingOf(comparison, "binance_bitso")).toEqual([
      { kind: "rate", key: "bitso_usdt_ars" },
    ]);
    expect(comparison.routes.filter((r) => r.status === "complete").map((r) => r.route.id)).toEqual(
      ["arq", "mep"],
    );
  });

  it("reports an empty fee instead of charging nothing", () => {
    const comparison = compareRoutes(input({ fees: withFee("arq_ach_deposit", null) }));
    expect(missingOf(comparison, "arq")).toEqual([{ kind: "fee", id: "arq_ach_deposit" }]);
  });

  it("lists everything a route is missing", () => {
    const comparison = compareRoutes(
      input({
        amount: null,
        prices: withPrice("arq_usd_ars", null),
        fees: withFee("arq_ach_deposit", null),
      }),
    );
    expect(missingOf(comparison, "arq")).toEqual([
      { kind: "amount" },
      { kind: "rate", key: "arq_usd_ars" },
      { kind: "fee", id: "arq_ach_deposit" },
    ]);
  });
});

describe("ordering", () => {
  it("breaks ties by route id", () => {
    const route = (id: string) => ({
      id,
      name: id,
      source: "USD" as const,
      target: "ARS" as const,
      steps: [
        { label: "s", feeIds: ["f"], conversion: { rateKey: "mep", target: "ARS" as const } },
      ],
      warnings: [],
    });
    const comparison = compareRoutes(
      input({
        routes: [route("b"), route("a")],
        fees: new Map([["f", fixedFee("f", "0", "USD")]]),
      }),
    );
    expect(comparison.routes.map((r) => r.route.id)).toEqual(["a", "b"]);
  });

  it("shows a gain as a negative loss", () => {
    const comparison = compareRoutes(input({ prices: withMep("1400") }));
    const arq = byId(comparison.routes).get("arq");
    expect(arq?.status === "complete" && arq.lossVsReference?.amount.lt(0)).toBe(true);
  });
});

describe("how each route stands against the others", () => {
  const standings = (comparison: ReturnType<typeof compareRoutes>) =>
    comparison.routes.map((r) => {
      if (r.status === "incomplete") {
        return [r.route.id, "incomplete"];
      }
      const { standing } = r;
      switch (standing.kind) {
        case "ahead":
        case "behind":
          return [r.route.id, standing.kind, cents(standing.by), standing.other.id];
        case "tied":
          return [r.route.id, "tied", standing.other.id];
        case "alone":
          return [r.route.id, "alone"];
      }
    });

  it("compares the best route with the runner-up, and every other route with the best", () => {
    // 1524869.44 - 1518602.26 = 6267.18; 1524869.44 - 1503624.13 = 21245.31
    expect(standings(compareRoutes(input()))).toEqual([
      ["arq", "ahead", "6267.18", "binance_bitso"],
      ["binance_bitso", "behind", "6267.18", "arq"],
      ["mep", "behind", "21245.31", "arq"],
    ]);
  });

  it("compares only the routes that could be computed", () => {
    const comparison = compareRoutes(
      input({ prices: new Map([...SAMPLE_PRICES, ["arq_usd_ars", null]]) }),
    );
    // 1518602.26 - 1503624.13 = 14978.13
    expect(standings(comparison)).toEqual([
      ["binance_bitso", "ahead", "14978.13", "mep"],
      ["mep", "behind", "14978.13", "binance_bitso"],
      ["arq", "incomplete"],
    ]);
  });

  it("has nothing to compare a route with when it is the only one computed", () => {
    const comparison = compareRoutes(
      input({
        prices: new Map([...SAMPLE_PRICES, ["arq_usd_ars", null], ["bitso_usdt_ars", null]]),
      }),
    );
    expect(standings(comparison)).toEqual([
      ["mep", "alone"],
      ["binance_bitso", "incomplete"],
      ["arq", "incomplete"],
    ]);
  });

  it("calls a zero difference a tie, for the best route and for the one level with it", () => {
    // Routes a and b deliver 1000 x 1536.16 = 1536160.00; c pays a 1 USD fee first:
    // 999 x 1536.16 = 1534623.84, 1536.16 less.
    const route = (id: string, fee: string) => ({
      id,
      name: id,
      source: "USD" as const,
      target: "ARS" as const,
      steps: [
        { label: "s", feeIds: [fee], conversion: { rateKey: "mep", target: "ARS" as const } },
      ],
      warnings: [],
    });
    const comparison = compareRoutes(
      input({
        routes: [route("c", "one"), route("b", "zero"), route("a", "zero")],
        fees: new Map([
          ["zero", fixedFee("zero", "0", "USD")],
          ["one", fixedFee("one", "1", "USD")],
        ]),
      }),
    );
    expect(standings(comparison)).toEqual([
      ["a", "tied", "b"],
      ["b", "tied", "a"],
      ["c", "behind", "1536.16", "a"],
    ]);
  });
});

function withMep(price: string | null) {
  return new Map<string, PositivePrice | null>([
    ...SAMPLE_PRICES,
    ["mep", price === null ? null : validPrice(price)],
  ]);
}

describe("currencies", () => {
  it("refuses to rank routes that end in different currencies, even without the MEP", () => {
    const route = (id: string, target: "USD" | "ARS") => ({
      id,
      name: id,
      source: "USD" as const,
      target,
      steps: [{ label: "s", feeIds: ["f"], conversion: null }],
      warnings: [],
    });
    expect(() =>
      compareRoutes(
        input({
          routes: [route("ars", "ARS"), route("usd", "USD")],
          prices: withMep(null),
          fees: new Map([["f", fixedFee("f", "0", "USD")]]),
        }),
      ),
    ).toThrow(CurrencyMismatchError);
  });
});
