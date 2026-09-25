import { useState } from "react";
import { flushSync } from "react-dom";

import { ROUTES } from "./calculator/index.ts";
import { Inputs } from "./components/Inputs.tsx";
import { ResetFees } from "./components/ResetFees.tsx";
import { ResultBar } from "./components/ResultBar.tsx";
import { Results } from "./components/Results.tsx";
import { RouteCard } from "./components/RouteCard.tsx";
import { RESULTS_TITLE_ID, reviewTargetId, routeReviewId } from "./components/ids.ts";
import { reviewOpensList } from "./form/review.ts";
import { fieldId } from "./form/form.ts";
import { barText, hasAmountProblem } from "./form/summary.ts";
import { useForm } from "./form/useForm.ts";

export function App() {
  const form = useForm();
  const { texts, reading } = form;
  const [openRoutes, setOpenRoutes] = useState<ReadonlySet<string>>(new Set());
  const [openReviews, setOpenReviews] = useState<ReadonlySet<string>>(new Set());
  const amountHasProblem = hasAmountProblem(reading);
  const bar = barText(reading, amountHasProblem);
  const barRoute =
    bar.kind === "best" && bar.review ? ROUTES.find((r) => r.id === bar.routeId) : undefined;
  const barTarget =
    barRoute !== undefined
      ? reviewTargetId(barRoute.id, reviewOpensList(barRoute, reading.ownFees))
      : RESULTS_TITLE_ID;

  const setRouteOpen = (routeId: string, open: boolean) => {
    setOpenRoutes((current) => withMember(current, routeId, open));
  };
  const setReviewOpen = (routeId: string, open: boolean) => {
    setOpenReviews((current) => withMember(current, routeId, open));
  };

  /**
   * Open the route's card if the field is inside it, or its review list in the result if that is
   * the target, then focus the field; or focus any other element with that id, such as a
   * route's result heading.
   */
  const goToField = (routeId: string, id: string) => {
    const inCard = ROUTES.find((r) => r.id === routeId)?.steps.some((step) =>
      step.feeIds.some((fee) => id === fieldId.fee(fee) || id === fieldId.minimum(fee)),
    );
    if (inCard === true) {
      flushSync(() => {
        setRouteOpen(routeId, true);
      });
    }
    if (id === routeReviewId(routeId)) {
      flushSync(() => {
        setReviewOpen(routeId, true);
      });
    }
    // Focusing also scrolls the field into view.
    document.getElementById(id)?.focus();
  };

  return (
    <>
      <main className="page layout">
        <header className="layout-header">
          <h1>¿Cuánto cuesta?</h1>
          <p className="lead">
            Compará cuántos pesos te llegan al banco al bajar tus dólares de Payoneer.
          </p>
        </header>

        <div className="layout-inputs">
          <Inputs
            texts={texts}
            reading={reading}
            onAmount={form.setAmount}
            onPrice={form.setPrice}
          />
        </div>

        <div className="layout-results">
          <Results
            comparison={reading.comparison}
            feeGaps={reading.feeGaps}
            amountHasProblem={amountHasProblem}
            warnings={reading.warnings}
            ownFees={reading.ownFees}
            openReviews={openReviews}
            onReviewToggle={setReviewOpen}
            onGoToField={goToField}
          />
        </div>

        <section className="layout-fees" aria-labelledby="fees-title">
          <h2 id="fees-title" className="section-title">
            Comisiones de cada ruta
          </h2>
          <p className="muted small">
            Vienen cargadas con los valores investigados. Abrí una ruta para ajustarlas: lo que
            pongas queda guardado en este navegador.
          </p>
          <ResetFees ownCount={texts.ownFees.size} onReset={form.resetFees} />
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
              onResetFee={form.resetFee}
            />
          ))}
        </section>
      </main>

      <ResultBar
        text={bar}
        targetId={barTarget}
        onOpen={(id) => {
          if (barRoute === undefined) {
            document.getElementById(id)?.focus();
          } else {
            goToField(barRoute.id, id);
          }
        }}
      />
    </>
  );
}

/** `set` with `member` in it or not, as `present` says; the same set when nothing changes. */
function withMember(
  set: ReadonlySet<string>,
  member: string,
  present: boolean,
): ReadonlySet<string> {
  if (set.has(member) === present) {
    return set;
  }
  const next = new Set(set);
  if (present) {
    next.add(member);
  } else {
    next.delete(member);
  }
  return next;
}
