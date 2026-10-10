import assert from "node:assert/strict";
import { test } from "node:test";
import type { CatalogIndexRow } from "../src/catalog-types";
import { catalogFacets, filterRows, offeringId, providerSlug } from "../src/lib/catalog";
import { getOfficialModels, officialProviders } from "../scripts/lib/official";
import { contentVersion } from "../scripts/lib/upstream";

function row(overrides: Partial<CatalogIndexRow>): CatalogIndexRow {
  return {
    id: "model",
    provider: "acme",
    name: "Model",
    owned_by: "acme",
    family: null,
    canonical_id: null,
    status: "active",
    released: null,
    updated: null,
    context: 128_000,
    max_output: 8_000,
    price: { input: 1, output: 2 },
    input: ["text"],
    output: ["text"],
    apis: ["chat_completions"],
    reasoning: false,
    reasoning_efforts: [],
    reasoning_budget: null,
    tool_call: true,
    structured_output: null,
    open_weights: null,
    sources: ["models.dev"],
    ...overrides,
  };
}

const rows = [
  row({ id: "a", name: "Alpha Vision", input: ["text", "image"], reasoning: true }),
  row({ id: "b", provider: "beta", context: 1_000_000, price: { input: 0, output: 0 } }),
  row({ id: "c", status: "deprecated" }),
  row({ id: "d", price: null }),
];
const providers = { acme: { name: "Acme Cloud", docs_url: null } };

test("filterRows hides deprecated by default", () => {
  assert.deepEqual(
    filterRows(rows, {}).map((item) => item.id),
    ["a", "b", "d"],
  );
});

test("filterRows matches provider display name and all terms", () => {
  assert.deepEqual(
    filterRows(rows, { q: "acme vision" }, providers).map((item) => item.id),
    ["a"],
  );
});

test("filterRows applies modality, reasoning, context and price filters", () => {
  assert.deepEqual(filterRows(rows, { inputModality: "IMAGE" }).map((r) => r.id), ["a"]);
  assert.deepEqual(filterRows(rows, { reasoning: true }).map((r) => r.id), ["a"]);
  assert.deepEqual(filterRows(rows, { minContext: 1_000_000 }).map((r) => r.id), ["b"]);
  // 无价格的记录不应通过价格上限筛选
  assert.deepEqual(filterRows(rows, { maxInputPrice: 0 }).map((r) => r.id), ["b"]);
});

test("catalogFacets counts providers with display names", () => {
  const facets = catalogFacets(rows, providers);
  assert.deepEqual(facets.providers[0], { id: "acme", name: "Acme Cloud", count: 3 });
  assert.deepEqual(facets.providers[1], { id: "beta", name: "beta", count: 1 });
});

test("offeringId and providerSlug are stable", () => {
  assert.equal(offeringId(rows[0]!), "acme/a");
  assert.equal(providerSlug("Some Provider/x"), "some-provider-x");
});

test("contentVersion ignores retrieval timestamps", () => {
  const base = { id: "x", provenance: { verified_at: "2026-01-01", sources: [{ retrieved_at: "a" }] } };
  const later = { id: "x", provenance: { verified_at: "2026-02-01", sources: [{ retrieved_at: "b" }] } };
  assert.equal(contentVersion(base), contentVersion(later));
  assert.notEqual(contentVersion(base), contentVersion({ ...base, id: "y" }));
});

test("official views exist for every official provider", () => {
  assert.ok(getOfficialModels().length > 0);
  for (const provider of officialProviders) {
    const models = getOfficialModels(provider);
    assert.ok(models.length > 0, provider);
    assert.ok(models.every((model) => model.provider?.id === provider));
  }
});
