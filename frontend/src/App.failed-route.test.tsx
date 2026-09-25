import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App.tsx";

// Routes and fees may come from a pipeline in stage 2. Here Binance loses its last two steps,
// so it ends in USDT while it declares ARS: its own data is wrong.
vi.mock("./calculator/data/routes.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("./calculator/data/routes.ts")>();
  return {
    ...real,
    ROUTES: real.ROUTES.map((route) =>
      route.id === "binance_bitso" ? { ...route, steps: route.steps.slice(0, 2) } : route,
    ),
  };
});

const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

afterEach(() => {
  errors.mockClear();
});

describe("a route whose data is wrong", () => {
  it("says it cannot be computed while the other routes are compared as usual", async () => {
    const user = userEvent.setup();
    render(<App />);
    const type = async (label: RegExp, text: string) => {
      await user.type(screen.getByLabelText(label), text);
    };
    await type(/^Monto en Payoneer/, "1500");
    await type(/^Dólar MEP \(compra\)/, "1500");
    await type(/^Precio P2P en Binance/, "1");
    await type(/^Precio de venta en Bitso/, "1600");
    await type(/^Cotización de ARQ/, "1.580");

    const results = screen.getByRole("region", { name: "Resultado" });
    // ARQ: 1500.00 - 60.00 - 3.00 = 1437.00 x 1580 = 2270460.00; the MEP route, 2202330.00.
    expect(
      within(results).getByText(
        "Mejor ruta: ARQ (ex DolarApp), llegan $ 2.270.460,00: $ 68.130,00 más que Dólar MEP.",
      ),
    ).toBeVisible();
    const binance = within(results)
      .getByRole("heading", { name: "Binance P2P + Bitso" })
      .closest("li");
    expect(binance).toHaveTextContent(
      "No se puede calcular esta ruta: hay un problema con las cotizaciones o comisiones que usa. No es un error en lo que cargaste.",
    );
    expect(binance).not.toHaveTextContent("Llegan al banco");
    // Whoever fixes the data finds the reason in the console, once: typing on does not repeat it.
    await type(/^Monto en Payoneer/, "0");
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledWith(
      expect.stringContaining("binance_bitso: Route binance_bitso ends in USDT, it declares ARS"),
    );
  });
});
