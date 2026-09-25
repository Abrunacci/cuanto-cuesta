import { describe, expect, it } from "vitest";

import {
  compareRoutes,
  routesInOrder,
  type ComparisonInput,
  type RouteComparison,
} from "./compare.ts";
import { fixedFee, type Fee } from "./fees.ts";
import { positivePrice, type PositivePrice } from "./inputs.ts";
import { Decimal, type Money } from "./money.ts";
import {
  ARQ,
  BINANCE,
  MEP_ROUTE,
  SAMPLE_FEES,
  SAMPLE_PRICES,
  SAMPLE_RATE_DEFINITIONS,
  SAMPLE_ROUTES,
  validAmount,
} from "./sample.fixture.ts";

const cents = (value: Money | null) => (value === null ? null : value.amount.toFixed(2));

function input(overrides: Partial<ComparisonInput> = {}): ComparisonInput {
  return {
    routes: SAMPLE_ROUTES,
    target: "ARS",
    rateDefinitions: SAMPLE_RATE_DEFINITIONS,
    amount: validAmount("1000.00"),
    prices: SAMPLE_PRICES,
    fees: SAMPLE_FEES,
    ...overrides,
  };
}

function byId(routes: readonly RouteComparison[]) {
  return new Map(routes.map((r) => [r.route.id, r]));
}

describe("final and fee cost, as the Python domain tests had them", () => {
  it("sorts the routes best first", () => {
    const comparison = compareRoutes(input());
    expect(routesInOrder(comparison).map((r) => r.route.id)).toEqual([
      "arq",
      "binance_bitso",
      "mep",
    ]);
  });

  it("says how much more each route would deliver without fees", () => {
    const routes = byId(routesInOrder(compareRoutes(input())));
    const summary = (id: string) => {
      const r = routes.get(id);
      return r?.status === "complete" ? [cents(r.result.final), cents(r.feeCost)] : null;
    };
    // Without fees: 1000.00 / 1.03 = 970.87 USDT x 1596.21 = 1549712.40; 1549712.40 - 1518602.26
    expect(summary("binance_bitso")).toEqual(["1518602.26", "31110.14"]);
    // Without fees: 1000.00 x 1593.385 = 1593385.00
    expect(summary("arq")).toEqual(["1524869.44", "68515.56"]);
    // Without fees: 1000.00 x 1536.16 = 1536160.00
    expect(summary("mep")).toEqual(["1503624.13", "32535.87"]);
  });

  // Final and fee cost computed once with the Python domain on the same sample inputs, frozen
  // here on purpose: the Python calculation has since been removed.
  const PYTHON: readonly (readonly [string, string, string, string])[] = [
    ["0.01", "arq", "0.00", "15.93"],
    ["0.01", "binance_bitso", "0.00", "0.00"],
    ["0.01", "mep", "0.00", "15.36"],
    ["1.00", "mep", "1443.99", "92.17"],
    ["1.00", "arq", "0.00", "1593.38"],
    ["1.00", "binance_bitso", "0.00", "1548.32"],
    ["23.00", "mep", "34532.87", "798.81"],
    ["23.00", "binance_bitso", "28667.93", "6975.43"],
    ["23.00", "arq", "0.00", "36647.85"],
    ["100.00", "mep", "150359.34", "3256.66"],
    ["100.00", "binance_bitso", "146085.13", "8874.93"],
    ["100.00", "arq", "122690.64", "36647.86"],
    ["500.00", "arq", "760044.64", "36647.86"],
    ["500.00", "binance_bitso", "756092.75", "18755.47"],
    ["500.00", "mep", "751796.70", "16283.30"],
    ["777.77", "arq", "1184920.75", "54366.30"],
    ["777.77", "binance_bitso", "1179679.00", "25635.13"],
    ["777.77", "mep", "1169432.52", "25346.64"],
    ["12345.67", "arq", "18879763.92", "791641.47"],
    ["12345.67", "binance_bitso", "18820912.11", "311388.64"],
    ["12345.67", "mep", "18563310.75", "401613.67"],
    ["99999.99", "arq", "152960163.91", "6378320.15"],
    ["99999.99", "binance_bitso", "152495167.39", "2476647.51"],
    ["99999.99", "mep", "150363012.22", "3252972.41"],
  ];

  it.each(PYTHON)("matches the Python domain for %s USD on %s", (amount, id, final, fees) => {
    const route = byId(routesInOrder(compareRoutes(input({ amount: validAmount(amount) })))).get(
      id,
    );
    expect(route?.status).toBe("complete");
    if (route?.status === "complete") {
      expect([cents(route.result.final), cents(route.feeCost)]).toEqual([final, fees]);
    }
  });
});

describe("empty inputs are never read as zero", () => {
  const withPrice = (key: string, price: PositivePrice | null) =>
    new Map<string, PositivePrice | null>([...SAMPLE_PRICES, [key, price]]);
  const withFee = (id: string, fee: Fee | null) =>
    new Map<string, Fee | null>([...SAMPLE_FEES, [id, fee]]);
  const missingOf = (comparison: ReturnType<typeof compareRoutes>, id: string) => {
    const route = byId(routesInOrder(comparison)).get(id);
    return route?.status === "incomplete" ? route.missing : null;
  };

  it("leaves every route incomplete without an amount", () => {
    const comparison = compareRoutes(input({ amount: null }));
    expect(comparison.ranking.kind).toBe("none");
    expect(comparison.incomplete).toHaveLength(3);
    expect(missingOf(comparison, "arq")).toEqual([{ kind: "amount" }]);
  });

  it("computes the routes that do not convert with the MEP without it", () => {
    const comparison = compareRoutes(input({ prices: withPrice("mep", null) }));
    expect(missingOf(comparison, "mep")).toEqual([{ kind: "rate", key: "mep" }]);
    const routes = routesInOrder(comparison).map((r) =>
      r.status === "complete"
        ? [r.route.id, cents(r.result.final), cents(r.feeCost)]
        : [r.route.id, r.status],
    );
    // Same finals and fee costs as with the MEP.
    expect(routes).toEqual([
      ["arq", "1524869.44", "68515.56"],
      ["binance_bitso", "1518602.26", "31110.14"],
      ["mep", "incomplete"],
    ]);
  });

  it("only affects the route that needs a missing rate", () => {
    const comparison = compareRoutes(input({ prices: withPrice("bitso_usdt_ars", null) }));
    expect(missingOf(comparison, "binance_bitso")).toEqual([
      { kind: "rate", key: "bitso_usdt_ars" },
    ]);
    expect(routesInOrder(comparison).map((r) => [r.route.id, r.status])).toEqual([
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
    expect(
      routesInOrder(comparison)
        .filter((r) => r.status === "complete")
        .map((r) => r.route.id),
    ).toEqual(["arq", "mep"]);
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
    expect(routesInOrder(comparison).map((r) => r.route.id)).toEqual(["a", "b"]);
  });
});

describe("how each route stands against the others", () => {
  const standings = (comparison: ReturnType<typeof compareRoutes>) =>
    routesInOrder(comparison).map((r) => {
      if (r.status !== "complete") {
        return [r.route.id, r.status];
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

  it("ties every route that delivers as much as the best, not only the runner-up", () => {
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
        routes: [route("d", "one"), route("c", "zero"), route("b", "zero"), route("a", "zero")],
        fees: new Map([
          ["zero", fixedFee("zero", "0", "USD")],
          ["one", fixedFee("one", "1", "USD")],
        ]),
      }),
    );
    expect(standings(comparison)).toEqual([
      ["a", "tied", "b"],
      ["b", "tied", "a"],
      ["c", "tied", "a"],
      ["d", "behind", "1536.16", "a"],
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

describe("routes whose own data is wrong", () => {
  const failures = (comparison: ReturnType<typeof compareRoutes>) =>
    comparison.failed.map((r) => [r.route.id, r.error.name, r.error.message]);
  const ids = (comparison: ReturnType<typeof compareRoutes>) =>
    routesInOrder(comparison).map((r) => [r.route.id, r.status]);

  it("fails a route whose result is not in the currency it declares, and ranks the others", () => {
    // ARQ's first two steps charge only USD fees and convert nothing: it ends in USD, not ARS.
    const brokenArq = { ...ARQ, steps: ARQ.steps.slice(0, 2) };
    const comparison = compareRoutes(input({ routes: [BINANCE, brokenArq, MEP_ROUTE] }));
    expect(failures(comparison)).toEqual([
      ["arq", "CurrencyMismatchError", "Route arq ends in USD, it declares ARS"],
    ]);
    expect(ids(comparison)).toEqual([
      ["binance_bitso", "complete"],
      ["mep", "complete"],
      ["arq", "failed"],
    ]);
  });

  const usd = {
    id: "usd",
    name: "usd",
    source: "USD" as const,
    target: "USD" as const,
    steps: [{ label: "s", feeIds: ["arq_ach_deposit"], conversion: null }],
    warnings: [],
  };

  it("fails a route that ends in another currency than the comparison, wherever it is", () => {
    for (const routes of [
      [usd, BINANCE, MEP_ROUTE],
      [BINANCE, usd, MEP_ROUTE],
    ]) {
      const comparison = compareRoutes(input({ routes }));
      expect(failures(comparison)).toEqual([
        ["usd", "CurrencyMismatchError", "Route usd ends in USD, the comparison is in ARS"],
      ]);
      expect(ids(comparison)).toEqual([
        ["binance_bitso", "complete"],
        ["mep", "complete"],
        ["usd", "failed"],
      ]);
    }
  });

  it("fails a route that uses a fee that does not exist, instead of asking for it", () => {
    const fees = new Map([...SAMPLE_FEES].filter(([id]) => id !== "arq_ach_deposit"));
    const comparison = compareRoutes(input({ fees }));
    expect(failures(comparison)).toEqual([
      ["arq", "UnknownFeeError", "Route arq uses fee arq_ach_deposit, which does not exist"],
    ]);
  });

  it("fails a route that converts with a rate that has no definition, instead of asking for it", () => {
    const rateDefinitions = SAMPLE_RATE_DEFINITIONS.filter((d) => d.key !== "arq_usd_ars");
    const comparison = compareRoutes(input({ rateDefinitions }));
    expect(failures(comparison)).toEqual([
      ["arq", "UnknownRateError", "Route arq uses rate arq_usd_ars, which does not exist"],
    ]);
  });

  it("asks for the price of a rate whose definition is wrong until it is typed", () => {
    // The definition only turns into a rate with a price: before that, nothing is known wrong.
    const rateDefinitions = SAMPLE_RATE_DEFINITIONS.map((d) =>
      d.key === "bitso_usdt_ars" ? { ...d, base: "ARS" as const } : d,
    );
    const prices = new Map<string, PositivePrice | null>([
      ...SAMPLE_PRICES,
      ["bitso_usdt_ars", null],
    ]);
    const comparison = compareRoutes(input({ rateDefinitions, prices }));
    expect(comparison.failed).toEqual([]);
    expect(ids(comparison)).toContainEqual(["binance_bitso", "incomplete"]);
  });

  it("fails the routes that convert with a rate whose definition is wrong", () => {
    const rateDefinitions = SAMPLE_RATE_DEFINITIONS.map((d) =>
      d.key === "bitso_usdt_ars" ? { ...d, base: "ARS" as const } : d,
    );
    const comparison = compareRoutes(input({ rateDefinitions }));
    expect(failures(comparison)).toEqual([
      ["binance_bitso", "InvalidRateError", "Rate bitso_usdt_ars: base and quote must differ"],
    ]);
    expect(ids(comparison)).toEqual([
      ["arq", "complete"],
      ["mep", "complete"],
      ["binance_bitso", "failed"],
    ]);
  });
});
