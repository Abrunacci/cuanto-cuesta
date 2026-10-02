/**
 * Which language the page is in. Spanish unless the person asks for English: with the selector
 * (remembered in this browser), with `?lang=en` in the address (a link from an English page,
 * remembered too), or, before any of that, with English as their browser's first language.
 */

export const LANGUAGES = ["es", "en"] as const;

export type Language = (typeof LANGUAGES)[number];

/** Each language by its own name, as the selector reads it out whatever the page's language. */
export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = {
  es: "Español",
  en: "English",
};

export const LANGUAGE_STORAGE_KEY = "cuanto-cuesta:language";

/** The address parameter that picks a language: `?lang=en`. */
export const LANGUAGE_PARAMETER = "lang";

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((language) => language === value);
}

/** English when the browser's first language is English ("en", "en-US"); else Spanish. */
export function browserLanguage(preferred: readonly string[]): Language {
  const [first = ""] = preferred;
  return first.toLowerCase().split("-")[0] === "en" ? "en" : "es";
}

/**
 * The language to start in: the address's, then the one chosen before, then the browser's.
 * A value that is not a language is ignored.
 */
export function initialLanguage(
  fromAddress: string | null,
  stored: string | null,
  preferred: readonly string[],
): Language {
  if (isLanguage(fromAddress)) {
    return fromAddress;
  }
  if (isLanguage(stored)) {
    return stored;
  }
  return browserLanguage(preferred);
}
