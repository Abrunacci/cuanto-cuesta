import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { App } from "./App.tsx";

function setup() {
  const user = userEvent.setup();
  render(<App />);
  const field = (name: RegExp) => screen.getByLabelText(name);
  const type = async (name: RegExp, text: string) => {
    await user.clear(field(name));
    await user.type(field(name), text);
  };
  const ranking = () => {
    const results = screen.getByRole("region", { name: "Resultado" });
    return within(results)
      .getAllByRole("listitem")
      .map((item) => item.textContent);
  };
  return { user, field, type, ranking };
}

async function fillEverything(type: (name: RegExp, text: string) => Promise<void>) {
  await type(/^Monto en Payoneer/, "1.000");
  await type(/^Dólar MEP \(compra\)/, "1.536,16");
  await type(/^Precio P2P en Binance/, "1,03");
  await type(/^Precio de venta en Bitso/, "1.596,21");
  await type(/^Cotización de ARQ/, "1.593,385");
}

const description = (text: string) => expect.stringContaining(text) as string;

describe("the calculator page", () => {
  it("shows the page title", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "¿Cuánto cuesta?" })).toBeInTheDocument();
  });

  it("starts with the fees at their researched values and the prices empty", () => {
    const { field } = setup();
    expect(field(/^Comisión taker del libro de órdenes de Bitso/)).toHaveValue("0,6");
    expect(field(/^Recepción de ACH en ARQ/)).toHaveValue("3");
    expect(field(/^Dólar MEP \(compra\)/)).toHaveValue("");
    expect(field(/^Precio de venta en Bitso/)).toHaveValue("");
  });

  it("says what each route is missing before anything is typed", () => {
    const { ranking } = setup();
    expect(
      screen.getByText("Completá el monto y el dólar MEP para comparar las rutas."),
    ).toBeVisible();
    expect(ranking()[0]).toContain(
      "Falta completar o corregir: el monto en USD, dólar MEP (compra), precio P2P en Binance " +
        "(USD por USDT) y precio de venta en Bitso (ARS por USDT).",
    );
  });

  it("ranks the routes as soon as everything is typed, without a button", async () => {
    const { type, ranking } = setup();
    await fillEverything(type);
    expect(
      screen.getByText(
        "Al dólar MEP serían $ 1.536.160,00. Mejor ruta: Binance P2P + Bitso, llegan $ 1.534.005,69.",
      ),
    ).toBeVisible();
    const [first, second, third] = ranking();
    expect(first).toContain("Binance P2P + Bitso");
    expect(first).toContain("Llegan al banco$ 1.534.005,69");
    expect(first).toContain("Comisiones$ 15.706,71");
    expect(first).toContain("Pérdida vs. dólar MEP$ 2.154,31");
    expect(second).toContain("ARQ (ex DolarApp)");
    expect(second).toContain("$ 1.524.869,44");
    expect(third).toContain("Dólar MEP");
    expect(third).toContain("$ 1.503.624,13");
  });

  it("announces only the one-line summary to screen readers", async () => {
    const { type } = setup();
    await fillEverything(type);
    const live = screen.getByText(/^Al dólar MEP serían/);
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("list")).not.toHaveAttribute("aria-live");
  });

  it("recomputes when a fee is edited", async () => {
    const { type, ranking } = setup();
    await fillEverything(type);
    await type(/^Recepción de ACH en ARQ/, "0");
    // Without ARQ's 3 USD: 960.00 x 1593.385 = 1529649.60
    expect(ranking()[1]).toContain("$ 1.529.649,60");
  });

  it("computes the routes that are complete and says what the others need", async () => {
    const { type, ranking } = setup();
    await fillEverything(type);
    await type(/^Precio de venta en Bitso/, " ");
    const items = ranking();
    expect(items[0]).toContain("ARQ (ex DolarApp)");
    expect(items[2]).toContain(
      "Falta completar o corregir: precio de venta en Bitso (ARS por USDT).",
    );
  });

  it("shows a gain when a route beats the MEP", async () => {
    const { type, ranking } = setup();
    await fillEverything(type);
    await type(/^Dólar MEP \(compra\)/, "1.400");
    expect(ranking()[0]).toContain("Ganancia vs. dólar MEP");
  });

  it("explains an invalid value next to its field", async () => {
    const { type, field, user } = setup();
    await type(/^Monto en Payoneer/, "0");
    // Nothing is flagged while typing; the problem shows once the person leaves the field.
    expect(field(/^Monto en Payoneer/)).toBeValid();
    await user.tab();
    expect(field(/^Monto en Payoneer/)).toBeInvalid();
    expect(field(/^Monto en Payoneer/)).toHaveAccessibleDescription("Tiene que ser mayor que 0.");
    await type(/^Comisión taker del libro de órdenes de Bitso/, "25");
    await user.tab();
    expect(field(/^Comisión taker del libro de órdenes de Bitso/)).toHaveAccessibleDescription(
      description("Como máximo 20 %."),
    );
  });

  it("catches a P2P price typed as Binance shows it, and says how it read each price", async () => {
    const { type, field, ranking, user } = setup();
    await fillEverything(type);
    expect(field(/^Precio P2P en Binance/)).toHaveAccessibleDescription(
      description("Leímos 1,03 USD por USDT."),
    );
    await type(/^Precio P2P en Binance/, "1.030");
    await user.tab();
    expect(field(/^Precio P2P en Binance/)).toBeInvalid();
    expect(field(/^Precio P2P en Binance/)).toHaveAccessibleDescription(
      description("¿Quisiste poner 1,03?"),
    );
    expect(ranking().find((item) => item.includes("Binance"))).toContain(
      "Falta completar o corregir: precio P2P en Binance (USD por USDT).",
    );
  });

  it("names the minimum when that is what is missing", async () => {
    const { type, user, field, ranking } = setup();
    await fillEverything(type);
    await user.clear(field(/^Retiro de Payoneer a una cuenta de EE.UU.: mínimo/));
    expect(ranking().find((item) => item.includes("ARQ"))).toContain(
      "Falta completar o corregir: el mínimo de retiro de Payoneer a una cuenta de EE.UU.",
    );
  });

  it("shows where each fee comes from", () => {
    setup();
    const premium = screen.getByLabelText(/^Recargo P2P por pagar con Payoneer/);
    expect(premium).toHaveAccessibleDescription(description("Lo definís vos"));
    expect(
      screen.getByRole("link", {
        name: "Precio de referencia de Recargo P2P por pagar con Payoneer (se abre en otra pestaña)",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: "Fuente de Recepción de ACH en ARQ (se abre en otra pestaña)",
      }),
    ).toHaveAttribute(
      "href",
      "https://help.arqfinance.com/es/articles/13532861-cuenta-sin-fronteras-recarga-en-multiples-monedas",
    );
    expect(screen.getAllByText("Verificado").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Estimado").length).toBeGreaterThan(0);
  });

  it("warns on the MEP route about the 90-day restriction, linking the BCRA rules", () => {
    setup();
    const mep = screen.getByRole("region", { name: "Dólar MEP" });
    expect(within(mep).getByText(/no podés vender dólares por MEP/)).toBeVisible();
    expect(
      within(mep).getByRole("link", {
        name: "A8481.pdf (www.bcra.gob.ar) (se abre en otra pestaña)",
      }),
    ).toHaveAttribute("href", "https://www.bcra.gob.ar/Pdfs/comytexord/A8481.pdf");
  });

  it("asks for the ARQ minimum separately, so it can be set to zero", async () => {
    const { type, ranking } = setup();
    await fillEverything(type);
    await type(/^Monto en Payoneer/, "100");
    await type(/^Retiro de Payoneer a una cuenta de EE.UU.: mínimo/, "0");
    // 100 USD: 4 % = 4.00; 96.00 - 3.00 = 93.00 x 1593.385 = 148184.805
    expect(ranking().find((item) => item.includes("ARQ"))).toContain("$ 148.184,80");
  });
});
