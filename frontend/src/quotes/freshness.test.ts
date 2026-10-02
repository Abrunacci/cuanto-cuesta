import { describe, expect, it } from "vitest";

import { ageText, closedText, freshness } from "./freshness.ts";

/** An instant given in Buenos Aires time (UTC-3). 2026-10-02 is a Friday. */
const art = (day: number, hour: number, minute = 0) => Date.UTC(2026, 9, day, hour + 3, minute);
const MINUTE = 60_000;

describe("freshness", () => {
  it("keeps a crypto price fresh for 30 minutes, at any hour", () => {
    const now = art(3, 22);
    expect(freshness("bitso_usdt_ars", now - 29 * MINUTE, now)).toEqual({ kind: "fresh" });
    expect(freshness("bitso_usdt_ars", now - 30 * MINUTE, now)).toEqual({
      kind: "stale",
      age: 30 * MINUTE,
    });
  });

  it("does the same for the MEP during market hours", () => {
    const now = art(2, 15);
    expect(freshness("mep", now - 10 * MINUTE, now)).toEqual({ kind: "fresh" });
    expect(freshness("mep", art(1, 17), now).kind).toBe("stale");
  });

  it("takes the MEP read at the close as valid until the market opens", () => {
    const observed = art(2, 16, 58);
    for (const now of [art(2, 17), art(2, 23), art(3, 12), art(5, 10, 59)]) {
      expect(freshness("mep", observed, now)).toEqual({
        kind: "closed",
        observedAt: observed,
        opens: art(5, 11),
      });
    }
  });

  it("measures the close in Buenos Aires, whatever the time zone of the screen", () => {
    // 20:00 UTC is 17:00 in Buenos Aires: closed, though it is still 16:00 in New York.
    expect(freshness("mep", art(2, 16, 50), Date.UTC(2026, 9, 2, 20)).kind).toBe("closed");
  });

  it("warns about an MEP from before the last close", () => {
    const now = art(5, 9);
    expect(freshness("mep", art(2, 16, 29), now)).toEqual({
      kind: "stale",
      age: now - art(2, 16, 29),
    });
    expect(freshness("mep", art(2, 16, 30), now).kind).toBe("closed");
  });

  it("before Monday's opening, the last close is Friday's", () => {
    expect(freshness("mep", art(2, 17), art(4, 20)).kind).toBe("closed");
    expect(freshness("mep", art(1, 17), art(4, 20)).kind).toBe("stale");
  });
});

describe("ageText", () => {
  it.each([
    [45 * MINUTE, "45 min"],
    [60 * MINUTE, "1 h"],
    [130 * MINUTE, "2 h 10 min"],
    [185 * MINUTE, "3 h 05 min"],
    [24 * 60 * MINUTE - 1, "23 h 59 min"],
    [24 * 60 * MINUTE, "1 día"],
    [50 * 60 * MINUTE, "2 días"],
  ])("%d ms reads %s", (age, text) => {
    expect(ageText(age).replace(/\u00a0/g, " ")).toBe(text);
  });
});

describe("closedText", () => {
  it("says the day and time of the reading, and when the market opens", () => {
    expect(closedText(art(2, 17), art(5, 11), art(3, 10))).toBe(
      "Cierre del viernes 2/10 a las 17:00. El mercado abre el lunes a las 11.",
    );
  });

  it("takes the time from the reading, not from a fixed close", () => {
    expect(closedText(art(2, 16, 52), art(5, 11), art(2, 18))).toBe(
      "Cierre de hoy a las 16:52. El mercado abre el lunes a las 11.",
    );
  });

  it("says tomorrow and today in Buenos Aires", () => {
    expect(closedText(art(1, 17), art(2, 11), art(1, 22))).toBe(
      "Cierre de hoy a las 17:00. El mercado abre mañana a las 11.",
    );
    // 01:00 UTC on the 2nd is still the 1st in Buenos Aires.
    expect(closedText(art(1, 17), art(2, 11), Date.UTC(2026, 9, 2, 1))).toBe(
      "Cierre de hoy a las 17:00. El mercado abre mañana a las 11.",
    );
    expect(closedText(art(1, 17), art(2, 11), art(2, 8))).toBe(
      "Cierre del jueves 1/10 a las 17:00. El mercado abre hoy a las 11.",
    );
  });
});
