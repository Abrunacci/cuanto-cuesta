import { useEffect, useRef, useState } from "react";

interface ResetFeesProps {
  /** How many fees hold the person's own value. */
  readonly ownCount: number;
  readonly onReset: () => void;
}

type Step = "idle" | "confirm" | "done";

/**
 * "Restablecer valores de referencia", asked twice: the person's values are lost for good. Shown
 * only while some fee is theirs. Focus follows each step, so a keyboard or screen reader user
 * lands on the question, back on the button after cancelling, and on the result after resetting.
 */
export function ResetFees({ ownCount, onReset }: ResetFeesProps) {
  const [step, setStep] = useState<Step>("idle");
  // Only after the person acts: nothing takes the focus when the page loads.
  const moveFocus = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const question = useRef<HTMLParagraphElement>(null);
  const done = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!moveFocus.current) {
      return;
    }
    moveFocus.current = false;
    const target = { idle: button, confirm: question, done }[step];
    target.current?.focus();
  }, [step]);

  const go = (next: Step) => {
    moveFocus.current = true;
    setStep(next);
  };

  if (ownCount === 0) {
    return step === "done" ? (
      <p ref={done} className="muted small" role="status" tabIndex={-1}>
        Listo: las comisiones volvieron a los valores de referencia.
      </p>
    ) : null;
  }
  if (step === "confirm") {
    const fees =
      ownCount === 1
        ? "la comisión con tu valor"
        : `las ${String(ownCount)} comisiones con tu valor`;
    return (
      <div className="reset-confirm" role="group" aria-labelledby="reset-question">
        <p id="reset-question" ref={question} tabIndex={-1}>
          ¿Volver {fees} a los valores de referencia? Lo que pusiste se borra.
        </p>
        <div className="reset-actions">
          <button
            type="button"
            className="button button-danger"
            onClick={() => {
              onReset();
              go("done");
            }}
          >
            Sí, restablecer
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              go("idle");
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }
  return (
    <button
      ref={button}
      type="button"
      className="button"
      onClick={() => {
        go("confirm");
      }}
    >
      Restablecer valores de referencia
    </button>
  );
}
