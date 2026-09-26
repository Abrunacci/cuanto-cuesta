/**
 * What the form remembers between visits: the amount and the fees the person set. Prices are not
 * kept: a price from another day misleads, so they start empty on every visit.
 *
 * The stored text carries a format version. Texts are restored as typed and then read like
 * anything typed, so a wrong one shows its problem; what does not fit the format (another
 * version, a fee that no longer exists, a value that is not text or is longer than a field
 * allows) is dropped.
 */

import { feeDefault } from "../calculator/index.ts";
import { initialTexts, MAX_FIELD_LENGTH, type FormTexts } from "./form.ts";

export const STORAGE_KEY = "cuanto-cuesta:form";
export const FORMAT_VERSION = 1;

interface Stored {
  readonly version: typeof FORMAT_VERSION;
  readonly amount: string;
  /** Only the fees the person set, by fee id. */
  readonly fees: Readonly<Record<string, string>>;
  /** The minimums of those fees, when they have one. */
  readonly minimums: Readonly<Record<string, string>>;
}

/** The text to store, or null when there is nothing worth remembering. */
export function toStored(texts: FormTexts): string | null {
  if (texts.amount === "" && texts.ownFees.size === 0) {
    return null;
  }
  const fees: Record<string, string> = {};
  const minimums: Record<string, string> = {};
  for (const id of texts.ownFees) {
    fees[id] = texts.fees[id] ?? "";
    const minimum = texts.minimums[id];
    if (minimum !== undefined) {
      minimums[id] = minimum;
    }
  }
  const stored: Stored = { version: FORMAT_VERSION, amount: texts.amount, fees, minimums };
  return JSON.stringify(stored);
}

/** The form as it was left, from the stored text; the starting form when it cannot be used. */
export function fromStored(text: string | null): FormTexts {
  const start = initialTexts();
  const stored = parse(text);
  if (stored === null) {
    return start;
  }
  const fees = { ...start.fees };
  const minimums = { ...start.minimums };
  const ownFees = new Set<string>();
  for (const [id, value] of Object.entries(stored.fees)) {
    const known = feeDefault(id);
    if (known === undefined || !isFieldText(value)) {
      continue;
    }
    fees[id] = value;
    ownFees.add(id);
    const minimum = stored.minimums[id];
    if (id in start.minimums && isFieldText(minimum)) {
      minimums[id] = minimum;
    }
  }
  return {
    ...start,
    amount: isFieldText(stored.amount) ? stored.amount : "",
    fees,
    minimums,
    ownFees,
  };
}

function parse(text: string | null): Stored | null {
  if (text === null) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    !isRecord(value) ||
    value.version !== FORMAT_VERSION ||
    typeof value.amount !== "string" ||
    !isRecord(value.fees) ||
    !isRecord(value.minimums)
  ) {
    return null;
  }
  return {
    version: FORMAT_VERSION,
    amount: value.amount,
    fees: textsOf(value.fees),
    minimums: textsOf(value.minimums),
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textsOf(record: Readonly<Record<string, unknown>>): Record<string, string> {
  const texts: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") {
      texts[key] = value;
    }
  }
  return texts;
}

function isFieldText(value: string | undefined): value is string {
  return value !== undefined && value.length <= MAX_FIELD_LENGTH;
}

/**
 * The form as remembered, or a first visit's. Reading `localStorage` itself throws when the
 * person blocked site data, so the whole read is guarded.
 */
export function loadTexts(): FormTexts {
  try {
    return fromStored(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return initialTexts();
  }
}

/**
 * Remember the form; if the browser refuses (blocked site data, full storage, a private mode that
 * refuses writes), the page keeps working without remembering.
 */
export function saveTexts(texts: FormTexts): void {
  const text = toStored(texts);
  try {
    if (text === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, text);
    }
  } catch {
    // Nothing to do: the form still works, it is just not remembered.
  }
}
