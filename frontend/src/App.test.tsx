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
      "Falta: el monto en USD, Dólar MEP (compra), Precio P2P en Binance (USD por USDT) y Precio de venta en Bitso (ARS por USDT).",
    );
  });

  it("ranks the routes as soon as everything is typed, without a button", async () => {
    const { type, ranking } = setup();
    await fillEverything(type);
    expect(screen.getByText("Al dólar MEP serían $ 1.536.160,00.")).toBeVisible();
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
    expect(items[2]).toContain("Falta: Precio de venta en Bitso (ARS por USDT).");
  });

  it("shows a gain when a route beats the MEP", async () => {
    const { type, ranking } = setup();
    await fillEverything(type);
    await type(/^Dólar MEP \(compra\)/, "1.400");
    expect(ranking()[0]).toContain("Ganancia vs. dólar MEP");
  });

  it("explains an invalid value next to its field", async () => {
    const { type, field } = setup();
    await type(/^Monto en Payoneer/, "0");
    expect(field(/^Monto en Payoneer/)).toBeInvalid();
    expect(field(/^Monto en Payoneer/)).toHaveAccessibleDescription("Tiene que ser mayor que 0.");
    await type(/^Comisión taker del libro de órdenes de Bitso/, "25");
    expect(field(/^Comisión taker del libro de órdenes de Bitso/)).toHaveAccessibleDescription(
      expect.stringContaining("Como máximo 20 %.") as string,
    );
  });

  it("shows where each fee comes from", () => {
    setup();
    const premium = screen.getByLabelText(/^Recargo P2P por pagar con Payoneer/);
    expect(premium).toHaveAccessibleDescription(
      expect.stringContaining("Lo definís vos") as string,
    );
    expect(screen.getAllByRole("link", { name: "Precio de referencia" })).toHaveLength(1);
    expect(screen.getAllByText("Verificado").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Estimado").length).toBeGreaterThan(0);
  });

  it("warns on the MEP route about the 90-day restriction, linking the BCRA rules", () => {
    setup();
    const mep = screen.getByRole("region", { name: "Dólar MEP" });
    expect(within(mep).getByText(/no podés vender dólares por MEP/)).toBeVisible();
    expect(within(mep).getByRole("link", { name: "www.bcra.gob.ar" })).toHaveAttribute(
      "href",
      "https://www.bcra.gob.ar/Pdfs/comytexord/A8481.pdf",
    );
  });

  it("asks for the ARQ minimum separately, so it can be set to zero", async () => {
    const { type, ranking } = setup();
    await fillEverything(type);
    await type(/^Monto en Payoneer/, "100");
    await type(/^Mínimo de: Retiro de Payoneer a una cuenta de EE.UU./, "0");
    // 100 USD: 4 % = 4.00; 96.00 - 3.00 = 93.00 x 1593.385 = 148184.805
    expect(ranking().find((item) => item.includes("ARQ"))).toContain("$ 148.184,80");
  });
});
