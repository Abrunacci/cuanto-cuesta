import { describe, expect, it } from "vitest";

import { FEE_DEFAULTS, RATE_FIELDS, ROUTES } from "../calculator/index.ts";
import { en } from "./en.ts";
import { es } from "./es.ts";
import { stepRepeatsItsFee, type Texts } from "./index.ts";
import { browserLanguage, initialLanguage } from "./language.ts";

const LANGUAGES: readonly [string, Texts][] = [
  ["Spanish", es],
  ["English", en],
];

const sorted = (ids: Iterable<string>) => [...new Set(ids)].sort();
const STEP_IDS = sorted(ROUTES.flatMap((route) => route.steps.map((step) => step.id)));
const ROUTE_IDS = sorted(ROUTES.map((route) => route.id));
const RATE_KEYS = sorted(RATE_FIELDS.map((field) => field.key));
const FEE_IDS = sorted(FEE_DEFAULTS.map(({ fee }) => fee.id));

describe.each(LANGUAGES)("the %s texts", (_, t) => {
  it("name every route, step, price and fee, and nothing else", () => {
    expect(sorted(Object.keys(t.routes))).toEqual(ROUTE_IDS);
    expect(sorted(Object.keys(t.steps))).toEqual(STEP_IDS);
    expect(sorted(Object.keys(t.rates))).toEqual(RATE_KEYS);
    expect(sorted(Object.keys(t.fees))).toEqual(FEE_IDS);
  });

  it("give every price a short label and a unit", () => {
    const blank = Object.entries(t.rates).filter(
      ([, rate]) => rate.shortLabel.trim() === "" || rate.unit.trim() === "",
    );
    expect(blank).toEqual([]);
  });

  it("say each risk's mark in its label, since the phone's bar reads out the label", () => {
    for (const risk of Object.values(t.risks)) {
      expect(risk.label.toLowerCase().split(" ")).toContain(risk.mark.toLowerCase());
    }
  });

  it("warn on the P2P route that paying with Payoneer can get the Binance account blocked", () => {
    expect(t.routes.binance_p2p_bitso?.warnings).toHaveLength(1);
    expect(t.routes.binance_p2p_bitso?.warnings[0]).toMatch(/Payoneer.*Binance/);
  });

  it("warn on the MEP route with a link to the BCRA rules", () => {
    const [warning] = t.routes.mep?.warnings ?? [];
    expect(warning).toMatch(
      /^\[[^\]]+\]\(https:\/\/www\.bcra\.gob\.ar\/Pdfs\/comytexord\/A8481\.pdf\)/,
    );
  });

  it("keep the proper names as they are", () => {
    const names = Object.values(t.routes).map((route) => route.name);
    for (const name of ["Binance", "Bitso", "ARQ", "MEP"]) {
      expect(names.some((routeName) => routeName.includes(name))).toBe(true);
    }
  });
});

describe("the two languages", () => {
  it("hide the same step titles, those that only repeat their fee's", () => {
    const hidden = (t: Texts) =>
      ROUTES.flatMap((route) =>
        route.steps.filter((step) => stepRepeatsItsFee(t, step, step.feeIds)).map((s) => s.id),
      );
    expect(hidden(es)).not.toEqual([]);
    expect(hidden(en)).toEqual(hidden(es));
  });

  it("keep the Spanish warnings as researched", () => {
    expect(es.routes.binance_p2p_bitso?.warnings).toEqual([
      "Pagar P2P con Payoneer puede hacer que Binance bloquee tu cuenta. El precio P2P es el de la oferta genérica USDT/USD.",
    ]);
    expect(es.routes.mep?.warnings).toEqual([
      "[Verificá las restricciones sobre el dólar MEP](https://www.bcra.gob.ar/Pdfs/comytexord/A8481.pdf)",
    ]);
    expect(es.risks.account_block).toEqual({
      label: "Riesgo de bloqueo",
      mark: "riesgo",
      detail: "con riesgo de bloqueo de tu cuenta de Binance",
    });
  });

  it("write the same amount each in its own way, pesos as ARS in English", () => {
    const amount = es.numbers.parse("1.452,30");
    if (amount.kind !== "number") {
      throw new Error("not a number");
    }
    expect(es.numbers.money(amount.value, "ARS")).toBe("$\u00a01.452,30");
    expect(en.numbers.money(amount.value, "ARS")).toBe("ARS\u00a01,452.30");
  });
});

describe("the starting language", () => {
  it.each([
    [["en-US", "es"], "en"],
    [["EN"], "en"],
    [["es-AR", "en"], "es"],
    [["pt-BR", "en"], "es"],
    [[], "es"],
  ])("is English only when the browser's first language is (%j)", (preferred, expected) => {
    expect(browserLanguage(preferred)).toBe(expected);
  });

  it("is the address's, then the one chosen before, then the browser's", () => {
    expect(initialLanguage("en", "es", ["es"])).toBe("en");
    expect(initialLanguage(null, "en", ["es"])).toBe("en");
    expect(initialLanguage(null, "es", ["en"])).toBe("es");
    expect(initialLanguage(null, null, ["en"])).toBe("en");
  });

  it("ignores values that are not a language", () => {
    expect(initialLanguage("fr", "de", ["en"])).toBe("en");
    expect(initialLanguage("", "", ["es"])).toBe("es");
  });
});
