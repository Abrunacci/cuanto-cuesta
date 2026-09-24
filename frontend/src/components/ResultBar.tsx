import { useEffect, useRef, useState, type RefObject } from "react";

import type { BarText } from "../form/summary.ts";
import { RESULTS_TITLE_ID, routeResultId } from "./ids.ts";

interface ResultBarProps {
  readonly text: BarText;
  /** Take the person to the heading with this id: the whole result, or one route's result. */
  readonly onOpen: (headingId: string) => void;
}

/**
 * On a phone, the best route stays in view at the bottom while the person types; tapping it goes
 * to the full result, or straight to the best route's result when it has something to review.
 * While the keyboard is open the bar shrinks to one line. Hidden on wide screens, where the
 * result sits in its own column.
 */
export function ResultBar({ text, onOpen }: ResultBarProps) {
  const keyboard = useKeyboard();
  const bar = useRef<HTMLAnchorElement>(null);
  useReserveHeight(bar);
  const headingId =
    text.kind === "best" && text.review ? routeResultId(text.routeId) : RESULTS_TITLE_ID;
  const compact = keyboard.open;
  return (
    <aside aria-label="Resumen del resultado">
      <a
        ref={bar}
        className={compact ? "result-bar result-bar-compact" : "result-bar"}
        href={`#${headingId}`}
        aria-label={accessibleName(text)}
        style={{ bottom: `${String(keyboard.inset)}px` }}
        onClick={(event) => {
          event.preventDefault();
          onOpen(headingId);
        }}
      >
        {text.kind === "pending" && <span className="result-bar-label">{text.text}</span>}
        {text.kind === "best" && compact && (
          <span className="result-bar-line">
            <span className="result-bar-route">Mejor: {text.route}</span>
            <span className="result-bar-figure">
              &nbsp;· {text.amountWhole}
              {text.review && (
                <span className="result-bar-icon" aria-hidden="true">
                  {" "}
                  ⚠
                </span>
              )}
            </span>
          </span>
        )}
        {text.kind === "best" && !compact && (
          <>
            <span className="result-bar-label">Mejor ruta: {text.route}</span>
            <span className="result-bar-amount">
              Llegan {text.amount}
              {text.review && <span className="result-bar-review"> · revisá</span>}
            </span>
          </>
        )}
        {!compact && <span className="result-bar-more">Ver resultado</span>}
      </a>
    </aside>
  );
}

function accessibleName(text: BarText): string {
  if (text.kind === "pending") {
    return `${text.text} Ver resultado`;
  }
  const review = text.review ? " Tiene valores para revisar." : "";
  return `Mejor ruta: ${text.route}. Llegan ${text.amount}.${review} Ver resultado`;
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
 * shrinks it, so it is ignored.
 */
function useKeyboard(): Keyboard {
  const [keyboard, setKeyboard] = useState<Keyboard>({ inset: 0, open: false });
  useEffect(() => {
    // Missing in some environments (older browsers, jsdom) despite what the DOM types say.
    const viewport = "visualViewport" in window ? window.visualViewport : null;
    if (viewport === null) {
      return undefined;
    }
    let width = viewport.width;
    let tallest = viewport.height;
    const update = () => {
      if (viewport.width !== width) {
        // Rotated: heights from the other orientation say nothing about the keyboard.
        width = viewport.width;
        tallest = viewport.height;
      }
      const zoomed = viewport.scale > 1.01;
      if (!zoomed) {
        tallest = Math.max(tallest, viewport.height);
      }
      // clientHeight is the layout viewport in every engine; iOS overscroll can make offsetTop
      // negative for a moment, which must not move the bar.
      const layout = document.documentElement.clientHeight;
      const covered = layout - viewport.height - Math.max(0, viewport.offsetTop);
      setKeyboard({
        inset: zoomed ? 0 : Math.max(0, Math.round(covered)),
        open: !zoomed && tallest - viewport.height >= KEYBOARD_MIN_HEIGHT,
      });
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
