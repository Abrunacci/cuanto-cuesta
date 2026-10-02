import { useRef } from "react";

import { feeDefault, type Route } from "../calculator/index.ts";
import { byCard, cardOf, ownFieldCount } from "../form/cards.ts";
import { fieldId, type FormReading, type FormTexts } from "../form/form.ts";
import { feeStatusText, referenceValueText } from "../form/messages.ts";
import {
  feeInSentence,
  feeTexts,
  rateInSentence,
  routeName,
  stepLabel,
  stepRepeatsItsFee,
  useTexts,
} from "../i18n/index.ts";
import { NumberField } from "./NumberField.tsx";
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
  const t = useTexts();
  return (
    <details
      className="card route-card"
      open={open}
      onToggle={(event) => {
        onToggle(event.currentTarget.open);
      }}
    >
      <summary>
        <span className="route-card-title">{routeName(t, route)}</span>
        <span className="route-card-hint">
          {t.cards.adjust}
          {t.cards.ownCount(ownFieldCount(route, reading.ownFees))}
        </span>
      </summary>
      {route.steps.map((step) => {
        const here = step.feeIds.filter((id) => cardOf(id)?.id === route.id);
        const elsewhere = step.feeIds.filter((id) => cardOf(id)?.id !== route.id);
        return (
          <fieldset key={step.id} className="step">
            <legend className={stepRepeatsItsFee(t, step, here) ? "visually-hidden" : undefined}>
              {stepLabel(t, step.id)}
            </legend>
            {step.conversion !== null && (
              <p className="muted small">
                {t.cards.convertsWith(rateInSentence(t, step.conversion.rateKey))}
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
  const t = useTexts();
  return byCard(feeIds).map(({ card, feeIds: ids }) => {
    const [first] = ids;
    const id = fieldId.fee(first);
    const labels = ids.map((fee) => feeInSentence(t, fee));
    const name = routeName(t, card);
    return (
      <p key={card.id} className="muted small">
        {t.cards.setElsewhere(ids.length)}
        <InPageAnchor
          link={{
            key: id,
            href: `#${id}`,
            text: name,
            // Several steps link to the same card: the name says which fees each one is for.
            label: `${name}: ${t.list(labels)}`,
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
  const t = useTexts();
  const valueInput = useRef<HTMLInputElement>(null);
  const found = feeDefault(id);
  if (found === undefined) {
    return null;
  }
  const { fee, provenance } = found;
  const { label, note } = feeTexts(t, id);
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
          <summary aria-label={t.cards.detailsLabel(feeStatusText(t, provenance, own), label)}>
            <StatusBadge provenance={provenance} own={own} /> {t.cards.details}
          </summary>
          {own && (
            <p className="provenance">
              {t.cards.ownValue(referenceValueText(t, fee))}{" "}
              {/* A button: it changes the form. Focus goes to the field, which now holds the
                  reference value, since this button disappears with the mark. */}
              <button
                type="button"
                className="link-button"
                aria-label={t.cards.backToReferenceLabel(label)}
                onClick={() => {
                  onResetFee(id);
                  valueInput.current?.focus();
                }}
              >
                {t.cards.backToReference}
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
          label={t.cards.minimumLabel(label)}
          unit={fee.minimum.currency}
          value={texts.minimums[id] ?? ""}
          onChange={(text) => {
            onMinimum(id, text);
          }}
          problem={reading.problems.get(minimumId) ?? null}
          echo={reading.echoes.get(minimumId)}
          help={t.cards.minimumHelp}
        />
      )}
    </div>
  );
}
