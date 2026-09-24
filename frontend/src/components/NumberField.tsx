import { useState, type ReactNode } from "react";

interface NumberFieldProps {
  readonly id: string;
  readonly label: string;
  /** Shown after the input, and read after the label by screen readers. */
  readonly unit: string;
  readonly value: string;
  readonly onChange: (text: string) => void;
  /** Why the value cannot be used. */
  readonly problem: string | null;
  /** The value is used but looks wrong, e.g. a price far outside its usual range. */
  readonly warning?: string | undefined;
  /** How an ambiguous value was read, e.g. "Leímos 1.030,00 ARS por USD." */
  readonly echo?: string | undefined;
  /** Short help, part of the field's description. */
  readonly help?: string | undefined;
  /** More about the field, outside its description (e.g. a collapsible "Detalles"). */
  readonly children?: ReactNode;
  readonly placeholder?: string;
}

export function NumberField({
  id,
  label,
  unit,
  value,
  onChange,
  problem,
  warning,
  echo,
  help,
  children,
  placeholder,
}: NumberFieldProps) {
  // Show the field's own problem or warning once the person leaves it, so typing "1540" does
  // not flag the field at "1"; after that it updates as they fix it. The results summary
  // reflects the current text at every keystroke.
  const [touched, setTouched] = useState(false);
  const shownProblem = touched ? problem : null;
  const shownWarning = touched && problem === null ? (warning ?? null) : null;
  const ids = {
    problem: `${id}-problem`,
    warning: `${id}-warning`,
    echo: `${id}-echo`,
    help: `${id}-help`,
  };
  const describedBy = [
    shownProblem !== null ? ids.problem : null,
    shownWarning !== null ? ids.warning : null,
    echo !== undefined ? ids.echo : null,
    help !== undefined ? ids.help : null,
  ]
    .filter((part) => part !== null)
    .join(" ");
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} <span className="visually-hidden">({unit})</span>
      </label>
      <div className="field-input">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          aria-invalid={shownProblem !== null}
          aria-describedby={describedBy === "" ? undefined : describedBy}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onBlur={() => {
            setTouched(true);
          }}
        />
        <span className="unit" aria-hidden="true">
          {unit}
        </span>
      </div>
      {/* Always rendered, so screen readers announce what appears on leaving the field. */}
      <p id={ids.problem} className="field-problem" aria-live="polite">
        {shownProblem}
      </p>
      <p id={ids.warning} className="field-warning" aria-live="polite">
        {shownWarning}
      </p>
      {echo !== undefined && (
        <p id={ids.echo} className="field-echo">
          {echo}
        </p>
      )}
      {help !== undefined && (
        <p id={ids.help} className="field-help">
          {help}
        </p>
      )}
      {children}
    </div>
  );
}
