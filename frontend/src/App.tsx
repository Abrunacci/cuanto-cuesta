import { useState } from "react";
import { flushSync } from "react-dom";

import { REFERENCE_KEY, ROUTES } from "./calculator/index.ts";
import { Inputs } from "./components/Inputs.tsx";
import { Results } from "./components/Results.tsx";
import { RouteCard } from "./components/RouteCard.tsx";
import { fieldId } from "./form/form.ts";
import { useForm } from "./form/useForm.ts";

export function App() {
  const form = useForm();
  const { texts, reading } = form;
  const [openRoutes, setOpenRoutes] = useState<ReadonlySet<string>>(new Set());

  const setRouteOpen = (routeId: string, open: boolean) => {
    setOpenRoutes((current) => {
      if (current.has(routeId) === open) {
        return current;
      }
      const next = new Set(current);
      if (open) {
        next.add(routeId);
      } else {
        next.delete(routeId);
      }
      return next;
    });
  };

  /** Open the route's card if the field is inside it, then focus the field. */
  const goToField = (routeId: string, id: string) => {
    const inCard = ROUTES.find((r) => r.id === routeId)?.steps.some((step) =>
      step.feeIds.some((fee) => id === fieldId.fee(fee) || id === fieldId.minimum(fee)),
    );
    if (inCard === true) {
      flushSync(() => {
        setRouteOpen(routeId, true);
      });
    }
    // Focusing also scrolls the field into view.
    document.getElementById(id)?.focus();
  };

  return (
    <main className="page">
      <header>
        <h1>¿Cuánto cuesta?</h1>
        <p className="lead">
          Compará cuántos pesos te llegan al banco al bajar tus dólares de Payoneer.
        </p>
      </header>

      <Inputs texts={texts} reading={reading} onAmount={form.setAmount} onPrice={form.setPrice} />

      <Results
        comparison={reading.comparison}
        feeGaps={reading.feeGaps}
        referenceProblems={[
          ...(reading.problems.has(fieldId.amount) ? ["el monto"] : []),
          ...(reading.problems.has(fieldId.price(REFERENCE_KEY)) ? ["el dólar MEP"] : []),
        ]}
        warnings={reading.warnings}
        onGoToField={goToField}
      />

      <section aria-labelledby="fees-title">
        <h2 id="fees-title" className="section-title">
          Comisiones de cada ruta
        </h2>
        <p className="muted small">
          Vienen cargadas con los valores investigados. Abrí una ruta para ajustarlas.
        </p>
        {ROUTES.map((route) => (
          <RouteCard
            key={route.id}
            route={route}
            open={openRoutes.has(route.id)}
            onToggle={(open) => {
              setRouteOpen(route.id, open);
            }}
            texts={texts}
            reading={reading}
            onFee={form.setFee}
            onMinimum={form.setMinimum}
          />
        ))}
      </section>
    </main>
  );
}
