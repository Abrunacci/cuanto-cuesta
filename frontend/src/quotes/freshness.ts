/**
 * Whether a prefilled price can be trusted as it is. Ages are measured on the backend's clock and
 * the MEP's market hours in Argentine time, never in the person's time zone.
 *
 * The MEP trades Monday to Friday, 10:45 to 17:00 in Buenos Aires, with no holiday calendar:
 * data-pipeline saw it move only in that window over two months of readings, and its last move
 * of the day lands between 16:48 and 17:01, inside the 30 minutes before the close that count as
 * the close.
 */

export const MARKET_TIME_ZONE = "America/Argentina/Buenos_Aires";

/** A time of day in Buenos Aires. */
interface TimeOfDay {
  readonly hour: number;
  readonly minute: number;
}

const MARKET_OPEN: TimeOfDay = { hour: 10, minute: 45 };
const MARKET_CLOSE: TimeOfDay = { hour: 17, minute: 0 };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A price younger than this is fresh. */
export const FRESH_FOR = 30 * MINUTE;

export const MEP_KEY = "mep";

export type Freshness =
  | { readonly kind: "fresh" }
  /** The MEP outside market hours, read at the last session's close: valid until it opens. */
  | { readonly kind: "closed"; readonly observedAt: number; readonly opens: number }
  | { readonly kind: "stale"; readonly age: number };

export function freshness(key: string, observedAt: number, now: number): Freshness {
  const age = Math.max(0, now - observedAt);
  if (key !== MEP_KEY || inSession(now)) {
    return age < FRESH_FOR ? { kind: "fresh" } : { kind: "stale", age };
  }
  // Outside market hours the last value of the session is still the price: it counts when it
  // was read near the close (or after it), as the last session's value.
  const close = lastClose(now);
  return observedAt >= close - FRESH_FOR
    ? { kind: "closed", observedAt, opens: nextOpen(now) }
    : { kind: "stale", age };
}

/** A calendar day and time as read in Buenos Aires. */
export interface MarketTime {
  readonly year: number;
  /** 1 to 12. */
  readonly month: number;
  readonly day: number;
  /** 0 is Sunday. */
  readonly weekday: number;
  readonly hour: number;
  readonly minute: number;
}

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: MARKET_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

export function marketTime(instant: number): MarketTime {
  const parts: Record<string, number> = {};
  for (const part of PARTS.formatToParts(instant)) {
    if (part.type !== "literal") {
      parts[part.type] = Number(part.value);
    }
  }
  const year = parts.year ?? 0;
  const month = parts.month ?? 1;
  const day = parts.day ?? 1;
  return {
    year,
    month,
    day,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
  };
}

function isWeekday(weekday: number): boolean {
  return weekday >= 1 && weekday <= 5;
}

function inSession(now: number): boolean {
  const time = marketTime(now);
  const minutes = minutesOf(time);
  return (
    isWeekday(time.weekday) &&
    minutes >= minutesOf(MARKET_OPEN) &&
    minutes < minutesOf(MARKET_CLOSE)
  );
}

function minutesOf({ hour, minute }: TimeOfDay): number {
  return hour * 60 + minute;
}

/**
 * The instant at `time` in Buenos Aires, `daysAhead` calendar days from the day of `instant`
 * there (negative goes back).
 */
function atMarketTime(instant: number, daysAhead: number, time: TimeOfDay): number {
  const { year, month, day } = marketTime(instant);
  const guess = Date.UTC(year, month - 1, day + daysAhead, time.hour, time.minute);
  // Shift the guess (read as UTC) by the zone's offset at that moment.
  const seen = marketTime(guess);
  const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
  return guess - (seenAsUtc - guess);
}

/** The close of the last session that ended at or before `now`. */
function lastClose(now: number): number {
  for (let back = 0; back <= 7; back += 1) {
    const close = atMarketTime(now, -back, MARKET_CLOSE);
    if (close <= now && isWeekday(marketTime(close).weekday)) {
      return close;
    }
  }
  return now;
}

/** The opening of the next session after `now`. */
function nextOpen(now: number): number {
  for (let ahead = 0; ahead <= 7; ahead += 1) {
    const open = atMarketTime(now, ahead, MARKET_OPEN);
    if (open > now && isWeekday(marketTime(open).weekday)) {
      return open;
    }
  }
  return now;
}

/** An age as it is written: in days from one day on, else in hours and minutes. */
export type AgeParts =
  | { readonly kind: "days"; readonly days: number }
  | { readonly kind: "time"; readonly hours: number; readonly minutes: number };

export function ageParts(age: number): AgeParts {
  if (age >= DAY) {
    return { kind: "days", days: Math.floor(age / DAY) };
  }
  const minutes = Math.floor(age / MINUTE);
  return { kind: "time", hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

/** What the screen says about the MEP outside market hours, with every day counted in Buenos Aires. */
export interface ClosedNote {
  /** When the price was read: the last close. */
  readonly read: MarketTime;
  readonly readToday: boolean;
  /** When the market opens next. */
  readonly opens: MarketTime;
  readonly opensOn: "today" | "tomorrow" | "later";
}

export function closedNote(observedAt: number, opens: number, now: number): ClosedNote {
  const read = marketTime(observedAt);
  const today = marketTime(now);
  const open = marketTime(opens);
  return {
    read,
    readToday: sameDay(read, today),
    opens: open,
    opensOn: sameDay(open, today) ? "today" : daysBetween(today, open) === 1 ? "tomorrow" : "later",
  };
}

function daysBetween(from: MarketTime, to: MarketTime): number {
  return Math.round(
    (Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / DAY,
  );
}

function sameDay(a: MarketTime, b: MarketTime): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}
