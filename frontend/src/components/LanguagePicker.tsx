import { useTexts } from "../i18n/index.ts";
import { LANGUAGE_NAMES, LANGUAGES, type Language } from "../i18n/language.ts";

interface LanguagePickerProps {
  readonly language: Language;
  readonly onChange: (language: Language) => void;
}

/**
 * "ES | EN": two buttons, the page's language pressed. Each is read out by the language's own
 * name ("Español", "English"), which the person recognizes whatever the page is in, and starts
 * with what is seen, so voice control can use it.
 */
export function LanguagePicker({ language, onChange }: LanguagePickerProps) {
  const t = useTexts();
  return (
    <div className="language-picker" role="group" aria-label={t.page.languageGroup}>
      {LANGUAGES.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          aria-pressed={option === language}
          aria-label={`${option.toUpperCase()}, ${LANGUAGE_NAMES[option]}`}
          onClick={() => {
            onChange(option);
          }}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
