import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App.tsx";

/** Friday 2/10/2026, 15:00 in Buenos Aires: the market is open. */
const SERVER_TIME = Date.UTC(2026, 9, 2, 18);
const MINUTE = 60_000;

const iso = (instant: number) => new Date(instant).toISOString();

function quote(key: string, base: string, quote: string, price: string, minutesAgo: number) {
  return {
    key,
    base,
    quote,
    price,
    source: "test",
    source_url: null,
    observed_at: iso(SERVER_TIME - minutesAgo * MINUTE),
  };
}

function rates(minutesAgo: { crypto: number; mep: number; card: number }) {
  return {
    server_time: iso(SERVER_TIME),
    rates: [
      quote("mep", "USD", "ARS", "1540", minutesAgo.mep),
      quote("binance_p2p_usdt_usd", "USDT", "USD", "1.03", minutesAgo.crypto),
      quote("bitso_usdt_ars", "USDT", "ARS", "1452.30", minutesAgo.crypto),
      quote("arq_usd_ars", "USD", "ARS", "1530", 5),
      {
        ...quote("binance_card_usd_usdt", "USD", "USDT", "0.9850", minutesAgo.card),
        estimated_final: "0.9712",
      },
    ],
  };
}

const FRESH = { crypto: 4, mep: 6, card: 4 };
const STALE = { crypto: 130, mep: 6, card: 185 };

async function renderWith(body: unknown) {
  const user = userEvent.setup();
  render(<App loadRates={() => Promise.resolve(body)} />);
  // The prices arrive after the first render.
  await screen.findByDisplayValue("1.452,3");
  return user;
}

const field = (name: RegExp) => screen.getByLabelText<HTMLInputElement>(name);
/** Text with no-break spaces as plain spaces, to compare with what the person reads. */
const plain = (text: string | null | undefined) => text?.replace(/\u00a0/g, " ") ?? null;
const notice = (name: RegExp) =>
  plain(document.getElementById(`${field(name).id}-notice`)?.textContent);

const CARD = /^Binance con tarjeta \(USDT por USD\)/;
const P2P = /^Precio P2P en Binance/;
const BITSO = /^Precio de venta en Bitso/;

describe("prices from the backend", () => {
  it("prefill every price but the card's, and say so", async () => {
    await renderWith(rates(FRESH));
    expect(field(/^Dólar MEP/).value).toBe("1.540");
    expect(field(P2P).value).toBe("1,03");
    expect(field(BITSO).value).toBe("1.452,3");
    expect(field(/^Cotización de ARQ/).value).toBe("1.530");
    expect(field(CARD).value).toBe("");
    expect(
      screen.getByText(/Las cotizaciones vienen cargadas con el último precio que conseguimos/),
    ).toBeInTheDocument();
  });

  it("say nothing under a fresh price", async () => {
    await renderWith(rates(FRESH));
    for (const name of [/^Dólar MEP/, P2P, BITSO, /^Cotización de ARQ/]) {
      expect(notice(name)).toBeNull();
    }
  });

  it("warn under a stale price, with its age, until the person changes it", async () => {
    const user = await renderWith(rates(STALE));
    expect(notice(BITSO)).toBe(
      "Puede estar desactualizado: es de hace 2 h 10 min. Revisalo en Bitso antes de decidir.",
    );
    expect(field(BITSO)).toHaveAccessibleDescription(
      expect.stringContaining("Puede estar desactualizado") as string,
    );
    await user.clear(field(BITSO));
    await user.type(field(BITSO), "1460");
    expect(notice(BITSO)).toBeNull();
  });

  it("keep the current price when the latest reading jumped, and say so", async () => {
    const body = rates(FRESH);
    const held = { price: "1700", observed_at: iso(SERVER_TIME) };
    await renderWith({
      ...body,
      rates: body.rates.map((rate) => (rate.key === "bitso_usdt_ars" ? { ...rate, held } : rate)),
    });
    expect(field(BITSO).value).toBe("1.452,3");
    expect(notice(BITSO)).toBe(
      "La última lectura dio 1.700, muy distinta de este precio, y todavía no la usamos. Revisalo en Bitso antes de decidir.",
    );
    expect(field(BITSO)).toHaveAccessibleDescription(
      expect.stringContaining("La última lectura dio 1.700") as string,
    );
  });

  it("compare the card with its estimate while its field is empty, and mark it", async () => {
    const user = await renderWith(rates(STALE));
    expect(notice(CARD)).toBe(
      "Mientras no lo cargues, la comparación usa el estimado: 0,9712 USDT por USD, de hace 3 h 05 min.",
    );
    await user.type(field(/^Monto en Payoneer/), "1000");
    const results = screen.getByRole("region", { name: "Resultado" });
    const route = within(results)
      .getByRole("heading", { name: "Binance con tarjeta + Bitso" })
      .closest("li");
    if (route === null) {
      throw new Error("the card route is not in the ranking");
    }
    expect(within(route).getByText("Precio estimado")).toBeInTheDocument();
    expect(plain(route.textContent)).toContain(
      "Calculado con el precio estimado de la tarjeta (0,9712 USDT por USD, de hace 3 h 05 min: puede estar desactualizado). Cargá el de tu pantalla de pago de Binance para el valor exacto.",
    );
    expect(route.textContent).toContain("Llegan al banco");

    await user.type(field(CARD), "0,95");
    expect(notice(CARD)).toBeNull();
    expect(within(route).queryByText("Precio estimado")).toBeNull();
  });

  it("say in the summary and the bar when the best route uses the card's estimate", async () => {
    const body = rates(FRESH);
    // Bitso at 1.700 puts the card route ahead of every other.
    for (const item of body.rates) {
      if (item.key === "bitso_usdt_ars") {
        item.price = "1700";
      }
    }
    const user = userEvent.setup();
    render(<App loadRates={() => Promise.resolve(body)} />);
    await screen.findByDisplayValue("1.700");
    await user.type(field(/^Monto en Payoneer/), "1000");
    const results = screen.getByRole("region", { name: "Resultado" });
    expect(plain(within(results).getByText(/^Mejor ruta:/).textContent)).toMatch(
      /^Mejor ruta: Binance con tarjeta \+ Bitso, con precio estimado, llegan /,
    );
    const bar = within(screen.getByRole("complementary", { name: "Resumen del resultado" }));
    expect(plain(bar.getByRole("link").textContent)).toContain(
      "Mejor ruta: Binance con tarjeta + Bitso · precio estimado",
    );
    expect(bar.getByRole("link")).toHaveAccessibleName(
      expect.stringContaining("Binance con tarjeta + Bitso · precio estimado.") as string,
    );

    await user.type(field(CARD), "0,9712");
    expect(plain(within(results).getByText(/^Mejor ruta:/).textContent)).not.toContain("estimado");
    expect(bar.getByRole("link").textContent).not.toContain("estimado");
  });

  it("never replace what the person typed before they arrived", async () => {
    const user = userEvent.setup();
    let arrive: (body: unknown) => void = () => undefined;
    render(
      <App
        loadRates={() =>
          new Promise((resolve) => {
            arrive = resolve;
          })
        }
      />,
    );
    await user.type(field(BITSO), "1500");
    arrive(rates(STALE));
    await screen.findByDisplayValue("1,03");
    expect(field(BITSO).value).toBe("1500");
    expect(notice(BITSO)).toBeNull();
  });

  it("leave the form as it was when the backend does not answer", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<App loadRates={() => Promise.reject(new Error("offline"))} />);
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalled();
    });
    expect(field(BITSO).value).toBe("");
    expect(notice(CARD)).toBeNull();
    expect(
      screen.getByText(/El monto queda guardado en este navegador; las cotizaciones no\./),
    ).toBeInTheDocument();
    warn.mockRestore();
  });

  it("leave the form as it was while the backend has no prices yet", async () => {
    const user = userEvent.setup();
    let answered = false;
    render(
      <App
        loadRates={() => {
          answered = true;
          return Promise.resolve({ server_time: iso(SERVER_TIME), rates: [] });
        }}
      />,
    );
    await vi.waitFor(() => {
      expect(answered).toBe(true);
    });
    for (const name of [/^Dólar MEP/, P2P, BITSO, /^Cotización de ARQ/, CARD]) {
      expect(field(name).value).toBe("");
      expect(notice(name)).toBeNull();
    }
    expect(
      screen.getByText(/El monto queda guardado en este navegador; las cotizaciones no\./),
    ).toBeInTheDocument();

    await user.type(field(/^Monto en Payoneer/), "1000");
    await user.type(field(/^Dólar MEP/), "1540");
    const results = screen.getByRole("region", { name: "Resultado" });
    expect(within(results).queryByText("Precio estimado")).toBeNull();
    expect(
      within(results).getByText(/^Por ahora solo se puede calcular Dólar MEP: llegan/),
    ).toBeInTheDocument();
  });
});

describe("the MEP after the close", () => {
  it("says which close it is and when the market opens", async () => {
    // Friday 2/10/2026 at 19:00 in Buenos Aires; the MEP was read at 16:58.
    const now = Date.UTC(2026, 9, 2, 22);
    const body = rates(FRESH);
    body.server_time = iso(now);
    for (const item of body.rates) {
      item.observed_at = iso(item.key === "mep" ? Date.UTC(2026, 9, 2, 19, 58) : now);
    }
    await renderWith(body);
    expect(notice(/^Dólar MEP/)).toBe(
      "Cierre de hoy a las 16:58. El mercado abre el lunes a las 10:45.",
    );
  });
});
