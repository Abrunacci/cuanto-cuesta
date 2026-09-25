import {
  act,
  cleanup,
  fireEvent,
  getDefaultNormalizer,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./App.tsx";

/** Text with no-break spaces as plain spaces, to compare with what the person reads. */
const plain = (text: string | null) => (text ?? "").replace(/\u00a0/g, " ");

/** What a sighted person reads: the text without what is only for screen readers, spaces collapsed. */
function visible(element: HTMLElement) {
  const copy = element.cloneNode(true);
  if (!(copy instanceof HTMLElement)) {
    throw new Error("expected an element");
  }
  for (const hidden of copy.querySelectorAll(".visually-hidden")) {
    hidden.remove();
  }
  return plain(copy.textContent).replace(/\s+/g, " ").trim();
}

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

// Accessible names below are jsdom's. Chromium adds a space around the hidden punctuation
// ("Bitso . Llegan"), because hidden text is absolutely positioned; screen readers do not read it.

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
      screen.getByText("Completá el monto y las cotizaciones para comparar las rutas."),
    ).toBeVisible();
    expect(ranking()[0]).toContain("Falta completar o corregir:");
    expect(
      within(results()).getAllByRole("link", { name: "precio de venta en Bitso (ARS por USDT)" }),
    ).toHaveLength(1);
  });

  it("ranks the routes as soon as everything is typed, without a button", async () => {
    const { type, ranking, results } = setup();
    await fillEverything(type);
    // 1534005.69 - 1524869.44 = 9136.25; 1534005.69 - 1503624.13 = 30381.56
    expect(
      screen.getByText(
        "Mejor ruta: Binance P2P + Bitso, llegan $ 1.534.005,69: $ 9.136,25 más que ARQ (ex DolarApp).",
      ),
    ).toBeVisible();
    const [first, second, third] = ranking();
    expect(first).toContain("Binance P2P + Bitso");
    expect(first).toContain("Llegan al banco$ 1.534.005,69");
    expect(first).toContain("Comisiones$ 15.706,71");
    expect(first).toContain("Diferencia$ 9.136,25 más que ARQ (ex DolarApp)");
    expect(second).toContain("ARQ (ex DolarApp)");
    expect(second).toContain("$ 1.524.869,44");
    expect(second).toContain("Diferencia$ 9.136,25 menos que Binance P2P + Bitso");
    expect(third).toContain("Dólar MEP");
    expect(third).toContain("$ 1.503.624,13");
    expect(third).toContain("Diferencia$ 30.381,56 menos que Binance P2P + Bitso");
    expect(results()).not.toHaveTextContent(/vs\. dólar MEP|Al dólar MEP/);
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

  it("shows the MEP warning next to its result as one line linking the BCRA rules", () => {
    const { results } = setup();
    const mep = within(results())
      .getAllByRole("listitem")
      .find((item) => item.textContent.includes("Dólar MEP"));
    expect(mep).toBeDefined();
    if (mep !== undefined) {
      const link = within(mep).getByRole("link", {
        name: "Verificá las restricciones sobre el dólar MEP (se abre en otra pestaña)",
      });
      expect(link).toBeVisible();
      expect(link).toHaveAttribute("href", "https://www.bcra.gob.ar/Pdfs/comytexord/A8481.pdf");
      expect(link.closest("p")).toHaveTextContent(
        /^Atención: Verificá las restricciones sobre el dólar MEP$/,
      );
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

  it("compares the MEP route with the best one, not with the MEP itself", async () => {
    const { type, ranking } = setup();
    await type(/^Monto en Payoneer/, "1500");
    await type(/^Dólar MEP \(compra\)/, "1500");
    await type(/^Precio P2P en Binance/, "1");
    await type(/^Precio de venta en Bitso/, "1600");
    expect(
      screen.getByText(
        "Mejor ruta: Binance P2P + Bitso, llegan $ 2.378.992,00: $ 176.662,00 más que Dólar MEP.",
      ),
    ).toBeVisible();
    const [binance, mep, arq] = ranking();
    expect(binance).toContain("Llegan al banco$ 2.378.992,00");
    expect(binance).toContain("Comisiones$ 21.008,00");
    expect(binance).toContain("Diferencia$ 176.662,00 más que Dólar MEP");
    // Its fees stay in their own figure; the difference is with the best route.
    expect(mep).toContain("Llegan al banco$ 2.202.330,00");
    expect(mep).toContain("Comisiones$ 47.670,00");
    expect(mep).toContain("Diferencia$ 176.662,00 menos que Binance P2P + Bitso");
    expect(arq).toContain("ARQ (ex DolarApp)Falta completar o corregir:");
    expect(arq).not.toContain("Diferencia");
  });

  it("asks to review a difference that rests on another route's values, and goes there", async () => {
    const { type, user, results, ranking } = setup();
    await fillEverything(type);
    // Binance's P2P premium is still at 0 and it has estimates: every difference with it rests
    // on them.
    const [, arq] = ranking();
    expect(arq).toContain("Diferencia$ 9.136,25 menos que Binance P2P + Bitso · revisá");
    const links = within(results()).getAllByRole("link", {
      name: "Revisá los valores de Binance P2P + Bitso",
    });
    // ARQ's and the MEP route's differences.
    expect(links).toHaveLength(2);
    const [first] = links;
    if (first === undefined) {
      throw new Error("expected a link");
    }
    await user.click(first);
    expect(screen.getByRole("heading", { name: "Binance P2P + Bitso" })).toHaveFocus();
  });

  it("points at the route's own values once the other route has nothing to review", async () => {
    const { type, user, openCard, ranking, results } = setup();
    await fillEverything(type);
    await openCard("Binance P2P + Bitso");
    await type(/^Recargo P2P por pagar con Payoneer/, "0,1");
    await type(/^Transferencia de Payoneer al comprador P2P/, "3");
    await type(/^Comisión taker de Binance P2P/, "0,07");
    const mep = ranking().find((item) => item.startsWith("Dólar MEP"));
    expect(mep).toContain("menos que Binance P2P + Bitso · revisá");
    await user.click(
      within(results()).getByRole("link", { name: "Revisá los valores de Dólar MEP" }),
    );
    expect(screen.getByRole("heading", { name: "Dólar MEP" })).toHaveFocus();
    expect(
      within(results()).queryByRole("link", { name: "Revisá los valores de Binance P2P + Bitso" }),
    ).toBeNull();
  });

  it("computes Binance P2P + Bitso without the MEP, with nothing to compare it with", async () => {
    const { type, ranking, results } = setup();
    await type(/^Monto en Payoneer/, "1500");
    await type(/^Precio P2P en Binance/, "1");
    await type(/^Precio de venta en Bitso/, "1600");
    expect(
      screen.getByText(
        "Por ahora solo se puede calcular Binance P2P + Bitso: llegan $ 2.378.992,00.",
      ),
    ).toBeVisible();
    const [binance, ...others] = ranking();
    expect(binance).toContain("Llegan al banco$ 2.378.992,00");
    expect(binance).toContain("DiferenciaTodavía no hay otra ruta para comparar");
    expect(binance).not.toContain("revisá");
    expect(others.find((item) => item.startsWith("Dólar MEP"))).toContain("dólar MEP (compra)");
    expect(within(results()).getAllByRole("link", { name: "dólar MEP (compra)" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Ver resultado$/ })).toHaveTextContent(
      "Única ruta calculada: Binance P2P + Bitso",
    );
  });

  it("shows routes that deliver the same as tied", async () => {
    const { type, ranking } = setup();
    await fillEverything(type);
    // ARQ: 1000.00 - 40.00 - 3.00 = 957.00 x 1602.9317555 = 1534005.690..., as much as Binance.
    // A tie is ordered by route id, so ARQ comes first.
    await type(/^Cotización de ARQ/, "1.602,9317555");
    expect(
      screen.getByText("Empatan ARQ (ex DolarApp) y Binance P2P + Bitso: llegan $ 1.534.005,69."),
    ).toBeVisible();
    const [first, second, third] = ranking();
    // Both tied routes have estimates, so each difference points at the other one.
    expect(first).toContain("DiferenciaIgual que Binance P2P + Bitso · revisá");
    expect(second).toContain("DiferenciaIgual que ARQ (ex DolarApp) · revisá");
    expect(third).toContain("Diferencia$ 30.381,56 menos que ARQ (ex DolarApp) · revisá");
    expect(
      screen.getAllByRole("link", { name: "Revisá los valores de Binance P2P + Bitso" }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("link", { name: "Revisá los valores de ARQ (ex DolarApp)" }),
    ).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Ver resultado$/ })).toHaveTextContent(
      "Empatan: ARQ (ex DolarApp) y Binance P2P + Bitso",
    );
  });

  it("hides a price's help once the person leaves it filled, never while typing", async () => {
    const { type, user, field } = setup();
    // jsdom has no stylesheet: the class is what hides the help on screen.
    const help = () => document.getElementById("price-mep-help");
    expect(help()).not.toHaveClass("visually-hidden");
    await type(/^Dólar MEP \(compra\)/, "1.536,16");
    expect(field(/^Dólar MEP \(compra\)/)).toHaveFocus();
    expect(help()).not.toHaveClass("visually-hidden");
    await user.tab();
    expect(help()).toHaveClass("visually-hidden");
    // Screen readers still read it with the field.
    expect(field(/^Dólar MEP \(compra\)/)).toHaveAccessibleDescription(
      description("Lo que te pagan por cada dólar vendido por MEP."),
    );
    await user.click(field(/^Dólar MEP \(compra\)/));
    expect(help()).not.toHaveClass("visually-hidden");
    await user.clear(field(/^Dólar MEP \(compra\)/));
    await user.tab();
    expect(help()).not.toHaveClass("visually-hidden");
  });

  it("hides the help after a click elsewhere, once the click is done", async () => {
    const { type, user } = setup();
    await type(/^Dólar MEP \(compra\)/, "1.536,16");
    const heading = screen.getByRole("heading", { name: "Tus datos" });
    await user.pointer({ keys: "[MouseLeft>]", target: heading });
    // Pressed but not released: the page must not move under the pointer yet.
    expect(document.getElementById("price-mep-help")).not.toHaveClass("visually-hidden");
    await user.pointer({ keys: "[/MouseLeft]", target: heading });
    await waitFor(() => {
      expect(document.getElementById("price-mep-help")).toHaveClass("visually-hidden");
    });
  });

  it("shows a filled price's help again when the page moves the focus to it", async () => {
    const { type, user, field } = setup();
    const help = () => document.getElementById("price-mep-help");
    await type(/^Dólar MEP \(compra\)/, "1.536,16");
    await user.tab();
    expect(help()).toHaveClass("visually-hidden");
    // What the result links do: focus the field from code.
    act(() => {
      field(/^Dólar MEP \(compra\)/).focus();
    });
    expect(help()).not.toHaveClass("visually-hidden");
  });

  it("hides the help of a price left with an unusual but usable value", async () => {
    const { type, user, field } = setup();
    await type(/^Precio P2P en Binance/, "1.030");
    await user.tab();
    expect(field(/^Precio P2P en Binance/)).toHaveAccessibleDescription(
      description("Valor inusual: leímos 1.030,00 USD por USDT"),
    );
    expect(document.getElementById("price-p2p_usdt_usd-help")).toHaveClass("visually-hidden");
  });

  it("shows a problem found on leaving when the press elsewhere is cancelled", async () => {
    const { type } = setup();
    await type(/^Dólar MEP \(compra\)/, "0");
    const heading = screen.getByRole("heading", { name: "Tus datos" });
    fireEvent.pointerDown(heading);
    fireEvent.blur(screen.getByLabelText(/^Dólar MEP \(compra\)/));
    const problem = document.getElementById("price-mep-problem");
    expect(problem).toBeEmptyDOMElement();
    fireEvent.pointerCancel(window);
    await waitFor(() => {
      expect(problem).toHaveTextContent("Tiene que ser mayor que 0.");
    });
  });

  it("does not hold back problems after a press whose release a context menu took", async () => {
    const { type, user } = setup();
    await type(/^Dólar MEP \(compra\)/, "0");
    // A press whose release never reaches the page: the context menu took it.
    const heading = screen.getByRole("heading", { name: "Tus datos" });
    fireEvent.pointerDown(heading);
    fireEvent.contextMenu(heading);
    // Leaving with the keyboard shows the problem right away.
    await user.tab();
    expect(document.getElementById("price-mep-problem")).toHaveTextContent(
      "Tiene que ser mayor que 0.",
    );
  });

  it("keeps a filled field's help in view while it shows a problem", async () => {
    const { type, user, field } = setup();
    const help = () => document.getElementById("amount-help");
    await type(/^Monto en Payoneer/, "0");
    await user.tab();
    expect(field(/^Monto en Payoneer/)).toHaveAccessibleDescription(
      description("Tiene que ser mayor que 0."),
    );
    expect(help()).not.toHaveClass("visually-hidden");
    // Fixed, the help goes once the person leaves the field again.
    await type(/^Monto en Payoneer/, "1000");
    await user.tab();
    expect(help()).toHaveClass("visually-hidden");
  });

  it("shows a problem found on leaving only once a press elsewhere is released", async () => {
    const { type, user } = setup();
    const problem = () => document.getElementById("price-mep-problem");
    await type(/^Dólar MEP \(compra\)/, "0");
    const heading = screen.getByRole("heading", { name: "Tus datos" });
    await user.pointer({ keys: "[MouseLeft>]", target: heading });
    // Pressed but not released: nothing below the field may move yet.
    expect(problem()).toBeEmptyDOMElement();
    await user.pointer({ keys: "[/MouseLeft]", target: heading });
    await waitFor(() => {
      expect(problem()).toHaveTextContent("Tiene que ser mayor que 0.");
    });
  });

  it("shows a problem right away when the person leaves the field with the keyboard", async () => {
    const { type, user } = setup();
    await type(/^Dólar MEP \(compra\)/, "0");
    await user.tab();
    expect(document.getElementById("price-mep-problem")).toHaveTextContent(
      "Tiene que ser mayor que 0.",
    );
  });

  it("keeps a fee minimum's help in view although the minimum starts filled", async () => {
    const { openCard } = setup();
    await openCard("ARQ (ex DolarApp)");
    const minimum = screen.getAllByText(
      "Se cobra este mínimo cuando el porcentaje da menos. Si no te lo cobran, poné 0.",
    );
    for (const help of minimum) {
      expect(help).not.toHaveClass("visually-hidden");
    }
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
    // Only the route that converts with that price says so.
    for (const other of items.slice(0, -1)) {
      expect(other).not.toContain("Calculado con un valor inusual");
    }
  });

  it("says only the MEP route was computed with an unusual MEP", async () => {
    const { type, user, ranking } = setup();
    await fillEverything(type);
    await type(/^Dólar MEP \(compra\)/, "1,536");
    await user.tab();
    const items = ranking();
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.includes("Calculado con un valor inusual: dólar MEP (compra).")).toBe(
        item.startsWith("Dólar MEP"),
      );
    }
  });

  it("says how a number was read only when both readings are possible", async () => {
    const { type, field, openCard } = setup();
    await type(/^Dólar MEP \(compra\)/, "1.540");
    expect(field(/^Dólar MEP \(compra\)/)).not.toHaveAccessibleDescription(description("Leímos"));
    await openCard("Binance P2P + Bitso");
    await type(/^Retiro de ARS de Bitso a CBU\/CVU/, "1.500");
    expect(field(/^Retiro de ARS de Bitso a CBU\/CVU/)).toHaveAccessibleDescription(
      description("Leímos 1.500,00 ARS."),
    );
  });

  it("asks to review the amount when it holds a wrong value", async () => {
    const { type, results, ranking } = setup();
    await type(/^Monto en Payoneer/, "0");
    expect(
      within(results()).getByText("Revisá el monto: tiene un valor que no se puede usar."),
    ).toBeVisible();
    // A wrong MEP only concerns the MEP route, which lists it.
    await type(/^Dólar MEP \(compra\)/, "-1");
    expect(
      within(results()).getByText("Revisá el monto: tiene un valor que no se puede usar."),
    ).toBeVisible();
    expect(ranking().find((item) => item.startsWith("Dólar MEP"))).toContain("dólar MEP (compra)");
  });

  it("shows each fee's status without opening Detalles, and its source inside", async () => {
    const { user, openCard } = setup();
    await openCard("ARQ (ex DolarApp)");
    const details = screen.getByText("Detalles", {
      selector: '[aria-label="Verificado. Detalles de Recepción de ACH en ARQ"]',
      exact: false,
    });
    expect(within(details).getByText("Verificado")).toBeVisible();
    const link = screen.getByRole("link", {
      name: "Fuente de Recepción de ACH en ARQ (se abre en otra pestaña)",
    });
    expect(link).not.toBeVisible();
    await user.click(details);
    expect(link).toBeVisible();
    expect(link).toHaveAttribute(
      "href",
      "https://help.arqfinance.com/es/articles/13532861-cuenta-sin-fronteras-recarga-en-multiples-monedas",
    );
  });

  it("says in the result which fees to review, each a link that opens its card", async () => {
    const { type, user, field, ranking, results } = setup();
    await fillEverything(type);
    const binance = ranking().find((item) => item.includes("Binance"));
    expect(binance).toContain("Recargo P2P por pagar con Payoneer: está en 0 %, poné tu valor.");
    expect(binance).toContain(
      "Incluye comisiones estimadas: transferencia de Payoneer al comprador P2P y comisión taker de Binance P2P.",
    );
    await user.click(
      within(results()).getByRole("link", { name: "Recargo P2P por pagar con Payoneer" }),
    );
    expect(field(/^Recargo P2P por pagar con Payoneer/)).toBeVisible();
    expect(field(/^Recargo P2P por pagar con Payoneer/)).toHaveFocus();
  });

  it("links an estimated fee to its field in another route's card", async () => {
    const { type, user, field, results } = setup();
    await fillEverything(type);
    await user.click(within(results()).getByRole("link", { name: "conversión USD→USDc en ARQ" }));
    expect(field(/^Conversión USD→USDc en ARQ/)).toBeVisible();
    expect(field(/^Conversión USD→USDc en ARQ/)).toHaveFocus();
  });

  it("shows every kind of status badge without opening Detalles", async () => {
    const { openCard } = setup();
    await openCard("Binance P2P + Bitso");
    const card = screen.getByText("Binance P2P + Bitso", { selector: ".route-card-title" });
    const details = card.closest("details");
    expect(details).not.toBeNull();
    if (details !== null) {
      expect(within(details).getAllByText("Estimado")[0]).toBeVisible();
      expect(within(details).getByText("Lo definís vos")).toBeVisible();
      expect(within(details).getAllByText("Verificado")[0]).toBeVisible();
    }
  });

  it("stops listing a fee once the person sets it", async () => {
    const { type, ranking, openCard } = setup();
    await fillEverything(type);
    await openCard("Binance P2P + Bitso");
    await type(/^Recargo P2P por pagar con Payoneer/, "0,5");
    await type(/^Comisión taker de Binance P2P/, "0,06");
    const binance = ranking().find((item) => item.includes("Binance"));
    expect(binance).not.toContain("Recargo P2P");
    expect(binance).toContain(
      "Incluye una comisión estimada: transferencia de Payoneer al comprador P2P. Revisala si sabés la tuya.",
    );
  });

  it("lists nothing to review for a route with only verified fees left", async () => {
    const { type, ranking, openCard } = setup();
    await fillEverything(type);
    await openCard("ARQ (ex DolarApp)");
    await type(/^Retiro de Payoneer a una cuenta de EE.UU.(?!: mínimo)/, "3");
    await type(/^Conversión USD→USDc en ARQ/, "0,1");
    expect(ranking().find((item) => item.includes("ARQ"))).not.toContain("Incluye");
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
    expect(ranking().find((item) => item.startsWith("ARQ"))).toContain("$ 148.184,80");
  });

  it("lists once what every route is missing, and under each route only its own", async () => {
    const { ranking, results, type } = setup();
    await type(/^Dólar MEP \(compra\)/, "1.536,16");
    // The block listed once comes before the ranking, so it is the first of its kind.
    const [listedOnce] = within(results()).getAllByText(/^Falta completar o corregir:/);
    expect(listedOnce).toHaveTextContent("Falta completar o corregir: monto en USD.");
    expect(within(results()).getAllByRole("link", { name: "monto en USD" })).toHaveLength(1);
    const binance = ranking().find((item) => item.includes("Binance"));
    expect(binance).toContain("precio P2P en Binance (USD por USDT)");
    expect(binance).not.toContain("monto en USD");
    // The MEP route needs nothing beyond what is listed once, so it only says it is waiting.
    const mep = ranking().find((item) => item.startsWith("Dólar MEP"));
    expect(mep).not.toContain("Falta completar o corregir");
    expect(mep).toContain("Se calcula cuando completes lo de arriba.");
  });

  it("keeps the best route in a bar that updates as the person types", async () => {
    const { type } = setup();
    const bar = () => screen.getByRole("link", { name: /Ver resultado$/ });
    expect(bar()).toHaveTextContent("Falta completar: monto en USD.");
    await fillEverything(type);
    expect(visible(bar())).toBe(
      "Mejor ruta: Binance P2P + Bitso Llegan $ 1.534.005,69 · revisá Ver resultado",
    );
    await type(/^Dólar MEP \(compra\)/, "1.400");
    await type(/^Precio P2P en Binance/, "1,5");
    expect(bar()).toHaveTextContent("Mejor ruta: ARQ (ex DolarApp)");
  });

  it("takes the person to the full result from the bar", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("link", { name: /Ver resultado$/ }));
    expect(screen.getByRole("heading", { name: "Resultado" })).toHaveFocus();
  });

  it("takes the person to the best route's result when it has values to review", async () => {
    const { user, type } = setup();
    await fillEverything(type);
    const bar = screen.getByRole("link", { name: /Ver resultado$/ });
    // The P2P premium is still at 0 and two Binance fees are estimates.
    expect(bar).toHaveAccessibleName(
      "Mejor ruta: Binance P2P + Bitso. Llegan $\u00a01.534.005,69 · revisá los valores de esta " +
        "ruta. Ver resultado",
    );
    await user.click(bar);
    expect(screen.getByRole("heading", { name: "Binance P2P + Bitso" })).toHaveFocus();
  });

  it("drops the review mark once the best route's values are set", async () => {
    const { user, type, openCard } = setup();
    await fillEverything(type);
    await openCard("Binance P2P + Bitso");
    await type(/^Recargo P2P por pagar con Payoneer/, "0,1");
    await type(/^Transferencia de Payoneer al comprador P2P/, "3");
    await type(/^Comisión taker de Binance P2P/, "0,07");
    const bar = screen.getByRole("link", { name: /Ver resultado$/ });
    expect(bar).toHaveAccessibleName(
      "Mejor ruta: Binance P2P + Bitso. Llegan $\u00a01.534.021,65. Ver resultado",
    );
    await user.click(bar);
    expect(screen.getByRole("heading", { name: "Resultado" })).toHaveFocus();
  });

  it("marks the bar for review when the best route uses an unusual price", async () => {
    const { type, openCard } = setup();
    await fillEverything(type);
    await openCard("Binance P2P + Bitso");
    await type(/^Recargo P2P por pagar con Payoneer/, "0,1");
    await type(/^Transferencia de Payoneer al comprador P2P/, "3");
    await type(/^Comisión taker de Binance P2P/, "0,07");
    await type(/^Precio de venta en Bitso/, "60.000");
    const bar = screen.getByRole("link", { name: /Ver resultado$/ });
    expect(bar).toHaveTextContent("Mejor ruta: Binance P2P + Bitso");
    expect(bar).toHaveTextContent("· revisá");
  });

  describe("with an on-screen keyboard that only shrinks the visual viewport (Safari on iOS)", () => {
    /** A visual viewport, and a layout viewport 800px tall and `layoutWidth` wide. */
    function fakeViewport(height: number, offsetTop = 0) {
      const target = new EventTarget() as EventTarget & {
        width: number;
        height: number;
        offsetTop: number;
        scale: number;
        layoutWidth: number;
      };
      target.width = 390;
      target.height = height;
      target.offsetTop = offsetTop;
      target.scale = 1;
      target.layoutWidth = 390;
      Object.defineProperty(window, "visualViewport", { value: target, configurable: true });
      Object.defineProperty(document.documentElement, "clientHeight", {
        value: 800,
        configurable: true,
      });
      Object.defineProperty(document.documentElement, "clientWidth", {
        get: () => target.layoutWidth,
        configurable: true,
      });
      return target;
    }

    afterEach(() => {
      Reflect.deleteProperty(window, "visualViewport");
      Reflect.deleteProperty(document.documentElement, "clientHeight");
      Reflect.deleteProperty(document.documentElement, "clientWidth");
    });

    const bar = () => screen.getByRole("link", { name: /Ver resultado$/ });

    it("moves the bar up above the keyboard, and back down when it closes", () => {
      const viewport = fakeViewport(800);
      render(<App />);
      expect(bar()).toHaveStyle({ bottom: "0px" });
      viewport.height = 500;
      act(() => {
        viewport.dispatchEvent(new Event("resize"));
      });
      expect(bar()).toHaveStyle({ bottom: "300px" });
      viewport.offsetTop = 100;
      act(() => {
        viewport.dispatchEvent(new Event("scroll"));
      });
      expect(bar()).toHaveStyle({ bottom: "200px" });
      viewport.height = 800;
      viewport.offsetTop = 0;
      act(() => {
        viewport.dispatchEvent(new Event("resize"));
      });
      expect(bar()).toHaveStyle({ bottom: "0px" });
    });

    const resize = (viewport: EventTarget) => {
      act(() => {
        viewport.dispatchEvent(new Event("resize"));
      });
    };

    it("shrinks the bar to one line while the keyboard is open", async () => {
      const viewport = fakeViewport(800);
      const { type } = setup();
      await fillEverything(type);
      viewport.height = 470;
      resize(viewport);
      expect(visible(bar())).toBe("Mejor: Binance P2P + Bitso · $ 1.534.005 \u26a0\ufe0e");
      expect(bar()).toHaveAccessibleName(
        "Mejor: Binance P2P + Bitso · $\u00a01.534.005, revisá los valores de esta ruta. " +
          "Ver resultado",
      );
      viewport.height = 800;
      resize(viewport);
      expect(visible(bar())).toBe(
        "Mejor ruta: Binance P2P + Bitso Llegan $ 1.534.005,69 · revisá Ver resultado",
      );
    });

    it("says what is missing in a few words while the keyboard is open", async () => {
      const viewport = fakeViewport(800);
      const { type } = setup();
      viewport.height = 470;
      resize(viewport);
      // jsdom has no layout: this checks the line that would cut with an ellipsis, not the cut.
      const line = within(bar()).getByText("Falta: monto");
      expect(line.parentElement).toHaveClass("result-bar-line");
      expect(bar()).toHaveAccessibleName("Falta: monto. Ver resultado");
      await type(/^Monto en Payoneer/, "0");
      await type(/^Dólar MEP \(compra\)/, "1.536,16");
      expect(visible(bar())).toBe("Revisá: monto");
      // With the keyboard closed, the bar has room for the whole sentence.
      viewport.height = 800;
      resize(viewport);
      expect(visible(bar())).toBe(
        "Revisá el monto: tiene un valor que no se puede usar. Ver resultado",
      );
    });

    it("shows no alert in the one-line bar when there is nothing to review", async () => {
      const viewport = fakeViewport(800);
      const { type, openCard } = setup();
      await fillEverything(type);
      await openCard("Binance P2P + Bitso");
      await type(/^Recargo P2P por pagar con Payoneer/, "0,1");
      await type(/^Transferencia de Payoneer al comprador P2P/, "3");
      await type(/^Comisión taker de Binance P2P/, "0,07");
      viewport.height = 470;
      resize(viewport);
      expect(visible(bar())).toBe("Mejor: Binance P2P + Bitso · $ 1.534.021");
      expect(bar()).toHaveAccessibleName(
        "Mejor: Binance P2P + Bitso · $\u00a01.534.021. Ver resultado",
      );
    });

    const compact = () => !visible(bar()).includes("Ver resultado");

    it("ignores pinch zoom, and still sees the keyboard after it", () => {
      const viewport = fakeViewport(800);
      render(<App />);
      viewport.height = 470;
      resize(viewport);
      expect(compact()).toBe(true);
      // Zooming in shrinks the visual viewport in both directions; the layout stays the same.
      Object.assign(viewport, { width: 195, height: 235, scale: 2 });
      resize(viewport);
      expect(compact()).toBe(false);
      expect(bar()).toHaveStyle({ bottom: "0px" });
      // Zoomed back out with the keyboard still open: not mistaken for a rotation.
      Object.assign(viewport, { width: 390, height: 470, scale: 1 });
      resize(viewport);
      expect(compact()).toBe(true);
    });

    it("keeps the full bar when a rotation makes the screen shorter", () => {
      const viewport = fakeViewport(800);
      render(<App />);
      Object.assign(viewport, { layoutWidth: 844, width: 844, height: 390 });
      resize(viewport);
      expect(compact()).toBe(false);
      // The keyboard, opened in landscape, is measured against the landscape height.
      viewport.height = 200;
      resize(viewport);
      expect(compact()).toBe(true);
    });

    it("sees the keyboard again after rotating with it open", () => {
      const viewport = fakeViewport(800);
      render(<App />);
      viewport.height = 470;
      resize(viewport);
      expect(compact()).toBe(true);
      // Rotated with the keyboard open: the landscape height is not known yet, so the bar is
      // full until the keyboard closes and opens again.
      Object.assign(viewport, { layoutWidth: 844, width: 844, height: 200 });
      resize(viewport);
      expect(compact()).toBe(false);
      viewport.height = 390;
      resize(viewport);
      viewport.height = 200;
      resize(viewport);
      expect(compact()).toBe(true);
    });

    it("never moves the bar below the screen", () => {
      const viewport = fakeViewport(900);
      render(<App />);
      act(() => {
        viewport.dispatchEvent(new Event("resize"));
      });
      expect(bar()).toHaveStyle({ bottom: "0px" });
    });

    it("ignores iOS overscroll and rounds to whole pixels", () => {
      // 800 - 500.4 = 299.6 -> 300; a negative offsetTop from overscroll would make it 340.
      const viewport = fakeViewport(500.4, -40);
      render(<App />);
      act(() => {
        viewport.dispatchEvent(new Event("scroll"));
      });
      expect(bar()).toHaveStyle({ bottom: "300px" });
    });

    it("stops listening once the page is gone", () => {
      const viewport = fakeViewport(800);
      const removed: string[] = [];
      const remove = viewport.removeEventListener.bind(viewport);
      viewport.removeEventListener = (
        type: string,
        listener: EventListenerOrEventListenerObject | null,
      ) => {
        removed.push(type);
        remove(type, listener);
      };
      const { unmount } = render(<App />);
      unmount();
      expect(removed.sort()).toEqual(["resize", "scroll"]);
    });
  });

  it("reserves the bar's real height, so a focused field is never left under it", () => {
    // jsdom has no layout: fake a bar that wrapped to 120px and an observer that reports it.
    const callbacks: ResizeObserverCallback[] = [];
    class FakeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback);
      }
      observe() {
        for (const callback of callbacks) {
          callback([], this as unknown as ResizeObserver);
        }
      }
      disconnect() {
        callbacks.length = 0;
      }
    }
    Object.defineProperty(window, "ResizeObserver", {
      value: FakeResizeObserver,
      configurable: true,
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      value: 120,
      configurable: true,
    });
    try {
      const { unmount } = render(<App />);
      expect(document.documentElement.style.getPropertyValue("--bar-height")).toBe("120px");
      unmount();
      expect(document.documentElement.style.getPropertyValue("--bar-height")).toBe("");
    } finally {
      Reflect.deleteProperty(window, "ResizeObserver");
      Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
    }
  });

  describe("the person's own values", () => {
    const PREMIUM = /^Recargo P2P por pagar con Payoneer/;
    const premiumDetails = (status: string) =>
      screen.getByText("Detalles", {
        selector: `[aria-label="${status}. Detalles de Recargo P2P por pagar con Payoneer"]`,
        exact: false,
      });

    it("marks a 0 typed by hand in the P2P premium as the person's value", async () => {
      const { type, openCard, ranking } = setup();
      await fillEverything(type);
      await openCard("Binance P2P + Bitso");
      expect(premiumDetails("Lo definís vos")).toBeInTheDocument();
      await type(PREMIUM, "0");
      expect(within(premiumDetails("Tu valor")).getByText("Tu valor")).toBeVisible();
      expect(
        screen.getByText("Pusiste tu valor. El de referencia es 0 %.", {
          normalizer: getDefaultNormalizer({ collapseWhitespace: true }),
        }),
      ).toBeInTheDocument();
      const binance = ranking().find((item) => item.includes("Binance"));
      expect(binance).not.toContain("poné tu valor");
      expect(binance).toContain("Con tu valor: recargo P2P por pagar con Payoneer.");
      expect(
        screen.getByText("Binance P2P + Bitso", { selector: ".route-card-title" }).nextSibling,
      ).toHaveTextContent("Ajustar comisiones · 1 con tu valor");
    });

    it("makes a fee the person's own when they type over it the value already there", async () => {
      const { user, field, openCard } = setup();
      await openCard("Binance P2P + Bitso");
      await user.tripleClick(field(PREMIUM));
      await user.keyboard("0");
      expect(field(PREMIUM)).toHaveValue("0");
      expect(premiumDetails("Tu valor")).toBeInTheDocument();
    });

    it("makes a fee the person's own when only its minimum is edited", async () => {
      const { type, openCard } = setup();
      await openCard("ARQ (ex DolarApp)");
      await type(/^Retiro de Payoneer a una cuenta de EE.UU.: mínimo/, "0");
      expect(
        screen.getByText("Detalles", {
          selector:
            '[aria-label="Tu valor. Detalles de Retiro de Payoneer a una cuenta de EE.UU."]',
          exact: false,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Pusiste tu valor. El de referencia es 4 %, mínimo 20 USD.", {
          normalizer: getDefaultNormalizer({ collapseWhitespace: true }),
        }),
      ).toBeInTheDocument();
    });

    it("remembers the amount and the fees the person set, but not the prices", async () => {
      const first = setup();
      await fillEverything(first.type);
      await first.openCard("Binance P2P + Bitso");
      await first.type(/^Comisión taker del libro de órdenes de Bitso/, "0,5");
      cleanup();

      const again = setup();
      expect(again.field(/^Monto en Payoneer/)).toHaveValue("1000");
      expect(again.field(/^Dólar MEP \(compra\)/)).toHaveValue("");
      // The amount came back filled, so its help is hidden; the empty price still shows its own.
      expect(document.getElementById("amount-help")).toHaveClass("visually-hidden");
      expect(document.getElementById("price-mep-help")).not.toHaveClass("visually-hidden");
      expect(
        screen.getByText(
          "Punto para miles y coma para decimales (1.536,16). El monto queda guardado en este navegador; las cotizaciones no.",
        ),
      ).toBeVisible();
      await again.openCard("Binance P2P + Bitso");
      expect(again.field(/^Comisión taker del libro de órdenes de Bitso/)).toHaveValue("0,5");
      expect(
        screen.getByText("Detalles", {
          selector:
            '[aria-label="Tu valor. Detalles de Comisión taker del libro de órdenes de Bitso"]',
          exact: false,
        }),
      ).toBeInTheDocument();
      // The fees the person did not touch are still the researched ones.
      expect(premiumDetails("Lo definís vos")).toBeInTheDocument();
    });

    it("resets the fees only after a confirmation, and can be cancelled", async () => {
      const { user, type, field, openCard } = setup();
      expect(
        screen.queryByRole("button", { name: "Restablecer valores de referencia" }),
      ).toBeNull();
      await type(/^Monto en Payoneer/, "1000");
      await openCard("Binance P2P + Bitso");
      await type(PREMIUM, "0,1");
      await type(/^Comisión taker del libro de órdenes de Bitso/, "0,5");

      const reset = () => screen.getByRole("button", { name: "Restablecer valores de referencia" });
      await user.click(reset());
      const question = screen.getByText(
        "¿Volver las 2 comisiones con tu valor a los valores de referencia? Lo que pusiste se borra.",
      );
      expect(question).toHaveFocus();
      await user.click(screen.getByRole("button", { name: "Cancelar" }));
      expect(reset()).toHaveFocus();
      expect(field(PREMIUM)).toHaveValue("0,1");

      await user.click(reset());
      await user.click(screen.getByRole("button", { name: "Sí, restablecer" }));
      expect(field(PREMIUM)).toHaveValue("0");
      expect(field(/^Comisión taker del libro de órdenes de Bitso/)).toHaveValue("0,6");
      expect(premiumDetails("Lo definís vos")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(
        "Listo: las comisiones volvieron a los valores de referencia.",
      );
      expect(screen.getByRole("status")).toHaveFocus();
      // What is kept is the amount alone.
      expect(JSON.parse(localStorage.getItem("cuanto-cuesta:form") ?? "")).toMatchObject({
        amount: "1000",
        fees: {},
      });
    });

    it("puts one fee back to its reference value from its Detalles", async () => {
      const { user, type, field, openCard, ranking } = setup();
      await fillEverything(type);
      await openCard("Binance P2P + Bitso");
      await type(PREMIUM, "0,5");
      await type(/^Comisión taker de Binance P2P/, "0,07");
      await user.click(premiumDetails("Tu valor"));
      await user.click(
        screen.getByRole("button", {
          name: "Volver al valor de referencia: Recargo P2P por pagar con Payoneer",
        }),
      );
      expect(field(PREMIUM)).toHaveValue("0");
      expect(field(PREMIUM)).toHaveFocus();
      expect(premiumDetails("Lo definís vos")).toBeInTheDocument();
      const binance = ranking().find((item) => item.includes("Binance"));
      expect(binance).toContain("Recargo P2P por pagar con Payoneer: está en 0 %, poné tu valor.");
      // The other fee stays the person's own, on screen and in storage.
      expect(binance).toContain("Con tu valor: comisión taker de Binance P2P.");
      expect(JSON.parse(localStorage.getItem("cuanto-cuesta:form") ?? "")).toMatchObject({
        fees: { binance_p2p_taker: "0,07" },
      });
      expect(localStorage.getItem("cuanto-cuesta:form")).not.toContain("p2p_premium");
    });

    it("puts a fee's minimum back too", async () => {
      const { user, type, field, openCard } = setup();
      await openCard("ARQ (ex DolarApp)");
      await type(/^Retiro de Payoneer a una cuenta de EE.UU. \(%\)/, "2");
      await type(/^Retiro de Payoneer a una cuenta de EE.UU.: mínimo/, "0");
      await user.click(
        screen.getByText("Detalles", {
          selector:
            '[aria-label="Tu valor. Detalles de Retiro de Payoneer a una cuenta de EE.UU."]',
          exact: false,
        }),
      );
      await user.click(
        screen.getByRole("button", {
          name: "Volver al valor de referencia: Retiro de Payoneer a una cuenta de EE.UU.",
        }),
      );
      expect(field(/^Retiro de Payoneer a una cuenta de EE.UU. \(%\)/)).toHaveValue("4");
      expect(field(/^Retiro de Payoneer a una cuenta de EE.UU.: mínimo/)).toHaveValue("20");
      expect(
        screen.getByText("Detalles", {
          selector:
            '[aria-label="Estimado. Detalles de Retiro de Payoneer a una cuenta de EE.UU."]',
          exact: false,
        }),
      ).toBeInTheDocument();
      expect(localStorage.getItem("cuanto-cuesta:form")).toBeNull();
    });

    it("does not bring back an old question after a fee is put back on its own", async () => {
      const { user, type, openCard } = setup();
      await openCard("Binance P2P + Bitso");
      await type(PREMIUM, "0,5");
      await user.click(screen.getByRole("button", { name: "Restablecer valores de referencia" }));
      await user.click(premiumDetails("Tu valor"));
      await user.click(
        screen.getByRole("button", { name: /^Volver al valor de referencia: Recargo P2P/ }),
      );
      await type(/^Comisión taker de Binance P2P/, "0,07");
      expect(screen.queryByText(/^¿Volver/)).toBeNull();
      expect(
        screen.getByRole("button", { name: "Restablecer valores de referencia" }),
      ).toBeVisible();
    });

    it("does not bring back an old Listo after a fee is put back on its own", async () => {
      const { user, type, openCard } = setup();
      await openCard("Binance P2P + Bitso");
      await type(PREMIUM, "0,5");
      await user.click(screen.getByRole("button", { name: "Restablecer valores de referencia" }));
      await user.click(screen.getByRole("button", { name: "Sí, restablecer" }));
      expect(screen.getByRole("status")).toHaveTextContent(/^Listo/);
      await type(PREMIUM, "0,5");
      await user.click(premiumDetails("Tu valor"));
      await user.click(
        screen.getByRole("button", { name: /^Volver al valor de referencia: Recargo P2P/ }),
      );
      expect(screen.queryByText(/^Listo/)).toBeNull();
    });

    it("stops a field at the length storage keeps, so nothing is lost on reload", async () => {
      const first = setup();
      await first.user.type(first.field(/^Monto en Payoneer/), "1".repeat(70));
      expect(first.field(/^Monto en Payoneer/)).toHaveValue("1".repeat(64));
      cleanup();
      const again = setup();
      expect(again.field(/^Monto en Payoneer/)).toHaveValue("1".repeat(64));
    });

    it("keeps working where the browser blocks site data", async () => {
      const blocked = () => {
        throw new DOMException("blocked", "SecurityError");
      };
      const original = Object.getOwnPropertyDescriptor(window, "localStorage");
      Object.defineProperty(window, "localStorage", { get: blocked, configurable: true });
      try {
        const { type, ranking } = setup();
        await fillEverything(type);
        expect(ranking()[0]).toContain("Binance P2P + Bitso");
      } finally {
        if (original === undefined) {
          Reflect.deleteProperty(window, "localStorage");
        } else {
          Object.defineProperty(window, "localStorage", original);
        }
      }
    });
  });
});
