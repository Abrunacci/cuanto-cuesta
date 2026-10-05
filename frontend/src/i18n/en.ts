/**
 * Everything the screen says, in English. See `texts.ts`. The content is still about Argentina:
 * amounts in pesos say ARS, since "$" reads as dollars, and times are Buenos Aires time.
 */

import type { AgeParts, MarketTime } from "../quotes/freshness.ts";
import { ageParts } from "../quotes/freshness.ts";
import { ENGLISH_NUMBERS, numbersIn } from "../text/numbers.ts";
import type { Texts } from "./texts.ts";

/** No-break space: a number never ends up on a different line from its unit. */
const NBSP = "\u00a0";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const count = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** "45 min", "2 h 10 min", "3 h 05 min", "3 h"; from a day on, "1 day", "2 days". */
function age(parts: AgeParts): string {
  if (parts.kind === "days") {
    return count(parts.days, "day", "days");
  }
  const { hours, minutes } = parts;
  if (hours === 0) {
    return `${String(minutes)} min`;
  }
  return minutes === 0
    ? `${String(hours)} h`
    : `${String(hours)} h ${String(minutes).padStart(2, "0")} min`;
}

/** "5:00 PM", "10:45 AM". */
function clock({ hour, minute }: MarketTime): string {
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(twelve)}:${String(minute).padStart(2, "0")}${NBSP}${hour < 12 ? "AM" : "PM"}`;
}

const weekday = ({ weekday: day }: MarketTime) => WEEKDAYS[day] ?? "";

/** "Oct 2": the month in words, so 2/10 and 10/2 cannot be confused. */
const monthDay = ({ month, day }: { month: number; day: number }) =>
  `${MONTHS[month - 1] ?? ""} ${String(day)}`;

/** Where to check each price, after "Check it". */
const WHERE: Readonly<Record<string, string>> = {
  mep: "at your bank or broker",
  binance_p2p_usdt_usd: "on Binance P2P",
  bitso_usdt_ars: "on Bitso",
  arq_usd_ars: "on ARQ",
};

const heldCard = (held: string | null) =>
  held === null
    ? ""
    : ` The latest reading was ${held}, very different from this estimate, and is not used yet.`;

export const en: Texts = {
  language: "en",
  numbers: numbersIn(ENGLISH_NUMBERS),
  list: (items) =>
    items.length <= 1
      ? items.join("")
      : `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`,
  listSeparator: (index, total) => (index === 0 ? "" : index === total - 1 ? " and " : ", "),

  page: {
    lead: "Compare how many pesos reach your bank when you cash out your Payoneer dollars.",
    description:
      "Compare how many pesos reach your bank when you cash out your Payoneer dollars through Binance, ARQ or the MEP dollar.",
    languageGroup: "Language",
    newTab: (label) => `${label} (opens in a new tab)`,
    feesTitle: "Fees of each route",
    feesIntro:
      "They start at the researched values. Open a route to adjust them: what you enter is saved in this browser.",
  },

  inputs: {
    title: "Your details",
    intro: (prefilled) =>
      prefilled
        ? "Comma for thousands and dot for decimals (1,536.16). The amount is saved in this browser. The prices come filled in with the latest ones we got; you can change them."
        : "Comma for thousands and dot for decimals (1,536.16). The amount is saved in this browser; the prices are not.",
    amountLabel: "Amount in Payoneer",
    amountHelp: "The dollars in your Payoneer account that you want to turn into pesos.",
    amountPlaceholder: "e.g. 1,000",
  },

  routes: {
    binance_card_bitso: { name: "Binance with card + Bitso", warnings: [] },
    binance_p2p_bitso: {
      name: "Binance P2P + Bitso",
      warnings: [
        "Paying P2P with Payoneer can get your Binance account blocked. The P2P price is the one of the generic USDT/USD offer.",
      ],
    },
    arq: { name: "ARQ (ex DolarApp)", warnings: [] },
    mep: {
      name: "MEP dollar",
      warnings: [
        "[Check the restrictions on the MEP dollar](https://www.bcra.gob.ar/Pdfs/comytexord/A8481.pdf) (in Spanish)",
      ],
    },
  },

  steps: {
    card_buy: "Buy USDT with the Payoneer card on Binance",
    usdt_to_bitso: "Withdraw USDT to Bitso over Polygon",
    bitso_sell: "Sell USDT for ARS on Bitso",
    ars_to_bank: "Withdraw ARS to the bank",
    p2p_sell: "Sell USD for USDT on Binance P2P",
    payoneer_to_arq: "Withdraw from Payoneer to ARQ",
    arq_ach: "ARQ receives the ACH transfer",
    arq_convert: "Convert USDc to ARS in ARQ",
    payoneer_to_bank: "Withdraw from Payoneer to an Argentine USD account",
    bank_credit: "The bank credits the transfer",
    mep_bonds: "Buy AL30D and sell AL30",
  },

  risks: {
    account_block: {
      label: "Account block risk",
      mark: "risk",
      detail: "at the risk of Binance blocking your account",
    },
  },

  rates: {
    mep: {
      label: "MEP dollar (buy)",
      shortLabel: "MEP",
      help: "What you get for each dollar sold through MEP. You see it at your bank or broker.",
      unit: "ARS per USD",
    },
    binance_p2p_usdt_usd: {
      label: "Binance P2P price (USD per USDT)",
      shortLabel: "P2P price",
      help: "On Binance P2P, how many USD each USDT costs in the offers to buy.",
      unit: "USD per USDT",
    },
    bitso_usdt_ars: {
      label: "Bitso sell price (ARS per USDT)",
      shortLabel: "Bitso price",
      help: "On Bitso, how many pesos you get for each USDT you sell.",
      unit: "ARS per USDT",
    },
    arq_usd_ars: {
      label: "ARQ rate (ARS per USDc)",
      shortLabel: "ARQ rate",
      help: "In the ARQ app, how many pesos you get for each digital dollar (USDc).",
      unit: "ARS per USDc",
    },
    binance_card_usd_usdt: {
      label: "Binance with card (USDT per USD)",
      shortLabel: "card price",
      help: "On Binance, Buy with card: the price on the final payment screen (1 USD ≈ … USDT), before confirming. Don't use what you receive divided by what you pay (it already takes off the fee) or the one in the list of payment methods (it is higher than the real one).",
      unit: "USDT per USD",
    },
  },

  fees: {
    binance_card_purchase: {
      label: "Binance fee for buying with a card",
      note: 'Binance says "up to around 2%". Observed on Sep 25, 2026 on the final payment screen, before confirming the purchase: 0.20 USD with 10 USD and 2.00 USD with 100 USD. If your final screen shows another fee, enter yours. On your own purchases, Payoneer always debits exactly the USD amount loaded on Binance: the card adds no charges (last observed on Sep 25, 2026).',
    },
    payoneer_p2p_transfer: {
      label: "Payoneer transfer to the P2P buyer",
      note: "Up to 4.00 USD if both accounts are in the same country; up to 1 % plus up to 4.00 USD if they are in different countries.",
    },
    p2p_premium: {
      label: "P2P surcharge for paying with Payoneer",
      note: "The live P2P price does not filter by payment method, and no public offers accepting Payoneer were found. Enter how much more you actually pay over that price.",
    },
    binance_p2p_taker: {
      label: "Binance P2P taker fee",
      note: "Between 0.06 and 0.08 USDT per order; the announcement does not say which one applies to USD.",
    },
    binance_withdrawal_polygon: {
      label: "USDT withdrawal from Binance over Polygon",
      note: "It is the cheapest network Bitso accepts. Binance changes this fee often.",
    },
    bitso_usdt_deposit: {
      label: "USDT deposit on Bitso",
      note: null,
    },
    bitso_taker: {
      label: "Bitso order book taker fee",
      note: "Base tier, with less than ARS 1,625,000 of volume in 30 days; at higher tiers it goes down to 0.15 %.",
    },
    bitso_ars_withdrawal: {
      label: "ARS withdrawal from Bitso to CBU/CVU",
      note: null,
    },
    payoneer_us_withdrawal: {
      label: "Withdrawal from Payoneer to a US account",
      note: "Between 1.2 % and 4 % for Argentine account holders, with a minimum of up to 20.00 USD. The exact values are only shown inside the account; if you are not charged a minimum, set it to 0.",
    },
    arq_ach_deposit: {
      label: "ACH receipt at ARQ",
      note: null,
    },
    arq_usd_usdc_conversion: {
      label: "USD→USDc conversion at ARQ",
      note: 'ARQ credits the USD that arrive by ACH directly as USDc, but does not publish the rate of that conversion, and no documented spread was found. The only fee published for USD deposits is the fixed 3 USDc on the Standard plan (https://help.arqfinance.com/es/articles/16785194-costes-y-comisiones-de-arq-argentina); the terms say "al valor equivalente en Dólares Digitales" (at the equivalent value in digital dollars), without giving the rate (https://www.arqfinance.com/es-AR/legal/terminos_y_condiciones_cuenta_global_arg, item 3.1).',
    },
    arq_ars_withdrawal: {
      label: "ARS withdrawal from ARQ to CBU",
      note: null,
    },
    payoneer_ar_withdrawal: {
      label: "Withdrawal from Payoneer to an Argentine USD account",
      note: '"Up to 2 %" according to this page; another Payoneer page says 3.3 % end to end for Santander (https://pages.payoneer.com/es/withdrawal-of-funds/).',
    },
    bank_usd_credit: {
      label: "Bank fee for crediting the transfer",
      note: "Banks cannot charge for these operations (in force since Sep 15, 2026).",
    },
    broker_buy: {
      label: "Broker fee, buying AL30D",
      note: 'Balanz, "up to 0.05 %" on sovereign bonds. It depends on your broker or bank.',
    },
    broker_sell: {
      label: "Broker fee, selling AL30",
      note: 'Balanz, "up to 0.05 %" on sovereign bonds. It depends on your broker or bank.',
    },
    byma_buy: {
      label: "BYMA market fees, buying AL30D",
      note: "Charged on each leg of the MEP operation.",
    },
    byma_sell: {
      label: "BYMA market fees, selling AL30",
      note: "Charged on each leg of the MEP operation.",
    },
  },

  problems: {
    notANumber: "Enter a number, for example 1,234.56.",
    notPositive: "It has to be more than 0.",
    tooManyDecimals: (max) => `Use at most ${String(max)} decimals.`,
    tooLarge: (max) => `It cannot be more than ${max}.`,
    negative: "It cannot be negative.",
    aboveCap: (cap, unit) => `At most ${cap} ${unit}.`,
    unusualPrice: (value, unit, min, max) =>
      `Unusual value: we read ${value} ${unit}, and it is usually between ${min} and ${max}. Check it.`,
    didYouMean: (value) => `Did you mean ${value}?`,
    read: (value, unit) => `We read ${value} ${unit}.`,
  },

  missing: {
    amount: "amount in USD",
    amountShort: "amount",
    feeMinimum: (fee) => `the minimum of ${fee}`,
    feeAndMinimum: (fee) => `${fee} and its minimum`,
  },

  feeStatus: {
    verified: "Verified",
    estimate: "Estimate",
    userDefined: "Yours to set",
    own: "Your value",
  },

  referenceValue: (value, minimum) => (minimum === null ? value : `${value}, minimum ${minimum}`),

  summary: {
    amountProblem: "Check the amount: it holds a value that cannot be used.",
    allFailed:
      "No route can be computed: there is a problem with the prices or fees they use. It is not a mistake in what you entered.",
    noneYet: "No route can be computed yet: see what each one is missing.",
    completeAmount: "Enter the amount to compare the routes.",
    completeAmountAndRates: "Enter the amount and the prices to compare the routes.",
    estimateMark: ", with the estimated price",
    alone: (route, arrives) => `For now only ${route} can be computed: ${arrives}.`,
    best: (route, arrives, by, other) =>
      `Best route: ${route}, ${arrives}: ${by} more than ${other}.`,
    unrivaled: (route, arrives) => `Best route: ${route}, ${arrives}.`,
    tied: (routes, arrives) => `${routes} tie: ${arrives}.`,
    risky: (route, arrives, risk) =>
      `For now only routes with risk can be computed: ${route}, ${arrives}, ${risk}.`,
    riskyOver: (route, by, risk) => `${route} leaves ${by} more, ${risk}.`,
    arrives: (amount) => `you get ${amount}`,
  },

  bar: {
    name: "Result summary",
    leads: {
      best: { full: "Best route", short: "Best" },
      tied: { full: "Tied", short: "Tie" },
      alone: { full: "Only route computed", short: "Only" },
      risky: { full: "Only with risk", short: "Only with risk" },
    },
    arrives: (amount) => `You get ${amount}`,
    review: "check",
    reviewDetail: "this route's values.",
    estimated: "estimated price",
    estimatedShort: "estimated",
    seeResult: "See result",
    allFailed: "No route can be computed",
    amountProblem: "Check: amount",
    noneYet: "See what each route is missing",
    missing: (list) => `Still missing: ${list}.`,
    missingShort: (list) => `Missing: ${list}`,
  },

  results: {
    title: "Result",
    missingTitle: "Still missing or to fix:",
    routeMissingDone: "It is computed once you fill in what is above.",
    failedRoute:
      "This route cannot be computed: there is a problem with the prices or fees it uses. It is not a mistake in what you entered.",
    arrives: "Reaches your bank",
    fees: "Fees",
    difference: "Difference",
    aloneDifference: "No other route to compare with yet",
    unrivaledDifference: "Only route without risk",
    more: (other) => `more than ${other}`,
    less: (other) => `less than ${other}`,
    same: (other) => `Same as ${other}`,
    review: "check",
    reviewLabel: (route) => `Check the values of ${route}`,
    unusual: (prices) => `Computed with an unusual value: ${prices}.`,
    exhausted: "The fees eat up the whole amount at some step.",
    attention: "Note:",
    estimateBadge: "Estimated price",
  },

  review: {
    valuesToSet: (n) => count(n, "value to set", "values to set"),
    estimatedFees: (n) => count(n, "estimated fee", "estimated fees"),
    whatToCheck: (parts) => `To check: ${parts}`,
    ownFees: (n) => `With your value: ${count(n, "fee", "fees")}`,
    toSet: (value) => `: it is at ${value}, enter your value.`,
    estimated: (n) =>
      n === 1
        ? { before: "It includes an estimated fee: ", after: ". Check it if you know yours." }
        : { before: "It includes estimated fees: ", after: ". Check them if you know yours." },
    own: "With your value:",
  },

  cards: {
    adjust: "Adjust fees",
    ownCount: (n) => (n === 0 ? "" : ` · ${String(n)} with your value`),
    convertsWith: (rate) => `Converts with: ${rate}, which you entered above.`,
    setElsewhere: (n) => (n === 1 ? "This fee is adjusted in " : "These fees are adjusted in "),
    details: "Details",
    detailsLabel: (status, fee) => `${status}. Details of ${fee}`,
    ownValue: (reference) => `You entered your value. The reference one is ${reference}.`,
    backToReference: "Back to the reference value",
    backToReferenceLabel: (fee) => `Back to the reference value: ${fee}`,
    minimumLabel: (fee) => `${fee}: minimum`,
    minimumHelp:
      "This minimum is charged when the percentage comes to less. If you are not charged one, enter 0.",
  },

  provenance: {
    verified: (date) => `Verified on ${date}`,
    reviewed: (date) => `Reviewed on ${date}`,
    upperBound: "The source gives a cap: this is the maximum value. ",
    source: "Source",
    sourceOf: (fee) => `Source of ${fee}`,
    reference: "Reference price",
    referenceOf: (fee) => `Reference price of ${fee}`,
    date: (isoDate) => {
      const [year = "", month = "", day = ""] = isoDate.split("-");
      return `${monthDay({ month: Number(month), day: Number(day) })}, ${year}`;
    },
  },

  reset: {
    button: "Reset to reference values",
    question: (n) =>
      `Put ${n === 1 ? "the fee with your value" : `the ${String(n)} fees with your values`} back to the reference values? What you entered is deleted.`,
    confirm: "Yes, reset",
    cancel: "Cancel",
    done: "Done: the fees are back to their reference values.",
  },

  quotes: {
    age: (milliseconds) => age(ageParts(milliseconds)).replace(/(\d) /g, `$1${NBSP}`),
    stale: (age, key) =>
      `It may be out of date: it is ${age} old. Check it ${WHERE[key] ?? ""} before deciding.`,
    held: (value, key) =>
      `The latest reading was ${value}, very different from this price, and is not used yet. Check it ${WHERE[key] ?? ""} before deciding.`,
    closed: ({ read, readToday, opens, opensOn }) => {
      const day = readToday ? "today" : `on ${weekday(read)}, ${monthDay(read)}`;
      const openDay = { today: "today", tomorrow: "tomorrow", later: `on ${weekday(opens)}` }[
        opensOn
      ];
      return `Close ${day} at ${clock(read)} (Buenos Aires time). The market opens ${openDay} at ${clock(opens)}.`;
    },
    cardField: (value, age, held) =>
      `Until you enter it, the comparison uses the estimate: ${value}${age === null ? "" : `, from ${age} ago`}.${heldCard(held)}`,
    cardResult: (value, age, held) =>
      `Computed with the card's estimated price (${value}${age === null ? "" : `, from ${age} ago: it may be out of date`}).${heldCard(held)} Enter the one on your Binance payment screen for the exact value.`,
  },
};
