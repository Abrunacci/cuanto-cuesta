/**
 * Whether a prefilled price can be trusted as it is. Ages are measured on the backend's clock and
 * the MEP's market hours in Argentine time, never in the person's time zone.
 *
 * Assumption, until data-pipeline confirms it with its source: the MEP trades Monday to Friday,
 * 11:00 to 17:00 in Buenos Aires, with no holiday calendar.
 */

export const MARKET_TIME_ZONE = "America/Argentina/Buenos_Aires";
const MARKET_OPEN_HOUR = 11;
const MARKET_CLOSE_HOUR = 17;

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
  const { weekday, hour } = marketTime(now);
  return isWeekday(weekday) && hour >= MARKET_OPEN_HOUR && hour < MARKET_CLOSE_HOUR;
}

/**
 * The instant at `hour`:00 in Buenos Aires, `daysAhead` calendar days from the day of `instant`
 * there (negative goes back).
 */
function atMarketHour(instant: number, daysAhead: number, hour: number): number {
  const { year, month, day } = marketTime(instant);
  const guess = Date.UTC(year, month - 1, day + daysAhead, hour);
  // Shift the guess (read as UTC) by the zone's offset at that moment.
  const seen = marketTime(guess);
  const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
  return guess - (seenAsUtc - guess);
}

/** The close of the last session that ended at or before `now`. */
function lastClose(now: number): number {
  for (let back = 0; back <= 7; back += 1) {
    const close = atMarketHour(now, -back, MARKET_CLOSE_HOUR);
    if (close <= now && isWeekday(marketTime(close).weekday)) {
      return close;
    }
  }
  return now;
}

/** The opening of the next session after `now`. */
function nextOpen(now: number): number {
  for (let ahead = 0; ahead <= 7; ahead += 1) {
    const open = atMarketHour(now, ahead, MARKET_OPEN_HOUR);
    if (open > now && isWeekday(marketTime(open).weekday)) {
      return open;
    }
  }
  return now;
}

/** No-break space: "3 h" and "05 min" never split across lines. */
const NBSP = "\u00a0";

/**
 * "45 min", "2 h 10 min", "3 h 05 min", "3 h"; from a day on, "1 día", "2 días". Each number
 * stays on the same line as its unit.
 */
export function ageText(age: number): string {
  return ageWords(age).replace(/(\d) /g, `$1${NBSP}`);
}

function ageWords(age: number): string {
  if (age >= DAY) {
    const days = Math.floor(age / DAY);
    return days === 1 ? "1 día" : `${String(days)} días`;
  }
  const minutes = Math.floor(age / MINUTE);
  if (minutes < 60) {
    return `${String(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? `${String(hours)} h`
    : `${String(hours)} h ${String(rest).padStart(2, "0")} min`;
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/**
 * "Cierre del viernes 2/10 a las 17:00. El mercado abre el lunes a las 11.": the time is when the
 * price was read, in Buenos Aires; "de hoy", "mañana" and "hoy" are counted there too.
 */
export function closedText(observedAt: number, opens: number, now: number): string {
  const read = marketTime(observedAt);
  const today = marketTime(now);
  const open = marketTime(opens);
  const time = `${String(read.hour).padStart(2, "0")}:${String(read.minute).padStart(2, "0")}`;
  const day = sameDay(read, today)
    ? "de hoy"
    : `del ${weekdayName(read)} ${String(read.day)}/${String(read.month)}`;
  return `Cierre ${day} a las ${time}. El mercado abre ${openDay(open, today)} a las ${String(MARKET_OPEN_HOUR)}.`;
}

function openDay(open: MarketTime, today: MarketTime): string {
  if (sameDay(open, today)) {
    return "hoy";
  }
  const days = Math.round(
    (Date.UTC(open.year, open.month - 1, open.day) -
      Date.UTC(today.year, today.month - 1, today.day)) /
      DAY,
  );
  return days === 1 ? "mañana" : `el ${weekdayName(open)}`;
}

function weekdayName({ weekday }: MarketTime): string {
  return WEEKDAYS[weekday] ?? "";
}

function sameDay(a: MarketTime, b: MarketTime): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}
