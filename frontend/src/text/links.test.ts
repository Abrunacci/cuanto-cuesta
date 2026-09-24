import { describe, expect, it } from "vitest";

import { splitLinks } from "./links.ts";

describe("splitLinks", () => {
  it("leaves text without URLs alone", () => {
    expect(splitLinks("Sin links.")).toEqual([{ kind: "text", text: "Sin links." }]);
  });

  it("keeps closing punctuation out of the URL", () => {
    expect(splitLinks("Ver (https://a.com/x); después https://b.com.")).toEqual([
      { kind: "text", text: "Ver (" },
      { kind: "link", url: "https://a.com/x", text: null },
      { kind: "text", text: "); después " },
      { kind: "link", url: "https://b.com", text: null },
      { kind: "text", text: "." },
    ]);
  });

  it("handles a URL at the end", () => {
    expect(splitLinks("Texto: https://www.bcra.gob.ar/Pdfs/comytexord/A8481.pdf")).toEqual([
      { kind: "text", text: "Texto: " },
      { kind: "link", url: "https://www.bcra.gob.ar/Pdfs/comytexord/A8481.pdf", text: null },
    ]);
  });

  it("reads a Markdown link as a phrase that links", () => {
    expect(splitLinks("Atención: [Verificá las reglas](https://a.com/n.pdf). Fin")).toEqual([
      { kind: "text", text: "Atención: " },
      { kind: "link", url: "https://a.com/n.pdf", text: "Verificá las reglas" },
      { kind: "text", text: ". Fin" },
    ]);
  });
});
