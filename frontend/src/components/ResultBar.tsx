import { useEffect, useRef, useState, type RefObject } from "react";

import type { BarText } from "../form/summary.ts";
import { RESULTS_TITLE_ID } from "./Results.tsx";

interface ResultBarProps {
  readonly text: BarText;
  /** Take the person to the full result. */
  readonly onOpen: () => void;
}

/**
 * On a phone, the best route stays in view at the bottom while the person types; tapping it goes
 * to the full result. Hidden on wide screens, where the result sits in its own column.
 */
export function ResultBar({ text, onOpen }: ResultBarProps) {
  const keyboardInset = useKeyboardInset();
  const bar = useRef<HTMLAnchorElement>(null);
  useReserveHeight(bar);
  const label =
    text.kind === "best"
      ? `Mejor ruta: ${text.route}. Llegan ${text.amount}. Ver resultado`
      : `${text.text} Ver resultado`;
  return (
    <aside aria-label="Resumen del resultado">
      <a
        ref={bar}
        className="result-bar"
        href={`#${RESULTS_TITLE_ID}`}
        aria-label={label}
        style={{ bottom: `${String(keyboardInset)}px` }}
        onClick={(event) => {
          event.preventDefault();
          onOpen();
        }}
      >
        {text.kind === "best" ? (
          <>
            <span className="result-bar-label">Mejor ruta: {text.route}</span>
            <span className="result-bar-amount">Llegan {text.amount}</span>
          </>
        ) : (
          <span className="result-bar-label">{text.text}</span>
        )}
        <span className="result-bar-more">Ver resultado</span>
      </a>
    </aside>
  );
}

/**
 * How far the on-screen keyboard covers the bottom of the layout viewport. Browsers that resize
 * the page for the keyboard (see `interactive-widget` in index.html) report 0; others, like
 * Safari on iOS, only shrink the visual viewport, and the bar has to move up by the difference.
 */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    // Missing in some environments (older browsers, jsdom) despite what the DOM types say.
    const viewport = "visualViewport" in window ? window.visualViewport : null;
    if (viewport === null) {
      return undefined;
    }
    const update = () => {
      // clientHeight is the layout viewport in every engine; iOS overscroll can make offsetTop
      // negative for a moment, which must not move the bar.
      const layout = document.documentElement.clientHeight;
      const covered = layout - viewport.height - Math.max(0, viewport.offsetTop);
      setInset(Math.max(0, Math.round(covered)));
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
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
