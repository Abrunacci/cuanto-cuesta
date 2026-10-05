/** Everything the screen says, in Spanish, the page's default language. See `texts.ts`. */

import type { AgeParts, MarketTime } from "../quotes/freshness.ts";
import { ageParts } from "../quotes/freshness.ts";
import { numbersIn, SPANISH_NUMBERS } from "../text/numbers.ts";
import type { Texts } from "./texts.ts";

/** No-break space: a number never ends up on a different line from its unit. */
const NBSP = "\u00a0";

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const count = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** "45 min", "2 h 10 min", "3 h 05 min", "3 h"; from a day on, "1 día", "2 días". */
function age(parts: AgeParts): string {
  if (parts.kind === "days") {
    return count(parts.days, "día", "días");
  }
  const { hours, minutes } = parts;
  if (hours === 0) {
    return `${String(minutes)} min`;
  }
  return minutes === 0
    ? `${String(hours)} h`
    : `${String(hours)} h ${String(minutes).padStart(2, "0")} min`;
}

/** "17:00", "10:45". */
const clock = ({ hour, minute }: MarketTime) =>
  `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

const weekday = ({ weekday: day }: MarketTime) => WEEKDAYS[day] ?? "";

/** Where to check each price, after "Revisalo". */
const WHERE: Readonly<Record<string, string>> = {
  mep: "en tu banco o broker",
  binance_p2p_usdt_usd: "en Binance P2P",
  bitso_usdt_ars: "en Bitso",
  arq_usd_ars: "en ARQ",
};

const heldCard = (held: string | null) =>
  held === null
    ? ""
    : ` La última lectura dio ${held}, muy distinta de este estimado, y todavía no la usamos.`;

export const es: Texts = {
  language: "es",
  numbers: numbersIn(SPANISH_NUMBERS),
  list: (items) =>
    items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items.at(-1) ?? ""}`,
  listSeparator: (index, total) => (index === 0 ? "" : index === total - 1 ? " y " : ", "),

  page: {
    lead: "Compará cuántos pesos te llegan al banco al bajar tus dólares de Payoneer.",
    description:
      "Compará cuántos pesos te llegan al banco al bajar tus dólares de Payoneer por Binance, ARQ o dólar MEP.",
    languageGroup: "Idioma",
    newTab: (label) => `${label} (se abre en otra pestaña)`,
    feesTitle: "Comisiones de cada ruta",
    feesIntro:
      "Vienen cargadas con los valores investigados. Abrí una ruta para ajustarlas: lo que pongas queda guardado en este navegador.",
  },

  inputs: {
    title: "Tus datos",
    intro: (prefilled) =>
      prefilled
        ? "Punto para miles y coma para decimales (1.536,16). El monto queda guardado en este navegador. Las cotizaciones vienen cargadas con el último precio que conseguimos; podés cambiarlas."
        : "Punto para miles y coma para decimales (1.536,16). El monto queda guardado en este navegador; las cotizaciones no.",
    amountLabel: "Monto en Payoneer",
    amountHelp: "Los dólares de tu cuenta de Payoneer que querés pasar a pesos.",
    amountPlaceholder: "Ej.: 1.000",
  },

  routes: {
    binance_card_bitso: { name: "Binance con tarjeta + Bitso", warnings: [] },
    binance_p2p_bitso: {
      name: "Binance P2P + Bitso",
      warnings: [
        "Pagar P2P con Payoneer puede hacer que Binance bloquee tu cuenta. El precio P2P es el de la oferta genérica USDT/USD.",
      ],
    },
    arq: { name: "ARQ (ex DolarApp)", warnings: [] },
    mep: {
      name: "Dólar MEP",
      warnings: [
        "[Verificá las restricciones sobre el dólar MEP](https://www.bcra.gob.ar/Pdfs/comytexord/A8481.pdf)",
      ],
    },
  },

  steps: {
    card_buy: "Comprar USDT con la tarjeta de Payoneer en Binance",
    usdt_to_bitso: "Retirar USDT a Bitso por Polygon",
    bitso_sell: "Vender USDT por ARS en Bitso",
    ars_to_bank: "Retirar ARS al banco",
    p2p_sell: "Vender USD por USDT en Binance P2P",
    payoneer_to_arq: "Retirar de Payoneer a ARQ",
    arq_ach: "ARQ recibe la transferencia ACH",
    arq_convert: "Convertir USDc a ARS en ARQ",
    payoneer_to_bank: "Retirar de Payoneer a una cuenta argentina en USD",
    bank_credit: "El banco acredita la transferencia",
    mep_bonds: "Comprar AL30D y vender AL30",
  },

  risks: {
    account_block: {
      label: "Riesgo de bloqueo",
      mark: "riesgo",
      detail: "con riesgo de bloqueo de tu cuenta de Binance",
    },
  },

  rates: {
    mep: {
      label: "Dólar MEP (compra)",
      shortLabel: "MEP",
      help: "Lo que te pagan por cada dólar vendido por MEP. Lo ves en tu banco o broker.",
      unit: "ARS por USD",
    },
    binance_p2p_usdt_usd: {
      label: "Precio P2P en Binance (USD por USDT)",
      shortLabel: "precio P2P",
      help: "En Binance P2P, cuántos USD cuesta cada USDT en los avisos para comprar.",
      unit: "USD por USDT",
    },
    bitso_usdt_ars: {
      label: "Precio de venta en Bitso (ARS por USDT)",
      shortLabel: "precio Bitso",
      help: "En Bitso, cuántos pesos te dan por cada USDT que vendés.",
      unit: "ARS por USDT",
    },
    arq_usd_ars: {
      label: "Cotización de ARQ (ARS por USDc)",
      shortLabel: "cotización ARQ",
      help: "En la app de ARQ, cuántos pesos te dan por cada dólar digital (USDc).",
      unit: "ARS por USDc",
    },
    binance_card_usd_usdt: {
      label: "Binance con tarjeta (USDT por USD)",
      shortLabel: "precio con tarjeta",
      help: "En Binance, Comprar con tarjeta: el precio de la pantalla final de pago (1 USD ≈ … USDT), antes de confirmar. No uses lo que recibís dividido lo que pagás (ya descuenta la comisión) ni el de la lista de métodos de pago (es más alto que el real).",
      unit: "USDT por USD",
    },
  },

  // Kept equal to the label and note of each fee in backend/config/fees.yaml (a test checks).
  fees: {
    binance_card_purchase: {
      label: "Comisión de Binance por comprar con tarjeta",
      note: 'Binance dice "hasta alrededor de 2 %". Observado el 25/09/2026 en la pantalla final de pago, antes de confirmar la compra: 0,20 USD con 10 USD y 2,00 USD con 100 USD. Si tu pantalla final muestra otra comisión, poné la tuya. En compras propias, Payoneer debita siempre exactamente el monto en USD que se carga en Binance: la tarjeta no suma cargos (última observación: 25/09/2026).',
    },
    payoneer_p2p_transfer: {
      label: "Transferencia de Payoneer al comprador P2P",
      note: "Hasta 4,00 USD si las dos cuentas son del mismo país; hasta 1 % más hasta 4,00 USD si son de países distintos.",
    },
    p2p_premium: {
      label: "Recargo P2P por pagar con Payoneer",
      note: "El precio P2P en vivo no filtra por medio de pago y no se encontraron ofertas públicas que acepten Payoneer. Poné cuánto más pagás realmente sobre ese precio.",
    },
    binance_p2p_taker: {
      label: "Comisión taker de Binance P2P",
      note: "Entre 0,06 y 0,08 USDT por orden; el anuncio no dice cuál corresponde a USD.",
    },
    binance_withdrawal_polygon: {
      label: "Retiro de USDT de Binance por Polygon",
      note: "Es la red más barata que acepta Bitso. Binance cambia esta comisión seguido.",
    },
    bitso_usdt_deposit: {
      label: "Depósito de USDT en Bitso",
      note: null,
    },
    bitso_taker: {
      label: "Comisión taker del libro de órdenes de Bitso",
      note: "Nivel base, con menos de ARS 1.625.000 de volumen en 30 días; en niveles más altos baja hasta 0,15 %.",
    },
    bitso_ars_withdrawal: {
      label: "Retiro de ARS de Bitso a CBU/CVU",
      note: null,
    },
    payoneer_us_withdrawal: {
      label: "Retiro de Payoneer a una cuenta de EE.UU.",
      note: "Entre 1,2 % y 4 % para titulares argentinos, con un mínimo de hasta 20,00 USD. Los valores exactos solo se ven dentro de la cuenta; si no te cobran mínimo, ponelo en 0.",
    },
    arq_ach_deposit: {
      label: "Recepción de ACH en ARQ",
      note: null,
    },
    arq_usd_usdc_conversion: {
      label: "Conversión USD→USDc en ARQ",
      note: 'ARQ acredita los USD que llegan por ACH directamente como USDc, pero no publica la tasa de esa conversión y no se encontró ningún spread documentado. La única comisión publicada para depósitos en USD es la fija de 3 USDc, en el plan Standard (https://help.arqfinance.com/es/articles/16785194-costes-y-comisiones-de-arq-argentina); los términos dicen "al valor equivalente en Dólares Digitales", sin dar la tasa (https://www.arqfinance.com/es-AR/legal/terminos_y_condiciones_cuenta_global_arg, punto 3.1).',
    },
    arq_ars_withdrawal: {
      label: "Retiro de ARS de ARQ a CBU",
      note: null,
    },
    payoneer_ar_withdrawal: {
      label: "Retiro de Payoneer a una cuenta argentina en USD",
      note: '"Hasta 2 %" según esta página; otra página de Payoneer dice 3,3 % de punta a punta para Santander (https://pages.payoneer.com/es/withdrawal-of-funds/).',
    },
    bank_usd_credit: {
      label: "Comisión del banco por acreditar la transferencia",
      note: "Los bancos no pueden cobrar por estas operaciones (vigente desde el 15/09/2026).",
    },
    broker_buy: {
      label: "Comisión del broker, compra de AL30D",
      note: 'Balanz, "hasta 0,05 %" en bonos soberanos. Depende de tu broker o banco.',
    },
    broker_sell: {
      label: "Comisión del broker, venta de AL30",
      note: 'Balanz, "hasta 0,05 %" en bonos soberanos. Depende de tu broker o banco.',
    },
    byma_buy: {
      label: "Derechos de mercado BYMA, compra de AL30D",
      note: "Se cobra en cada punta de la operación MEP.",
    },
    byma_sell: {
      label: "Derechos de mercado BYMA, venta de AL30",
      note: "Se cobra en cada punta de la operación MEP.",
    },
  },

  problems: {
    notANumber: "Escribí un número, por ejemplo 1.234,56.",
    notPositive: "Tiene que ser mayor que 0.",
    tooManyDecimals: (max) => `Usá como mucho ${String(max)} decimales.`,
    tooLarge: (max) => `No puede ser más de ${max}.`,
    negative: "No puede ser negativo.",
    aboveCap: (cap, unit) => `Como máximo ${cap} ${unit}.`,
    unusualPrice: (value, unit, min, max) =>
      `Valor inusual: leímos ${value} ${unit} y lo común está entre ${min} y ${max}. Revisalo.`,
    didYouMean: (value) => `¿Quisiste poner ${value}?`,
    read: (value, unit) => `Leímos ${value} ${unit}.`,
  },

  missing: {
    amount: "monto en USD",
    amountShort: "monto",
    feeMinimum: (fee) => `el mínimo de ${fee}`,
    feeAndMinimum: (fee) => `${fee} y su mínimo`,
  },

  feeStatus: {
    verified: "Verificado",
    estimate: "Estimado",
    userDefined: "Lo definís vos",
    own: "Tu valor",
  },

  referenceValue: (value, minimum) => (minimum === null ? value : `${value}, mínimo ${minimum}`),

  summary: {
    amountProblem: "Revisá el monto: tiene un valor que no se puede usar.",
    allFailed:
      "No se puede calcular ninguna ruta: hay un problema con las cotizaciones o comisiones que usan. No es un error en lo que cargaste.",
    noneYet: "Todavía ninguna ruta se puede calcular: mirá qué le falta a cada una.",
    completeAmount: "Completá el monto para comparar las rutas.",
    completeAmountAndRates: "Completá el monto y las cotizaciones para comparar las rutas.",
    estimateMark: ", con precio estimado",
    alone: (route, arrives) => `Por ahora solo se puede calcular ${route}: ${arrives}.`,
    best: (route, arrives, by, other) =>
      `Mejor ruta: ${route}, ${arrives}: ${by} más que ${other}.`,
    unrivaled: (route, arrives) => `Mejor ruta: ${route}, ${arrives}.`,
    tied: (routes, arrives) => `Empatan ${routes}: ${arrives}.`,
    risky: (route, arrives, risk) =>
      `Por ahora solo se pueden calcular rutas con riesgo: ${route}, ${arrives}, ${risk}.`,
    riskyOver: (route, by, risk) => `${route} deja ${by} más, ${risk}.`,
    arrives: (amount) => `llegan ${amount}`,
  },

  bar: {
    name: "Resumen del resultado",
    leads: {
      best: { full: "Mejor ruta", short: "Mejor" },
      tied: { full: "Empatan", short: "Empate" },
      alone: { full: "Única ruta calculada", short: "Única" },
      risky: { full: "Solo con riesgo", short: "Solo con riesgo" },
    },
    arrives: (amount) => `Llegan ${amount}`,
    review: "revisá",
    reviewDetail: "los valores de esta ruta.",
    estimated: "precio estimado",
    estimatedShort: "estimado",
    seeResult: "Ver resultado",
    allFailed: "Ninguna ruta se puede calcular",
    amountProblem: "Revisá: monto",
    noneYet: "Mirá qué le falta a cada ruta",
    missing: (list) => `Falta completar: ${list}.`,
    missingShort: (list) => `Falta: ${list}`,
  },

  results: {
    title: "Resultado",
    missingTitle: "Falta completar o corregir:",
    routeMissingDone: "Se calcula cuando completes lo de arriba.",
    failedRoute:
      "No se puede calcular esta ruta: hay un problema con las cotizaciones o comisiones que usa. No es un error en lo que cargaste.",
    arrives: "Llegan al banco",
    fees: "Comisiones",
    difference: "Diferencia",
    aloneDifference: "Todavía no hay otra ruta para comparar",
    unrivaledDifference: "Única ruta sin riesgo",
    more: (other) => `más que ${other}`,
    less: (other) => `menos que ${other}`,
    same: (other) => `Igual que ${other}`,
    review: "revisá",
    reviewLabel: (route) => `Revisá los valores de ${route}`,
    unusual: (prices) => `Calculado con un valor inusual: ${prices}.`,
    exhausted: "Las comisiones se comen todo el monto en algún paso.",
    attention: "Atención:",
    estimateBadge: "Precio estimado",
  },

  review: {
    valuesToSet: (n) => count(n, "valor para poner", "valores para poner"),
    estimatedFees: (n) => count(n, "comisión estimada", "comisiones estimadas"),
    whatToCheck: (parts) => `Qué revisar: ${parts}`,
    ownFees: (n) => `Con tu valor: ${count(n, "comisión", "comisiones")}`,
    toSet: (value) => `: está en ${value}, poné tu valor.`,
    estimated: (n) =>
      n === 1
        ? { before: "Incluye una comisión estimada: ", after: ". Revisala si sabés la tuya." }
        : { before: "Incluye comisiones estimadas: ", after: ". Revisalas si sabés las tuyas." },
    own: "Con tu valor:",
  },

  cards: {
    adjust: "Ajustar comisiones",
    ownCount: (n) => (n === 0 ? "" : ` · ${String(n)} con tu valor`),
    convertsWith: (rate) => `Convierte con: ${rate}, que cargaste arriba.`,
    setElsewhere: (n) =>
      n === 1 ? "Esta comisión se ajusta en " : "Estas comisiones se ajustan en ",
    details: "Detalles",
    detailsLabel: (status, fee) => `${status}. Detalles de ${fee}`,
    ownValue: (reference) => `Pusiste tu valor. El de referencia es ${reference}.`,
    backToReference: "Volver al valor de referencia",
    backToReferenceLabel: (fee) => `Volver al valor de referencia: ${fee}`,
    minimumLabel: (fee) => `${fee}: mínimo`,
    minimumHelp: "Se cobra este mínimo cuando el porcentaje da menos. Si no te lo cobran, poné 0.",
  },

  provenance: {
    verified: (date) => `Verificado el ${date}`,
    reviewed: (date) => `Revisado el ${date}`,
    upperBound: "La fuente da un tope: es el valor máximo. ",
    source: "Fuente",
    sourceOf: (fee) => `Fuente de ${fee}`,
    reference: "Precio de referencia",
    referenceOf: (fee) => `Precio de referencia de ${fee}`,
    date: (isoDate) => {
      const [year, month, day] = isoDate.split("-");
      return `${day ?? ""}/${month ?? ""}/${year ?? ""}`;
    },
  },

  reset: {
    button: "Restablecer valores de referencia",
    question: (n) =>
      `¿Volver ${n === 1 ? "la comisión con tu valor" : `las ${String(n)} comisiones con tu valor`} a los valores de referencia? Lo que pusiste se borra.`,
    confirm: "Sí, restablecer",
    cancel: "Cancelar",
    done: "Listo: las comisiones volvieron a los valores de referencia.",
  },

  quotes: {
    age: (milliseconds) => age(ageParts(milliseconds)).replace(/(\d) /g, `$1${NBSP}`),
    stale: (age, key) =>
      `Puede estar desactualizado: es de hace ${age}. Revisalo ${WHERE[key] ?? ""} antes de decidir.`,
    held: (value, key) =>
      `La última lectura dio ${value}, muy distinta de este precio, y todavía no la usamos. Revisalo ${WHERE[key] ?? ""} antes de decidir.`,
    closed: ({ read, readToday, opens, opensOn }) => {
      const day = readToday
        ? "de hoy"
        : `del ${weekday(read)} ${String(read.day)}/${String(read.month)}`;
      const openDay = { today: "hoy", tomorrow: "mañana", later: `el ${weekday(opens)}` }[opensOn];
      return `Cierre ${day} a las ${clock(read)}. El mercado abre ${openDay} a las ${clock(opens)}.`;
    },
    cardField: (value, age, held) =>
      `Mientras no lo cargues, la comparación usa el estimado: ${value}${age === null ? "" : `, de hace ${age}`}.${heldCard(held)}`,
    cardResult: (value, age, held) =>
      `Calculado con el precio estimado de la tarjeta (${value}${age === null ? "" : `, de hace ${age}: puede estar desactualizado`}).${heldCard(held)} Cargá el de tu pantalla de pago de Binance para el valor exacto.`,
  },
};
