import type { ReactNode } from "react";

interface NumberFieldProps {
  readonly id: string;
  readonly label: string;
  /** Shown after the input, and read after the label by screen readers. */
  readonly unit: string;
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly problem: string | null;
  readonly help?: ReactNode;
  readonly placeholder?: string;
}

export function NumberField({
  id,
  label,
  unit,
  value,
  onChange,
  problem,
  help,
  placeholder,
}: NumberFieldProps) {
  const problemId = `${id}-problem`;
  const helpId = `${id}-help`;
  const describedBy = [problem !== null ? problemId : null, help !== undefined ? helpId : null]
    .filter((part) => part !== null)
    .join(" ");
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        <span className="visually-hidden"> ({unit})</span>
      </label>
      <div className="field-input">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          aria-invalid={problem !== null}
          aria-describedby={describedBy === "" ? undefined : describedBy}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
        <span className="unit" aria-hidden="true">
          {unit}
        </span>
      </div>
      {problem !== null && (
        <p id={problemId} className="field-problem">
          {problem}
        </p>
      )}
      {help !== undefined && (
        <div id={helpId} className="field-help">
          {help}
        </div>
      )}
    </div>
  );
}
