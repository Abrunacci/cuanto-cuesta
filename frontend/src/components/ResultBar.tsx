import { useEffect, useState } from "react";

import type { BarText } from "../form/summary.ts";

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
  return (
    <a
      className="result-bar"
      href="#results-title"
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
      setInset(Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop));
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
