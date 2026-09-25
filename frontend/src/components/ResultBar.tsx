import { useEffect, useRef, useState, type RefObject } from "react";

import type { RouteRisk } from "../calculator/index.ts";
import type { BarLead, BarText } from "../form/summary.ts";

interface ResultBarProps {
  readonly text: BarText;
  /** Where the bar takes the person: the whole result, or what to review in the route it shows. */
  readonly targetId: string;
  readonly onOpen: (targetId: string) => void;
}

/**
 * On a phone, the best route stays in view at the bottom while the person types (or, when only
 * risky routes can be computed, the one that delivers most, marked as risky); tapping it goes to
 * the full result, or straight to what that route has to review when it has something.
 * While the keyboard is open the bar shrinks to one line. Hidden on wide screens, where the
 * result sits in its own column.
 */
export function ResultBar({ text, targetId, onOpen }: ResultBarProps) {
  const keyboard = useKeyboard();
  const bar = useRef<HTMLAnchorElement>(null);
  useReserveHeight(bar);
  const compact = keyboard.open;
  return (
    <aside aria-label="Resumen del resultado">
      {/* No aria-label: the name is the visible text plus hidden punctuation and words, so what a
          person sees ("revisá") is also what voice control can say. Spaces between words go in
          text nodes between elements, which the layout ignores and the name keeps. */}
      <a
        ref={bar}
        className={compact ? "result-bar result-bar-compact" : "result-bar"}
        href={`#${targetId}`}
        style={{ bottom: `${String(keyboard.inset)}px` }}
        onClick={(event) => {
          event.preventDefault();
          onOpen(targetId);
        }}
      >
        {compact ? <CompactLine text={text} /> : <FullText text={text} />}{" "}
        <span className={compact ? "visually-hidden" : "result-bar-more"}>Ver resultado</span>
      </a>
    </aside>
  );
}

const REVIEW_DETAIL = "los valores de esta ruta.";

/** How the bar introduces the route it names, in full and in the one-line bar. */
const LEADS: Readonly<Record<BarLead, { full: string; short: string }>> = {
  best: { full: "Mejor ruta", short: "Mejor" },
  tied: { full: "Empatan", short: "Empate" },
  alone: { full: "Única ruta calculada", short: "Única" },
  risky: { full: "Solo con riesgo", short: "Solo con riesgo" },
};

/**
 * After the route's name when it is risky: seen as "· riesgo", heard as the route's own label
 * ("Riesgo de bloqueo"), which holds the word seen. In the one-line bar it sits outside the name,
 * which a narrow phone cuts, so it is never cut with it.
 */
function RiskMark({
  risk,
  compact,
}: {
  readonly risk: RouteRisk | null;
  readonly compact: boolean;
}) {
  if (risk === null) {
    return null;
  }
  // The space before it is a text node, which the one-line bar's layout ignores and the name
  // keeps; there the gap on screen is the no-break space.
  return (
    <>
      {" "}
      <span className="result-bar-risk">
        <span aria-hidden="true">{compact ? "\u00a0" : ""}· riesgo</span>
        <span className="visually-hidden">· {risk.label}</span>
      </span>
    </>
  );
}

function FullText({ text }: { readonly text: BarText }) {
  if (text.kind === "pending") {
    return <span className="result-bar-label">{text.text}</span>;
  }
  return (
    <>
      <span className="result-bar-label">
        {LEADS[text.lead].full}: {text.route}
        <RiskMark risk={text.risk} compact={false} />
        <span className="visually-hidden">.</span>
      </span>{" "}
      <span className="result-bar-amount">
        Llegan {text.amount}
        {text.review ? (
          <>
            {" "}
            <span className="result-bar-review">
              · revisá <span className="visually-hidden">{REVIEW_DETAIL}</span>
            </span>
          </>
        ) : (
          <span className="visually-hidden">.</span>
        )}
      </span>
    </>
  );
}

/** One line: on a narrow phone the start is cut, never the amount or its alert. */
function CompactLine({ text }: { readonly text: BarText }) {
  if (text.kind === "pending") {
    return (
      <span className="result-bar-line">
        <span className="result-bar-route">{text.short}</span>
        <span className="visually-hidden">.</span>
      </span>
    );
  }
  return (
    <span className="result-bar-line">
      <span className="result-bar-route">
        {LEADS[text.lead].short}: {text.route}
      </span>
      <RiskMark risk={text.risk} compact />{" "}
      <span className="result-bar-figure">
        &nbsp;· {text.amountWhole}
        {text.review ? (
          <>
            {/* The text presentation selector keeps iOS from drawing it as a color emoji. */}
            <span className="result-bar-icon" aria-hidden="true">
              {" "}
              {"\u26a0\ufe0e"}
            </span>
            <span className="visually-hidden">, revisá {REVIEW_DETAIL}</span>
          </>
        ) : (
          <span className="visually-hidden">.</span>
        )}
      </span>
    </span>
  );
}

/** How much a visual viewport has to shrink below its tallest to count as a keyboard. */
const KEYBOARD_MIN_HEIGHT = 150;

interface Keyboard {
  /** How far the keyboard covers the bottom of the layout viewport; 0 where the page resizes. */
  readonly inset: number;
  readonly open: boolean;
}

/**
 * The on-screen keyboard, from the visual viewport. Browsers that resize the page for the
 * keyboard (see `interactive-widget` in index.html) shrink both viewports; others, like Safari on
 * iOS, only shrink the visual one, and the bar has to move up by the difference. Either way the
 * visual viewport ends up well below the tallest it has been at this width. Pinch zoom also
 * shrinks it, so it is ignored, and so is the inset: while zoomed, a fixed bar is out of view
 * anyway. Making only the window shorter (a split screen, a short desktop window) also counts as
 * a keyboard; the bar then shows one line, which loses nothing.
 */
function useKeyboard(): Keyboard {
  const [keyboard, setKeyboard] = useState<Keyboard>({ inset: 0, open: false });
  useEffect(() => {
    // Missing in some environments (older browsers, jsdom) despite what the DOM types say.
    const viewport = "visualViewport" in window ? window.visualViewport : null;
    if (viewport === null) {
      return undefined;
    }
    const root = document.documentElement;
    // The layout width: pinch zoom changes the visual viewport's width, but not this one.
    let width = root.clientWidth;
    let tallest = viewport.height;
    const update = () => {
      if (root.clientWidth !== width) {
        // Rotated (or, on a desktop, a scrollbar came or went): heights from before say nothing
        // about the keyboard.
        width = root.clientWidth;
        tallest = viewport.height;
      }
      const zoomed = viewport.scale > 1.01;
      if (!zoomed) {
        tallest = Math.max(tallest, viewport.height);
      }
      // clientHeight is the layout viewport in every engine; iOS overscroll can make offsetTop
      // negative for a moment, which must not move the bar.
      const covered = root.clientHeight - viewport.height - Math.max(0, viewport.offsetTop);
      const inset = zoomed ? 0 : Math.max(0, Math.round(covered));
      const open = !zoomed && tallest - viewport.height >= KEYBOARD_MIN_HEIGHT;
      // Scrolling fires this every frame on iOS: render only when something changed.
      setKeyboard((current) =>
        current.inset === inset && current.open === open ? current : { inset, open },
      );
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return keyboard;
}

/**
 * Keep `--bar-height` equal to the bar's real height: its text can wrap to several lines (a long
 * message, a narrow phone, a larger system font), and the page reserves that much room so a
 * focused field is never left under the bar.
 */
function useReserveHeight(bar: RefObject<HTMLAnchorElement | null>): void {
  useEffect(() => {
    const element = bar.current;
    if (element === null || !("ResizeObserver" in window)) {
      return undefined;
    }
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      root.style.setProperty("--bar-height", `${String(element.offsetHeight)}px`);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--bar-height");
    };
  }, [bar]);
}
