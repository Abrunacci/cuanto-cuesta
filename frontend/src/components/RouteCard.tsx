import { useRef } from "react";

import { feeDefault, feeLabel, rateField, type Route, type Step } from "../calculator/index.ts";
import { byCard, cardOf, ownFieldsIn } from "../form/cards.ts";
import { fieldId, type FormReading, type FormTexts } from "../form/form.ts";
import { lowerFirst } from "../text/case.ts";
import { joinSpanish } from "../text/lists.ts";
import { NumberField } from "./NumberField.tsx";
import { feeStatusText, referenceValueText } from "../form/messages.ts";
import { InPageAnchor } from "./LinkList.tsx";
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
  readonly onResetFee: (id: string) => void;
  /** Open the card that holds a field and focus it. */
  readonly onGoToField: (routeId: string, id: string) => void;
}

/**
 * One route's fees, step by step, in a card that stays closed until the person opens it. A fee
 * another route's card already holds (a shared leg) is not repeated: its step links there.
 */
export function RouteCard({
  route,
  open,
  onToggle,
  texts,
  reading,
  onFee,
  onMinimum,
  onResetFee,
  onGoToField,
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
        <span className="route-card-hint">
          Ajustar comisiones{ownCountText(route, reading.ownFees)}
        </span>
      </summary>
      {route.steps.map((step) => {
        const here = step.feeIds.filter((id) => cardOf(id)?.id === route.id);
        const elsewhere = step.feeIds.filter((id) => cardOf(id)?.id !== route.id);
        return (
          <fieldset key={step.label} className="step">
            <legend className={repeatsItsFee(step, here) ? "visually-hidden" : undefined}>
              {step.label}
            </legend>
            {step.conversion !== null && (
              <p className="muted small">
                Convierte con: {rateLabel(step.conversion.rateKey)}, que cargaste arriba.
              </p>
            )}
            {here.map((id) => (
              <FeeInputs
                key={id}
                id={id}
                texts={texts}
                reading={reading}
                onFee={onFee}
                onMinimum={onMinimum}
                onResetFee={onResetFee}
              />
            ))}
            <SetElsewhere feeIds={elsewhere} onGoToField={onGoToField} />
          </fieldset>
        );
      })}
    </details>
  );
}

/**
 * "Estas comisiones se ajustan en <route>": the step's fees whose fields other routes' cards
 * hold, one line per card, with a link that opens that card at its first one.
 */
function SetElsewhere({
  feeIds,
  onGoToField,
}: {
  readonly feeIds: readonly string[];
  readonly onGoToField: RouteCardProps["onGoToField"];
}) {
  return byCard(feeIds).map(({ card, feeIds: ids }) => {
    const [first] = ids;
    const id = fieldId.fee(first);
    const labels = ids.map((fee) => lowerFirst(feeLabel(fee)));
    return (
      <p key={card.id} className="muted small">
        {ids.length === 1 ? "Esta comisión se ajusta en " : "Estas comisiones se ajustan en "}
        <InPageAnchor
          link={{
            key: id,
            href: `#${id}`,
            text: card.name,
            // Several steps link to the same card: the name says which fees each one is for.
            label: `${card.name}: ${joinSpanish(labels)}`,
            onClick: () => {
              onGoToField(card.id, id);
            },
          }}
        />
        .
      </p>
    );
  });
}

/**
 * A step whose only content is one fee field named like the step ("Retirar de Payoneer a…" and
 * "Retiro de Payoneer a…"): its title would repeat the fee's, so it is only kept for screen
 * readers. `here` are the step's fees whose fields this card holds.
 */
function repeatsItsFee(step: Step, here: readonly string[]): boolean {
  const [id] = here;
  if (
    step.conversion !== null ||
    step.feeIds.length !== 1 ||
    here.length !== 1 ||
    id === undefined
  ) {
    return false;
  }
  const label = feeDefault(id)?.label;
  return label !== undefined && withoutFirstWord(label) === withoutFirstWord(step.label);
}

/**
 * " · 2 con tu valor", or nothing while the card holds only researched values. Only the fields in
 * this card count: a shared fee counts in the card that holds it.
 */
function ownCountText(route: Route, ownFees: ReadonlySet<string>): string {
  const count = ownFieldsIn(route, ownFees);
  return count === 0 ? "" : ` · ${String(count)} con tu valor`;
}

function withoutFirstWord(text: string): string {
  return text.toLowerCase().split(" ").slice(1).join(" ");
}

function rateLabel(key: string): string {
  return lowerFirst(rateField(key)?.label ?? key);
}

function FeeInputs({
  id,
  texts,
  reading,
  onFee,
  onMinimum,
  onResetFee,
}: {
  readonly id: string;
  readonly texts: FormTexts;
  readonly reading: FormReading;
  readonly onFee: RouteCardProps["onFee"];
  readonly onMinimum: RouteCardProps["onMinimum"];
  readonly onResetFee: RouteCardProps["onResetFee"];
}) {
  const valueInput = useRef<HTMLInputElement>(null);
  const found = feeDefault(id);
  if (found === undefined) {
    return null;
  }
  const { fee, label, note, provenance } = found;
  const valueId = fieldId.fee(id);
  const own = reading.ownFees.has(id);
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
        inputRef={valueInput}
      >
        <details className="fee-details">
          <summary aria-label={`${feeStatusText(provenance, own)}. Detalles de ${label}`}>
            <StatusBadge provenance={provenance} own={own} /> Detalles
          </summary>
          {own && (
            <p className="provenance">
              Pusiste tu valor. El de referencia es {referenceValueText(fee)}.{" "}
              {/* A button: it changes the form. Focus goes to the field, which now holds the
                  reference value, since this button disappears with the mark. */}
              <button
                type="button"
                className="link-button"
                aria-label={`Volver al valor de referencia: ${label}`}
                onClick={() => {
                  onResetFee(id);
                  valueInput.current?.focus();
                }}
              >
                Volver al valor de referencia
              </button>
            </p>
          )}
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
