import { describe, expect, it } from "vitest";

import { fixedFee, percentFee, type Fee } from "./fees.ts";
import { CurrencyMismatchError, money, type Money } from "./money.ts";
import { rate, type Rate } from "./rates.ts";
import {
  routeProblems,
  runRoute,
  UnknownFeeError,
  UnknownRateError,
  type Route,
} from "./routes.ts";
import {
  ARQ,
  BINANCE,
  MEP_ROUTE,
  SAMPLE_FEES,
  SAMPLE_PRICES,
  SAMPLE_RATE_DEFINITIONS,
} from "./sample.fixture.ts";

const cents = (value: Money) => `${value.amount.toFixed(2)} ${value.currency}`;

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`No item at ${String(index)}`);
  }
  return item;
}

const SAMPLE_RATES: ReadonlyMap<string, Rate> = new Map(
  SAMPLE_RATE_DEFINITIONS.map((d) => {
    const price = SAMPLE_PRICES.get(d.key);
    if (price === undefined) {
      throw new Error(`No sample price for ${d.key}`);
    }
    return [d.key, rate(d.key, d.base, d.quote, price)];
  }),
);

describe("the sample routes step by step, as in the Python domain tests", () => {
  it("Binance + Bitso", () => {
    const result = runRoute(BINANCE, money("1000.00", "USD"), SAMPLE_FEES, SAMPLE_RATES);
    const p2p = at(result.steps, 0);
    const withdrawal = at(result.steps, 1);
    const bitso = at(result.steps, 2);
    const bank = at(result.steps, 3);

    // 1000.00 - 4.00 fixed - 1 % (10.00) = 986.00 USD
    // 986.00 / 1.03 = 957.2815... -> 957.28 USDT, minus 0.08 USDT taker = 957.20
    expect(p2p.fees.map((c) => cents(c.amount))).toEqual(["4.00 USD", "10.00 USD", "0.08 USDT"]);
    expect(cents(p2p.amountOut)).toBe("957.20 USDT");
    expect(cents(withdrawal.amountOut)).toBe("957.13 USDT");
    // 0.6 % of 957.13 = 5.74278 -> 5.75; 951.38 x 1596.21 = 1518602.2698
    expect(bitso.fees.map((c) => cents(c.amount))).toEqual(["5.75 USDT"]);
    expect(cents(bank.amountOut)).toBe("1518602.26 ARS");
    expect(cents(result.final)).toBe("1518602.26 ARS");
    expect(result.exhausted).toBe(false);
  });

  it("ARQ", () => {
    const result = runRoute(ARQ, money("1000.00", "USD"), SAMPLE_FEES, SAMPLE_RATES);
    // 1000.00 - 4 % = 960.00; - 3.00 = 957.00; x 1593.385 = 1524869.445
    expect(result.steps.map((s) => cents(s.amountOut))).toEqual([
      "960.00 USD",
      "957.00 USD",
      "1524869.44 ARS",
      "1524869.44 ARS",
    ]);
  });

  it("ARQ below the Payoneer minimum", () => {
    const result = runRoute(ARQ, money("100.00", "USD"), SAMPLE_FEES, SAMPLE_RATES);
    // 4 % of 100.00 = 4.00, below the 20.00 minimum: 80.00; - 3.00 = 77.00 x 1593.385
    expect(at(result.steps, 0).fees.map((c) => cents(c.amount))).toEqual(["20.00 USD"]);
    expect(cents(result.final)).toBe("122690.64 ARS");
  });

  it("MEP", () => {
    const result = runRoute(MEP_ROUTE, money("1000.00", "USD"), SAMPLE_FEES, SAMPLE_RATES);
    const sale = at(result.steps, 2);
    // 1000.00 - 2 % = 980.00; broker 0.05 % per side = 0.49 twice; BYMA 0.01 % = 0.098 -> 0.10
    // twice; 978.82 x 1536.16 = 1503624.1312
    expect(sale.fees.map((c) => cents(c.amount))).toEqual([
      "0.49 USD",
      "0.49 USD",
      "0.10 USD",
      "0.10 USD",
    ]);
    expect(cents(sale.amountIn)).toBe("980.00 USD");
    expect(cents(result.final)).toBe("1503624.13 ARS");
  });
});

describe("fees inside a step", () => {
  const run = (...fees: Fee[]) => {
    const route: Route = {
      id: "r",
      name: "r",
      source: "USD",
      target: "USDT",
      steps: [
        {
          label: "s",
          feeIds: fees.map((f) => f.id),
          conversion: { rateKey: "p2p_usdt_usd", target: "USDT" },
        },
      ],
      warnings: [],
    };
    return runRoute(
      route,
      money("100.00", "USD"),
      new Map(fees.map((f) => [f.id, f])),
      SAMPLE_RATES,
    );
  };

  it("applies percent fees to the step input, not to each other", () => {
    // 100.00 - 10.00 - 10.00 = 80.00 USD; 80.00 / 1.03 = 77.669... -> 77.66
    expect(cents(run(percentFee("a", "10"), percentFee("b", "10")).final)).toBe("77.66 USDT");
  });

  it("charges a fixed fee in the input currency before converting", () => {
    // 97.00 / 1.03 = 94.174... -> 94.17
    expect(cents(run(fixedFee("f", "3", "USD")).final)).toBe("94.17 USDT");
  });

  it("charges a fixed fee in the target currency after converting", () => {
    // 100.00 / 1.03 = 97.087... -> 97.08; - 3.00 = 94.08
    expect(cents(run(fixedFee("f", "3", "USDT")).final)).toBe("94.08 USDT");
  });

  it("rejects a fixed fee in an unrelated currency", () => {
    expect(() => run(fixedFee("f", "3", "ARS"))).toThrow(CurrencyMismatchError);
  });

  it("rejects a percent fee minimum in another currency, naming the step", () => {
    expect(() => run(percentFee("m", "1", money("1", "ARS")))).toThrow(
      /Step s: fee m has its minimum in ARS/,
    );
  });

  it("leaves zero when fees exceed the amount", () => {
    const fee = fixedFee("f", "20", "USD");
    const route: Route = {
      id: "r",
      name: "r",
      source: "USD",
      target: "USD",
      steps: [
        { label: "s", feeIds: ["f"], conversion: null },
        { label: "t", feeIds: ["f"], conversion: null },
      ],
      warnings: [],
    };
    const result = runRoute(route, money("5.00", "USD"), new Map([["f", fee]]), new Map());
    expect(cents(result.final)).toBe("0.00 USD");
    expect(result.exhausted).toBe(true);
  });
});

describe("fees that consume the whole amount after converting", () => {
  it("leave zero and mark the route exhausted", () => {
    const fee = fixedFee("f", "1000", "USDT");
    const route: Route = {
      id: "r",
      name: "r",
      source: "USD",
      target: "USDT",
      steps: [
        { label: "s", feeIds: ["f"], conversion: { rateKey: "p2p_usdt_usd", target: "USDT" } },
      ],
      warnings: [],
    };
    // 100.00 / 1.03 = 97.08 USDT, minus 1000 USDT
    const result = runRoute(route, money("100.00", "USD"), new Map([["f", fee]]), SAMPLE_RATES);
    expect(cents(result.final)).toBe("0.00 USDT");
    expect(result.exhausted).toBe(true);
  });
});

describe("invalid input", () => {
  it("needs the amount in the route's source currency", () => {
    expect(() => runRoute(ARQ, money("1000", "ARS"), SAMPLE_FEES, SAMPLE_RATES)).toThrow(
      CurrencyMismatchError,
    );
  });

  it("refuses a result in a currency other than the one the route declares", () => {
    // ARQ's first two steps charge only USD fees and convert nothing: it ends in USD, not ARS.
    const broken: Route = { ...ARQ, steps: ARQ.steps.slice(0, 2) };
    expect(() => runRoute(broken, money("1000", "USD"), SAMPLE_FEES, SAMPLE_RATES)).toThrow(
      /ends in USD, it declares ARS/,
    );
  });

  it("needs every fee and rate the route uses", () => {
    const fees = new Map([...SAMPLE_FEES].filter(([id]) => id !== "arq_ach_deposit"));
    expect(() => runRoute(ARQ, money("1000", "USD"), fees, SAMPLE_RATES)).toThrow(UnknownFeeError);
    expect(() => runRoute(ARQ, money("1000", "USD"), SAMPLE_FEES, new Map())).toThrow(
      UnknownRateError,
    );
  });
});

describe("routeProblems", () => {
  const base: Route = { id: "r", name: "r", source: "USD", target: "ARS", steps: [], warnings: [] };

  it("accepts the sample routes", () => {
    expect([BINANCE, ARQ, MEP_ROUTE].flatMap(routeProblems)).toEqual([]);
  });

  it("rejects a route with no steps", () => {
    expect(routeProblems(base)).toEqual(["Route r has no steps"]);
  });

  it("rejects a step that does nothing, a self-conversion and a wrong end currency", () => {
    const route: Route = {
      ...base,
      steps: [
        { label: "idle", feeIds: [], conversion: null },
        { label: "same", feeIds: [], conversion: { rateKey: "k", target: "USD" } },
      ],
    };
    expect(routeProblems(route)).toEqual([
      "Route r: step idle neither charges fees nor converts",
      "Route r: step same converts USD to itself",
      "Route r ends in USD, expected ARS",
    ]);
  });
});
