/**
 * The calculator bundles its own copy of the fee defaults and routes. This test keeps that copy
 * identical to `backend/config/fees.yaml` and `backend/config/routes.yaml`, the researched source.
 *
 * The YAML is read with the failsafe schema, so every scalar stays a string: numbers are compared
 * as decimals and never pass through a float.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { FEE_DEFAULTS } from "../src/calculator/data/fees.ts";
import { ROUTES } from "../src/calculator/data/routes.ts";
import { Decimal } from "../src/calculator/money.ts";

type Yaml = string | Yaml[] | { [key: string]: Yaml };

function load(name: string): Record<string, Yaml> {
  const path = join(import.meta.dirname, "..", "..", "backend", "config", name);
  return parse(readFileSync(path, "utf8"), { schema: "failsafe" }) as Record<string, Yaml>;
}

function list(value: Yaml | undefined): Record<string, Yaml>[] {
  if (!Array.isArray(value)) {
    throw new Error("Expected a YAML list");
  }
  return value as Record<string, Yaml>[];
}

function text(value: Yaml | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function yamlFee(entry: Record<string, Yaml>) {
  const minimum = entry.minimum as Record<string, Yaml> | undefined;
  return {
    id: text(entry.id),
    label: text(entry.label),
    note: text(entry.note),
    kind: text(entry.kind),
    value: new Decimal(text(entry.value) ?? "NaN").toString(),
    currency: text(entry.currency),
    minimum:
      minimum === undefined
        ? null
        : `${new Decimal(text(minimum.amount) ?? "NaN").toString()} ${text(minimum.currency) ?? ""}`,
    status: text(entry.status),
    url: text(entry.source_url),
    date: text(entry.verified_at),
    upperBound: text(entry.upper_bound) === "true",
  };
}

function bundledFee(entry: (typeof FEE_DEFAULTS)[number]) {
  const { fee, provenance } = entry;
  const minimum = fee.kind === "percent" ? fee.minimum : null;
  let status: string, url: string, date: string, upperBound: boolean;
  switch (provenance.kind) {
    case "verified":
      [status, url, date, upperBound] = [
        "verified",
        provenance.sourceUrl,
        provenance.verifiedAt,
        false,
      ];
      break;
    case "estimate":
      [status, url, date, upperBound] = [
        "pending",
        provenance.sourceUrl,
        provenance.verifiedAt,
        provenance.upperBound,
      ];
      break;
    case "user_defined":
      [status, url, date, upperBound] = [
        "user_defined",
        provenance.referenceUrl,
        provenance.checkedAt,
        false,
      ];
      break;
  }
  return {
    id: fee.id,
    label: entry.label,
    note: entry.note,
    kind: fee.kind,
    value: (fee.kind === "fixed" ? fee.amount.amount : fee.rate).toString(),
    currency: fee.kind === "fixed" ? fee.amount.currency : null,
    minimum: minimum === null ? null : `${minimum.amount.toString()} ${minimum.currency}`,
    status,
    url,
    date,
    upperBound,
  };
}

const FEE_KEYS = [
  "id",
  "label",
  "kind",
  "value",
  "currency",
  "minimum",
  "upper_bound",
  "status",
  "verified_at",
  "source_url",
  "note",
];
const ROUTE_KEYS = ["id", "name", "source", "target", "warnings", "steps"];
const STEP_KEYS = ["label", "fees", "conversion"];
const CONVERSION_KEYS = ["rate", "to"];

function unknownKeys(entries: Record<string, Yaml>[], known: readonly string[]): string[] {
  return entries.flatMap((entry) => Object.keys(entry).filter((key) => !known.includes(key)));
}

describe("the bundled data mirrors the backend config", () => {
  // A new key in the YAML would be silently ignored by the comparison below; fail instead, so
  // the calculator's copy gets the new field too.
  it("uses only keys the comparison knows", () => {
    const feesFile = load("fees.yaml");
    const routesFile = load("routes.yaml");
    const routes = list(routesFile.routes);
    const steps = routes.flatMap((r) => list(r.steps));
    const conversions = steps.flatMap((step) =>
      step.conversion === undefined ? [] : [step.conversion as Record<string, Yaml>],
    );
    expect(unknownKeys([feesFile], ["fees"])).toEqual([]);
    expect(unknownKeys([routesFile], ["routes"])).toEqual([]);
    expect(unknownKeys(list(feesFile.fees), FEE_KEYS)).toEqual([]);
    expect(unknownKeys(routes, ROUTE_KEYS)).toEqual([]);
    expect(unknownKeys(steps, STEP_KEYS)).toEqual([]);
    expect(unknownKeys(conversions, CONVERSION_KEYS)).toEqual([]);
  });

  it("has the same fees as fees.yaml, in the same order", () => {
    expect(FEE_DEFAULTS.map(bundledFee)).toEqual(list(load("fees.yaml").fees).map(yamlFee));
  });

  it("has the same routes as routes.yaml", () => {
    const fromYaml = list(load("routes.yaml").routes).map((route) => ({
      id: text(route.id),
      name: text(route.name),
      source: text(route.source),
      target: text(route.target),
      warnings: route.warnings === undefined ? [] : (route.warnings as string[]),
      steps: list(route.steps).map((step) => {
        const conversion = step.conversion as Record<string, Yaml> | undefined;
        return {
          label: text(step.label),
          feeIds: step.fees === undefined ? [] : (step.fees as string[]),
          conversion:
            conversion === undefined
              ? null
              : { rateKey: text(conversion.rate), target: text(conversion.to) },
        };
      }),
    }));
    expect(ROUTES).toEqual(fromYaml);
  });
});
