import { describe, expect, it } from "vitest";

import { splitLinks } from "./links.ts";

describe("splitLinks", () => {
  it("leaves text without URLs alone", () => {
    expect(splitLinks("Sin links.")).toEqual([{ kind: "text", text: "Sin links." }]);
  });

  it("keeps closing punctuation out of the URL", () => {
    expect(splitLinks("Ver (https://a.com/x); después https://b.com.")).toEqual([
      { kind: "text", text: "Ver (" },
      { kind: "link", url: "https://a.com/x" },
      { kind: "text", text: "); después " },
      { kind: "link", url: "https://b.com" },
      { kind: "text", text: "." },
    ]);
  });

  it("handles a URL at the end", () => {
    expect(splitLinks("Texto: https://www.bcra.gob.ar/Pdfs/comytexord/A8481.pdf")).toEqual([
      { kind: "text", text: "Texto: " },
      { kind: "link", url: "https://www.bcra.gob.ar/Pdfs/comytexord/A8481.pdf" },
    ]);
  });
});
