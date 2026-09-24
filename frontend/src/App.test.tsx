import { getDefaultNormalizer, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { App } from "./App.tsx";

/** Text with no-break spaces as plain spaces, to compare with what the person reads. */
const plain = (text: string | null) => (text ?? "").replace(/\u00a0/g, " ");

function setup() {
  const user = userEvent.setup();
  render(<App />);
  const field = (name: RegExp) => screen.getByLabelText(name);
  const type = async (name: RegExp, text: string) => {
    await user.clear(field(name));
    if (text !== "") {
      await user.type(field(name), text);
    }
  };
  const results = () => screen.getByRole("region", { name: "Resultado" });
  const ranking = () =>
    within(results())
      .getAllByRole("listitem")
      .filter((item) => item.parentElement?.classList.contains("ranking") === true)
      .map((item) => plain(item.textContent));
  const openCard = async (name: string) => {
    await user.click(screen.getByText(name, { selector: ".route-card-title" }));
  };
  return { user, field, type, results, ranking, openCard };
}

async function fillEverything(type: (name: RegExp, text: string) => Promise<void>) {
  await type(/^Monto en Payoneer/, "1000");
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

  it("asks for the five numbers together at the top, each with where to find it", () => {
    setup();
    const inputs = screen.getByRole("region", { name: "Tus datos" });
    const labels = within(inputs)
      .getAllByRole("textbox")
      .map((box) => box.getAttribute("id"));
    expect(labels).toEqual([
      "amount",
      "price-mep",
      "price-p2p_usdt_usd",
      "price-bitso_usdt_ars",
      "price-arq_usd_ars",
    ]);
    expect(within(inputs).getByLabelText(/^Precio de venta en Bitso/)).toHaveValue("");
    expect(within(inputs).getByLabelText(/^Precio de venta en Bitso/)).toHaveAccessibleDescription(
      "En Bitso, cuántos pesos te dan por cada USDT que vendés.",
    );
  });

  it("keeps the fees, at their researched values, in closed cards", async () => {
    const { field, openCard } = setup();
    expect(field(/^Comisión taker del libro de órdenes de Bitso/)).not.toBeVisible();
    await openCard("Binance P2P + Bitso");
    expect(field(/^Comisión taker del libro de órdenes de Bitso/)).toBeVisible();
    expect(field(/^Comisión taker del libro de órdenes de Bitso/)).toHaveValue("0,6");
  });

  it("says what each route is missing, each item a link to its field", () => {
    const { ranking, results } = setup();
    expect(
      screen.getByText("Completá el monto y el dólar MEP para comparar las rutas."),
    ).toBeVisible();
    expect(ranking()[0]).toContain("Falta completar o corregir:");
    expect(
      within(results()).getAllByRole("link", { name: "precio de venta en Bitso (ARS por USDT)" }),
    ).toHaveLength(1);
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

  it("keeps a currency sign on the same line as its number", async () => {
    const { type, results } = setup();
    await fillEverything(type);
    // The default normalizer turns no-break spaces into plain ones; keep them to check.
    const keepSpaces = getDefaultNormalizer({ trim: false, collapseWhitespace: false });
    expect(
      within(results()).getAllByText(/\$\u00a01\.534\.005,69/, { normalizer: keepSpaces }).length,
    ).toBeGreaterThan(0);
  });

  it("shows the MEP 90-day warning next to its result, with the BCRA link, without opening a card", () => {
    const { results } = setup();
    const mep = within(results())
      .getAllByRole("listitem")
      .find((item) => item.textContent.includes("Dólar MEP"));
    expect(mep).toBeDefined();
    if (mep !== undefined) {
      expect(within(mep).getByText(/no podés vender dólares por MEP/)).toBeVisible();
      expect(
        within(mep).getByRole("link", {
          name: "A8481.pdf (www.bcra.gob.ar) (se abre en otra pestaña)",
        }),
      ).toHaveAttribute("href", "https://www.bcra.gob.ar/Pdfs/comytexord/A8481.pdf");
    }
  });

  it("recomputes when a fee is edited", async () => {
    const { type, ranking, openCard } = setup();
    await fillEverything(type);
    await openCard("ARQ (ex DolarApp)");
    await type(/^Recepción de ACH en ARQ/, "0");
    // Without ARQ's 3 USD: 960.00 x 1593.385 = 1529649.60
    expect(ranking()[1]).toContain("$ 1.529.649,60");
  });

  it("takes the person to a missing field at the top", async () => {
    const { type, user, field, results } = setup();
    await fillEverything(type);
    await type(/^Precio de venta en Bitso/, "");
    await user.click(
      within(results()).getByRole("link", { name: "precio de venta en Bitso (ARS por USDT)" }),
    );
    expect(field(/^Precio de venta en Bitso/)).toHaveFocus();
  });

  it("opens a closed card and focuses a missing fee inside it", async () => {
    const { type, user, field, results, openCard } = setup();
    await fillEverything(type);
    await openCard("Binance P2P + Bitso");
    await type(/^Comisión taker del libro de órdenes de Bitso/, "");
    await openCard("Binance P2P + Bitso");
    const input = field(/^Comisión taker del libro de órdenes de Bitso/);
    expect(input).not.toBeVisible();
    // A browser ignores focus() on a field inside a closed <details>: the card must already be
    // open when the field receives focus, not opened afterwards.
    let openAtFocus: boolean | undefined;
    input.addEventListener("focus", () => {
      openAtFocus = input.closest("details")?.open;
    });
    await user.click(
      within(results()).getByRole("link", { name: "comisión taker del libro de órdenes de Bitso" }),
    );
    expect(openAtFocus).toBe(true);
    expect(input).toBeVisible();
    expect(input).toHaveFocus();
  });

  it("names the minimum when that is what is missing, and links to it", async () => {
    const { type, user, field, results, openCard } = setup();
    await fillEverything(type);
    await openCard("ARQ (ex DolarApp)");
    await user.clear(field(/^Retiro de Payoneer a una cuenta de EE.UU.: mínimo/));
    await user.click(
      within(results()).getByRole("link", {
        name: "el mínimo de retiro de Payoneer a una cuenta de EE.UU.",
      }),
    );
    expect(field(/^Retiro de Payoneer a una cuenta de EE.UU.: mínimo/)).toHaveFocus();
  });

  it("shows a gain when a route beats the MEP", async () => {
    const { type, ranking } = setup();
    await fillEverything(type);
    await type(/^Dólar MEP \(compra\)/, "1.400");
    expect(ranking()[0]).toContain("Ganancia vs. dólar MEP");
  });

  it("explains an invalid value once the person leaves the field", async () => {
    const { type, field, user, openCard } = setup();
    await type(/^Monto en Payoneer/, "0");
    expect(field(/^Monto en Payoneer/)).toBeValid();
    await user.tab();
    expect(field(/^Monto en Payoneer/)).toBeInvalid();
    expect(field(/^Monto en Payoneer/)).toHaveAccessibleDescription(
      description("Tiene que ser mayor que 0."),
    );
    await openCard("Binance P2P + Bitso");
    await type(/^Comisión taker del libro de órdenes de Bitso/, "25");
    await user.tab();
    expect(field(/^Comisión taker del libro de órdenes de Bitso/)).toHaveAccessibleDescription(
      description("Como máximo 20 %."),
    );
  });

  it("keeps each field's problem in a live region, so leaving the field announces it", async () => {
    const { type, user } = setup();
    const region = document.getElementById("amount-problem");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();
    await type(/^Monto en Payoneer/, "0");
    await user.tab();
    expect(region).toHaveTextContent("Tiene que ser mayor que 0.");
  });

  it("computes with an unusual price as typed, and warns about it on leaving the field", async () => {
    const { type, field, user, ranking } = setup();
    await type(/^Precio P2P en Binance/, "1.030");
    // Nothing is shown while typing in a field not yet left.
    expect(field(/^Precio P2P en Binance/)).not.toHaveAccessibleDescription(
      description("Valor inusual"),
    );
    await user.tab();
    expect(field(/^Precio P2P en Binance/)).toBeValid();
    expect(field(/^Precio P2P en Binance/)).toHaveAccessibleDescription(
      description("Valor inusual: leímos 1.030,00 USD por USDT"),
    );
    expect(field(/^Precio P2P en Binance/)).toHaveAccessibleDescription(
      description("¿Quisiste poner 1,03?"),
    );
    await type(/^Monto en Payoneer/, "1000");
    await type(/^Dólar MEP \(compra\)/, "1.536,16");
    await type(/^Precio de venta en Bitso/, "1.596,21");
    await type(/^Cotización de ARQ/, "1.593,385");
    // Computed with 1030 as typed, not with the suggestion:
    // 1000.00 - 4.00 = 996.00 USD / 1030 = 0.9669... -> 0.96 USDT - 0.08 = 0.88; - 0.07 = 0.81;
    // 0.6 % of 0.81 = 0.00486 -> 0.01; 0.80 x 1596.21 = 1276.968 -> 1276.96
    const items = ranking();
    expect(items.at(-1)).toContain("Binance P2P + Bitso");
    expect(items.at(-1)).toContain("Llegan al banco$ 1.276,96");
    expect(items.at(-1)).toContain(
      "Calculado con un valor inusual: precio P2P en Binance (USD por USDT).",
    );
  });

  it("says how a number was read only when it reads two ways", async () => {
    const { type, field } = setup();
    await type(/^Dólar MEP \(compra\)/, "1.536,16");
    expect(field(/^Dólar MEP \(compra\)/)).not.toHaveAccessibleDescription(description("Leímos"));
    await type(/^Dólar MEP \(compra\)/, "1.540");
    expect(field(/^Dólar MEP \(compra\)/)).toHaveAccessibleDescription(
      description("Leímos 1.540,00 ARS por USD."),
    );
  });

  it("asks to review the reference fields that hold a wrong value", async () => {
    const { type } = setup();
    await type(/^Monto en Payoneer/, "0");
    expect(screen.getByText("Revisá el monto: tiene un valor que no se puede usar.")).toBeVisible();
    await type(/^Dólar MEP \(compra\)/, "-1");
    expect(
      screen.getByText("Revisá el monto y el dólar MEP: tienen valores que no se pueden usar."),
    ).toBeVisible();
  });

  it("keeps each fee's provenance and note in a collapsible Detalles", async () => {
    const { user, openCard } = setup();
    await openCard("ARQ (ex DolarApp)");
    const link = screen.getByRole("link", {
      name: "Fuente de Recepción de ACH en ARQ (se abre en otra pestaña)",
    });
    expect(link).not.toBeVisible();
    await user.click(
      screen.getByText("Detalles", {
        selector: '[aria-label="Detalles de Recepción de ACH en ARQ"]',
      }),
    );
    expect(link).toBeVisible();
    expect(link).toHaveAttribute(
      "href",
      "https://help.arqfinance.com/es/articles/13532861-cuenta-sin-fronteras-recarga-en-multiples-monedas",
    );
  });

  it("does not repeat a step's title when its only fee says the same", async () => {
    const { openCard } = setup();
    await openCard("Dólar MEP");
    // "Retirar de Payoneer a una cuenta argentina en USD" and its fee "Retiro de Payoneer a…".
    expect(screen.getByText("Retirar de Payoneer a una cuenta argentina en USD")).toHaveClass(
      "visually-hidden",
    );
    // The group keeps its name for screen readers.
    expect(
      screen.getByRole("group", { name: "Retirar de Payoneer a una cuenta argentina en USD" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Comprar AL30D y vender AL30")).not.toHaveClass("visually-hidden");
  });

  it("lets the ARQ minimum be set to zero", async () => {
    const { type, ranking, openCard } = setup();
    await fillEverything(type);
    await type(/^Monto en Payoneer/, "100");
    await openCard("ARQ (ex DolarApp)");
    await type(/^Retiro de Payoneer a una cuenta de EE.UU.: mínimo/, "0");
    // 100 USD: 4 % = 4.00; 96.00 - 3.00 = 93.00 x 1593.385 = 148184.805
    expect(ranking().find((item) => item.includes("ARQ"))).toContain("$ 148.184,80");
  });
});
