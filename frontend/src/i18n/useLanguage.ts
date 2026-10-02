import { useCallback, useEffect, useState } from "react";

import {
  initialLanguage,
  isLanguage,
  LANGUAGE_PARAMETER,
  LANGUAGE_STORAGE_KEY,
  type Language,
} from "./language.ts";

/**
 * The page's language, and how to change it. It starts as `initialLanguage` says. A choice with
 * the selector is remembered; so is a `?lang=` in the address, which is then taken out of it, so a
 * reload does not undo what the person picks next. The browser's language is not remembered: it
 * is read again on the next visit, in case the person changed it.
 */
export function useLanguage(): readonly [Language, (language: Language) => void] {
  const [language, setLanguage] = useState<Language>(startingLanguage);

  useEffect(() => {
    const url = new URL(window.location.href);
    const fromAddress = url.searchParams.get(LANGUAGE_PARAMETER);
    if (fromAddress === null) {
      return;
    }
    if (isLanguage(fromAddress)) {
      remember(fromAddress);
    }
    url.searchParams.delete(LANGUAGE_PARAMETER);
    window.history.replaceState(window.history.state, "", url);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const choose = useCallback((chosen: Language) => {
    remember(chosen);
    setLanguage(chosen);
  }, []);

  return [language, choose] as const;
}

function startingLanguage(): Language {
  const fromAddress = new URLSearchParams(window.location.search).get(LANGUAGE_PARAMETER);
  return initialLanguage(fromAddress, stored(), navigator.languages);
}

/** The language chosen before, if the browser lets the page read it. */
function stored(): string | null {
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** If the browser refuses (blocked site data), the page keeps working without remembering. */
function remember(language: Language): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Nothing to do: the next visit starts from the browser's language again.
  }
}
