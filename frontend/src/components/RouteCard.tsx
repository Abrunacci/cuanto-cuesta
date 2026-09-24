import {
  FEE_DEFAULTS,
  RATE_FIELDS,
  REFERENCE_KEY,
  type Route,
  type RouteComparison,
} from "../calculator/index.ts";
import { fieldId, type FormReading, type FormTexts } from "../form/form.ts";
import { NumberField } from "./NumberField.tsx";
import { Provenance } from "./Provenance.tsx";
import { RichText } from "./RichText.tsx";
import { RouteFigures } from "./RouteFigures.tsx";

interface RouteCardProps {
  readonly route: Route;
  readonly entry: RouteComparison;
  readonly texts: FormTexts;
  readonly reading: FormReading;
  readonly onPrice: (key: string, text: string) => void;
  readonly onFee: (id: string, text: string) => void;
  readonly onMinimum: (id: string, text: string) => void;
}

/** One route, step by step: the price each conversion uses and every fee, all editable. */
export function RouteCard({
  route,
  entry,
  texts,
  reading,
  onPrice,
  onFee,
  onMinimum,
}: RouteCardProps) {
  const titleId = `route-${route.id}`;
  return (
    <section className="card" aria-labelledby={titleId}>
      <h2 id={titleId}>{route.name}</h2>
      <RouteFigures entry={entry} feeGaps={reading.feeGaps} />
      {route.warnings.map((warning) => (
        <p key={warning} className="warning">
          <strong>Atención:</strong> <RichText text={warning} />
        </p>
      ))}
      {route.steps.map((step) => (
        <fieldset key={step.label} className="step">
          <legend>{step.label}</legend>
          {step.conversion !== null && (
            <RateInput
              rateKey={step.conversion.rateKey}
              texts={texts}
              reading={reading}
              onPrice={onPrice}
            />
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
    </section>
  );
}

function RateInput({
  rateKey,
  texts,
  reading,
  onPrice,
}: {
  readonly rateKey: string;
  readonly texts: FormTexts;
  readonly reading: FormReading;
  readonly onPrice: RouteCardProps["onPrice"];
}) {
  if (rateKey === REFERENCE_KEY) {
    return <p className="muted">Usa el dólar MEP (compra) que cargaste arriba.</p>;
  }
  const field = RATE_FIELDS.find((f) => f.key === rateKey);
  if (field === undefined) {
    return null;
  }
  const id = fieldId.price(rateKey);
  return (
    <NumberField
      id={id}
      label={field.label}
      unit={field.quote}
      value={texts.prices[rateKey] ?? ""}
      onChange={(text) => {
        onPrice(rateKey, text);
      }}
      problem={reading.problems.get(id) ?? null}
      echo={reading.echoes.get(id)}
      help="La cotización del momento en que operás."
    />
  );
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
  const help = (
    <>
      <Provenance provenance={provenance} feeLabel={label} />
      {note !== null && (
        <p className="note">
          <RichText text={note} />
        </p>
      )}
    </>
  );
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
        help={help}
      />
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
          help="Se cobra este mínimo cuando el porcentaje da menos. Si no te lo cobran, poné 0."
        />
      )}
    </div>
  );
}
