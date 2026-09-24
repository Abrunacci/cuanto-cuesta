import { FEE_DEFAULTS, RATE_FIELDS, type Route, type Step } from "../calculator/index.ts";
import { fieldId, type FormReading, type FormTexts } from "../form/form.ts";
import { lowerFirst } from "../text/case.ts";
import { NumberField } from "./NumberField.tsx";
import { statusText } from "../form/messages.ts";
import { Provenance, StatusBadge } from "./Provenance.tsx";
import { RichText } from "./RichText.tsx";

interface RouteCardProps {
  readonly route: Route;
  readonly open: boolean;
  readonly onToggle: (open: boolean) => void;
  readonly texts: FormTexts;
  readonly reading: FormReading;
  readonly onFee: (id: string, text: string) => void;
  readonly onMinimum: (id: string, text: string) => void;
}

/** One route's fees, step by step, in a card that stays closed until the person opens it. */
export function RouteCard({
  route,
  open,
  onToggle,
  texts,
  reading,
  onFee,
  onMinimum,
}: RouteCardProps) {
  return (
    <details
      className="card route-card"
      open={open}
      onToggle={(event) => {
        onToggle(event.currentTarget.open);
      }}
    >
      <summary>
        <span className="route-card-title">{route.name}</span>
        <span className="route-card-hint">Ajustar comisiones</span>
      </summary>
      {route.steps.map((step) => (
        <fieldset key={step.label} className="step">
          <legend className={repeatsItsFee(step) ? "visually-hidden" : undefined}>
            {step.label}
          </legend>
          {step.conversion !== null && (
            <p className="muted small">
              Convierte con: {rateLabel(step.conversion.rateKey)}, que cargaste arriba.
            </p>
          )}
          {step.feeIds.map((id) => (
            <FeeInputs
              key={id}
              id={id}
              texts={texts}
              reading={reading}
              onFee={onFee}
              onMinimum={onMinimum}
            />
          ))}
        </fieldset>
      ))}
    </details>
  );
}

/**
 * A step whose only content is one fee named like the step ("Retirar de Payoneer a…" and
 * "Retiro de Payoneer a…"): its title would repeat the fee's, so it is only kept for screen
 * readers.
 */
function repeatsItsFee(step: Step): boolean {
  const [id] = step.feeIds;
  if (step.conversion !== null || step.feeIds.length !== 1 || id === undefined) {
    return false;
  }
  const label = FEE_DEFAULTS.find((d) => d.fee.id === id)?.label;
  return label !== undefined && withoutFirstWord(label) === withoutFirstWord(step.label);
}

function withoutFirstWord(text: string): string {
  return text.toLowerCase().split(" ").slice(1).join(" ");
}

function rateLabel(key: string): string {
  return lowerFirst(RATE_FIELDS.find((field) => field.key === key)?.label ?? key);
}

function FeeInputs({
  id,
  texts,
  reading,
  onFee,
  onMinimum,
}: {
  readonly id: string;
  readonly texts: FormTexts;
  readonly reading: FormReading;
  readonly onFee: RouteCardProps["onFee"];
  readonly onMinimum: RouteCardProps["onMinimum"];
}) {
  const feeDefault = FEE_DEFAULTS.find((d) => d.fee.id === id);
  if (feeDefault === undefined) {
    return null;
  }
  const { fee, label, note, provenance } = feeDefault;
  const valueId = fieldId.fee(id);
  const minimumId = fieldId.minimum(id);
  return (
    <div className="fee">
      <NumberField
        id={valueId}
        label={label}
        unit={fee.kind === "percent" ? "%" : fee.amount.currency}
        value={texts.fees[id] ?? ""}
        onChange={(text) => {
          onFee(id, text);
        }}
        problem={reading.problems.get(valueId) ?? null}
        echo={reading.echoes.get(valueId)}
      >
        <details className="fee-details">
          <summary aria-label={`${statusText(provenance)}. Detalles de ${label}`}>
            <StatusBadge provenance={provenance} /> Detalles
          </summary>
          <Provenance provenance={provenance} feeLabel={label} />
          {note !== null && (
            <p className="note">
              <RichText text={note} />
            </p>
          )}
        </details>
      </NumberField>
      {fee.kind === "percent" && fee.minimum !== null && (
        <NumberField
          id={minimumId}
          label={`${label}: mínimo`}
          unit={fee.minimum.currency}
          value={texts.minimums[id] ?? ""}
          onChange={(text) => {
            onMinimum(id, text);
          }}
          problem={reading.problems.get(minimumId) ?? null}
          echo={reading.echoes.get(minimumId)}
          help="Se cobra este mínimo cuando el porcentaje da menos. Si no te lo cobran, poné 0."
        />
      )}
    </div>
  );
}
