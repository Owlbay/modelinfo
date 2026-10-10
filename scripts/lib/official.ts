import { createHash } from "node:crypto";
import type {
  CanonicalModel,
  ListedApiId,
  ModelView,
  ProviderModel,
} from "../../src/catalog-types";
import { officialModels } from "../../data/official/official-models";
import { providerModels } from "../../data/official/provider-models";

const canonicalById = new Map(officialModels.map((model) => [model.id, model]));

function assertUnique(values: string[], label: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function validateSources(owner: string, sources: CanonicalModel["sources"]) {
  if (sources.length === 0) throw new Error(`${owner} has no official source`);
  for (const source of sources) {
    if (!source.url.startsWith("https://")) {
      throw new Error(`${owner} source must use HTTPS: ${source.url}`);
    }
    if (source.fields.length === 0) {
      throw new Error(`${owner} source ${source.id} does not declare covered fields`);
    }
    if (Number.isNaN(Date.parse(source.retrieved_at))) {
      throw new Error(`${owner} source ${source.id} has an invalid retrieved_at`);
    }
  }
}

export function validateOfficialCatalog() {
  assertUnique(officialModels.map((model) => model.id), "canonical model id");
  assertUnique(
    providerModels.map((offering) => `${offering.provider}/${offering.model_id}`),
    "provider model id",
  );

  for (const model of officialModels) {
    validateSources(`model ${model.id}`, model.sources);
    assertUnique(model.supported_apis, `${model.id} API id`);
    if (model.limits.context !== null && model.limits.context <= 0) {
      throw new Error(`${model.id} has an invalid context limit`);
    }
    if (model.limits.max_output !== null && model.limits.max_output <= 0) {
      throw new Error(`${model.id} has an invalid output limit`);
    }
  }

  for (const offering of providerModels) {
    const canonical = canonicalById.get(offering.canonical_id);
    if (!canonical) {
      throw new Error(
        `${offering.provider}/${offering.model_id} references unknown ${offering.canonical_id}`,
      );
    }
    validateSources(`provider model ${offering.provider}/${offering.model_id}`, offering.sources);
    assertUnique(
      offering.supported_apis.map((api) => api.id),
      `${offering.provider}/${offering.model_id} API id`,
    );
    for (const api of offering.supported_apis) {
      if (!api.endpoint.startsWith("/")) {
        throw new Error(`${offering.provider}/${offering.model_id} has an invalid endpoint`);
      }
      if (offering.provider === canonical.owned_by && !canonical.supported_apis.includes(api.id)) {
        throw new Error(
          `${offering.provider}/${offering.model_id} exposes undeclared canonical API ${api.id}`,
        );
      }
    }
  }

  return {
    models: officialModels.length,
    offerings: providerModels.length,
    providers: new Set(providerModels.map((offering) => offering.provider)).size,
  };
}

export const officialCatalogStats = validateOfficialCatalog();

export const officialCatalogVersion = createHash("sha256")
  .update(JSON.stringify({ officialModels, providerModels }))
  .digest("hex")
  .slice(0, 16);

export const officialProviders = [
  ...new Set(providerModels.map((offering) => offering.provider)),
].sort();

function mergedModel(canonical: CanonicalModel, offering?: ProviderModel) {
  return {
    modalities: {
      ...canonical.modalities,
      ...offering?.overrides.modalities,
    },
    limits: {
      ...canonical.limits,
      ...offering?.overrides.limits,
    },
    capabilities: {
      ...canonical.capabilities,
      ...offering?.overrides.capabilities,
    },
  };
}

function endpoints(offering: ProviderModel) {
  return Object.fromEntries(
    offering.supported_apis.map((api) => [api.id, `${api.method} ${api.endpoint}`]),
  ) as Partial<Record<ListedApiId, string>>;
}

function modelView(canonical: CanonicalModel, offering?: ProviderModel): ModelView {
  const merged = mergedModel(canonical, offering);
  const firstParty =
    offering ??
    providerModels.find(
      (candidate) =>
        candidate.provider === canonical.owned_by && candidate.canonical_id === canonical.id,
    );

  return {
    id: offering?.model_id ?? canonical.id,
    object: "model",
    name: canonical.name,
    created: canonical.created,
    owned_by: canonical.owned_by,
    status: canonical.status,
    supported_apis: offering
      ? offering.supported_apis.map((api) => api.id)
      : canonical.supported_apis,
    context: merged.limits.context,
    max_input: merged.limits.max_input,
    max_output: merged.limits.max_output,
    input: merged.modalities.input,
    output: merged.modalities.output,
    capabilities: merged.capabilities,
    price: firstParty?.price ?? null,
    ...(offering
      ? {
          provider: {
            id: offering.provider,
            canonical_id: canonical.id,
            model_id: offering.model_id,
            api_base: offering.api_base,
            endpoints: endpoints(offering),
            params: offering.params,
          },
        }
      : {}),
  };
}

export function getOfficialModels(provider?: string): ModelView[] {
  if (!provider) {
    return officialModels
      .map((model) => modelView(model))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  return providerModels
    .filter((offering) => offering.provider === provider)
    .map((offering) => {
      const canonical = canonicalById.get(offering.canonical_id);
      if (!canonical) throw new Error(`Unknown canonical model: ${offering.canonical_id}`);
      return modelView(canonical, offering);
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function officialSources() {
  const allSources = [
    ...officialModels.flatMap((model) => model.sources),
    ...providerModels.flatMap((offering) => offering.sources),
  ];
  return [...new Map(allSources.map((source) => [source.id, source])).values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
}
