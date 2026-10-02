import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./App.tsx";
import { LANGUAGE_STORAGE_KEY } from "./i18n/language.ts";

/** Friday 2/10/2026, 15:00 in Buenos Aires: the market is open. */
const SERVER_TIME = Date.UTC(2026, 9, 2, 18);

function quote(key: string, base: string, quote: string, price: string) {
  return {
    key,
    base,
    quote,
    price,
    source: "test",
    source_url: null,
    observed_at: new Date(SERVER_TIME - 4 * 60_000).toISOString(),
  };
}

const RATES = {
  server_time: new Date(SERVER_TIME).toISOString(),
  rates: [
    quote("mep", "USD", "ARS", "1540"),
    quote("binance_p2p_usdt_usd", "USDT", "USD", "1.03"),
    quote("bitso_usdt_ars", "USDT", "ARS", "1452.30"),
    quote("arq_usd_ars", "USD", "ARS", "1530"),
  ],
};

function browserIn(...languages: string[]) {
  Object.defineProperty(navigator, "languages", { configurable: true, get: () => languages });
}

const field = (name: RegExp) => screen.getByLabelText<HTMLInputElement>(name);
const picker = () => screen.getByRole("group", { name: /^(Idioma|Language)$/ });
const option = (name: RegExp) => within(picker()).getByRole("button", { name });
const plain = (text: string | null | undefined) => text?.replace(/\u00a0/g, " ") ?? null;

afterEach(() => {
  browserIn("es-AR");
  window.history.replaceState(null, "", "/");
});

describe("the page's language", () => {
  it("is Spanish by default, with a selector showing it", () => {
    render(<App />);
    expect(document.documentElement.lang).toBe("es");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("¿Cuánto cuesta?");
    expect(field(/^Monto en Payoneer/)).toBeInTheDocument();
    expect(option(/^ES, Español$/)).toHaveAttribute("aria-pressed", "true");
    expect(option(/^EN, English$/)).toHaveAttribute("aria-pressed", "false");
  });

  it("is English when the browser's first language is, without remembering it", () => {
    browserIn("en-US", "es");
    render(<App />);
    expect(document.documentElement.lang).toBe("en");
    expect(field(/^Amount in Payoneer/)).toBeInTheDocument();
    expect(picker()).toHaveAccessibleName("Language");
    expect(option(/^EN, English$/)).toHaveAttribute("aria-pressed", "true");
    // The name stays: it is the product's.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("¿Cuánto cuesta?");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
  });

  it("changes with the selector, keeping what was typed as the same number", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(field(/^Monto en Payoneer/), "1.452,30");
    await user.click(option(/^EN, English$/));
    expect(document.documentElement.lang).toBe("en");
    expect(field(/^Amount in Payoneer/).value).toBe("1,452.30");
    await user.click(option(/^ES, Español$/));
    expect(field(/^Monto en Payoneer/).value).toBe("1.452,30");
  });

  it("remembers the choice for the next visit, over the browser's language", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.type(field(/^Monto en Payoneer/), "1000");
    await user.click(option(/^EN, English$/));
    unmount();
    render(<App />);
    expect(option(/^EN, English$/)).toHaveAttribute("aria-pressed", "true");
    expect(field(/^Amount in Payoneer/).value).toBe("1000");
  });

  it("takes ?lang=en from the address, remembers it and takes it out", () => {
    window.history.replaceState(null, "", "/?lang=en&utm_source=landing");
    render(<App />);
    expect(field(/^Amount in Payoneer/)).toBeInTheDocument();
    expect(window.location.search).toBe("?utm_source=landing");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
  });

  it("ignores a language it does not have in the address", () => {
    window.history.replaceState(null, "", "/?lang=fr");
    render(<App />);
    expect(field(/^Monto en Payoneer/)).toBeInTheDocument();
    expect(window.location.search).toBe("");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
  });

  it("prefills prices as English writes them, and shows pesos as ARS", async () => {
    browserIn("en-US");
    const user = userEvent.setup();
    render(<App loadRates={() => Promise.resolve(RATES)} />);
    expect(await screen.findByDisplayValue("1,452.3")).toBeInTheDocument();
    expect(field(/^MEP dollar/).value).toBe("1,540");
    expect(field(/^Binance P2P price/).value).toBe("1.03");
    await user.type(field(/^Amount in Payoneer/), "1,000");
    const result = screen.getByRole("region", { name: "Result" });
    expect(plain(result.textContent)).toMatch(/ARS 1,\d{3},\d{3}\.\d{2}/);
    expect(plain(result.textContent)).not.toMatch(/\$ 1/);
  });

  it("converts prefilled prices too when the language changes", async () => {
    const user = userEvent.setup();
    render(<App loadRates={() => Promise.resolve(RATES)} />);
    await screen.findByDisplayValue("1.452,3");
    await user.click(option(/^EN, English$/));
    expect(field(/^Bitso sell price/).value).toBe("1,452.3");
    expect(field(/^MEP dollar/).value).toBe("1,540");
  });
});
