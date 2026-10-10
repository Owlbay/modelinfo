import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { loadCatalog, type LoadedCatalog } from "./api";
import type { CatalogIndexFile, CatalogIndexRow } from "./catalog-types";
import {
  catalogFacets,
  filterRows,
  offeringId,
  visibleRows,
  type CatalogFilter,
} from "./lib/catalog";

type CatalogProvider = CatalogIndexFile["providers"][string];

const PAGE_SIZE = 30;

type FilterState = {
  q: string;
  provider: string;
  modality: string;
  reasoning: boolean;
  context: string;
  price: string;
};

const emptyFilters: FilterState = {
  q: "",
  provider: "",
  modality: "",
  reasoning: false,
  context: "",
  price: "",
};

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m8 10 4 4 4-4" />
    </svg>
  );
}

function formatTokens(value: number | null) {
  if (value === null) return "—";
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(2)}M`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}K`;
  }
  return value.toLocaleString();
}

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function reasoningSummary(model: CatalogIndexRow) {
  if (model.reasoning === false) return "不支持";
  if (model.reasoning === null) return "未确认";
  if (model.reasoning_efforts.length) return model.reasoning_efforts.join(" · ");
  if (model.reasoning_budget) {
    const [min, max] = model.reasoning_budget;
    return `${formatTokens(min)} – ${formatTokens(max)} budget`;
  }
  return "支持";
}

function ModelRow({ model, provider }: { model: CatalogIndexRow; provider?: CatalogProvider }) {
  const inputTypes = model.input;
  const inputPrice = model.price?.input;
  const outputPrice = model.price?.output;

  return (
    <details className="model-row">
      <summary className="model-row__summary">
        <div className="model-name">
          <span className="provider-dot" aria-hidden="true" />
          <div>
            <strong>{model.name}</strong>
            <span>
              {provider?.name ?? model.provider} · <code>{model.id}</code>
            </span>
          </div>
        </div>
        <div className="data-cell">
          <span>上下文</span>
          <strong>{formatTokens(model.context)}</strong>
        </div>
        <div className="data-cell">
          <span>最大输出</span>
          <strong>{formatTokens(model.max_output)}</strong>
        </div>
        <div className="data-cell price-cell">
          <span>输入 / 输出 · $/1M</span>
          <strong>
            {formatPrice(inputPrice)} <i>/</i> {formatPrice(outputPrice)}
          </strong>
        </div>
        <div className="modality-cell" aria-label="输入模态">
          {inputTypes.slice(0, 3).map((type) => (
            <span key={type}>{type}</span>
          ))}
          {inputTypes.length > 3 && <span>+{inputTypes.length - 3}</span>}
        </div>
        <ChevronIcon />
      </summary>

      <div className="model-row__details">
        <dl>
          <div>
            <dt>Offering ID</dt>
            <dd>{offeringId(model)}</dd>
          </div>
          <div>
            <dt>Canonical model</dt>
            <dd>{model.canonical_id ?? "未映射"}</dd>
          </div>
          <div>
            <dt>研发方</dt>
            <dd>{model.owned_by}</dd>
          </div>
          <div>
            <dt>API</dt>
            <dd>{model.apis.join(" · ") || "未确认"}</dd>
          </div>
          <div>
            <dt>思考等级</dt>
            <dd>{reasoningSummary(model)}</dd>
          </div>
          <div>
            <dt>能力</dt>
            <dd>
              {[
                model.tool_call && "tools",
                model.structured_output && "structured output",
                model.open_weights && "open weights",
              ]
                .filter(Boolean)
                .join(" · ") || "未确认"}
            </dd>
          </div>
        </dl>
        <div className="detail-footer">
          <span>
            来源：{model.sources.join(" · ") || "—"}
          </span>
          {provider?.docs_url && (
            <a href={provider.docs_url} target="_blank" rel="noreferrer">
              Provider 文档 ↗
            </a>
          )}
        </div>
      </div>
    </details>
  );
}

function App() {
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [catalog, setCatalog] = useState<LoadedCatalog | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchText = useDeferredValue(filters.q);

  const filter = useMemo<CatalogFilter>(() => {
    const contextMap: Record<string, number> = {
      "32k": 32_000,
      "128k": 128_000,
      "256k": 256_000,
      "1m": 1_000_000,
    };
    const priceMap: Record<string, number> = { free: 0, "1": 1, "5": 5, "15": 15 };
    return {
      q: searchText.trim() || undefined,
      provider: filters.provider || undefined,
      inputModality: filters.modality || undefined,
      reasoning: filters.reasoning ? true : undefined,
      minContext: filters.context ? contextMap[filters.context] : undefined,
      maxInputPrice: filters.price ? priceMap[filters.price] : undefined,
    };
  }, [filters, searchText]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadCatalog(controller.signal)
      .then(setCatalog)
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "模型目录加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);

  const visible = useMemo(() => visibleRows(catalog?.index.data ?? []), [catalog]);
  const providers = catalog?.index.providers ?? {};
  const facets = useMemo(() => catalogFacets(visible, catalog?.index.providers), [catalog, visible]);
  const filtered = useMemo(
    () => filterRows(visible, filter, catalog?.index.providers),
    [catalog, visible, filter],
  );
  const models = filtered.slice(0, visibleCount);

  useEffect(() => setVisibleCount(PAGE_SIZE), [filter]);

  const updateFilter = <Key extends keyof FilterState>(key: Key, value: FilterState[Key]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const meta = catalog?.meta.catalog;
  const sources = meta?.sources ?? [];

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="#top" aria-label="ModelInfo 首页">
          <span className="brand-mark">M</span>
          <span>ModelInfo</span>
        </a>
        <nav aria-label="主导航">
          <a href="#catalog">模型</a>
          <a href="/v1/models.json" target="_blank" rel="noreferrer">
            API JSON
          </a>
        </nav>
      </header>

      <main id="top">
        <section className="intro" aria-labelledby="page-title">
          <div>
            <h1 id="page-title">模型目录</h1>
            <p>查找不同 Provider 实际可调用的模型、上下文和价格。</p>
          </div>
          <div className="summary-counts" aria-label="目录统计">
            <span><strong>{meta?.total.toLocaleString() ?? "—"}</strong> 供应实例</span>
            <span><strong>{catalog ? facets.providers.length.toLocaleString() : "—"}</strong> Providers</span>
          </div>
        </section>

        <section className="source-strip" aria-label="数据来源">
          <span className="source-strip__label">数据来源</span>
          {sources.length === 0 && <span className="source-pill">正在同步…</span>}
          {sources.map((source) => (
            <span className={`source-pill source-pill--${source.status}`} key={source.id}>
              <i aria-hidden="true" />
              <strong>{source.name}</strong>
              {source.records.toLocaleString()} 条
              {source.added > 0 && source.id === "openrouter" ? ` · 新增 ${source.added}` : ""}
            </span>
          ))}
          {meta && (
            <span className="stale-note">
              更新于 {new Date(meta.generated_at).toLocaleString("zh-CN", { hour12: false })}
            </span>
          )}
        </section>

        <section className="catalog" id="catalog">
          <div className="search-row">
            <label className="search-box">
              <SearchIcon />
              <span className="sr-only">搜索模型</span>
              <input
                ref={searchRef}
                type="search"
                placeholder="搜索模型、Provider、家族或 ID"
                value={filters.q}
                onChange={(event) => updateFilter("q", event.target.value)}
              />
              <kbd>⌘ K</kbd>
            </label>
            <span className="result-count">
              {loading ? "读取中…" : `${filtered.length.toLocaleString()} 个结果`}
            </span>
          </div>

          <div className="filter-bar" aria-label="模型筛选">
            <label>
              <span>Provider</span>
              <select value={filters.provider} onChange={(event) => updateFilter("provider", event.target.value)}>
                <option value="">全部</option>
                {facets.providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} ({provider.count})
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>输入</span>
              <select value={filters.modality} onChange={(event) => updateFilter("modality", event.target.value)}>
                <option value="">全部</option>
                <option value="text">Text</option>
                <option value="image">Image</option>
                <option value="document">Document</option>
                <option value="audio">Audio</option>
                <option value="video">Video</option>
              </select>
            </label>
            <label>
              <span>上下文</span>
              <select value={filters.context} onChange={(event) => updateFilter("context", event.target.value)}>
                <option value="">任意</option>
                <option value="32k">32K+</option>
                <option value="128k">128K+</option>
                <option value="256k">256K+</option>
                <option value="1m">1M+</option>
              </select>
            </label>
            <label>
              <span>输入价格</span>
              <select value={filters.price} onChange={(event) => updateFilter("price", event.target.value)}>
                <option value="">任意</option>
                <option value="free">免费</option>
                <option value="1">≤ $1</option>
                <option value="5">≤ $5</option>
                <option value="15">≤ $15</option>
              </select>
            </label>
            <label className="reasoning-filter">
              <input
                type="checkbox"
                checked={filters.reasoning}
                onChange={(event) => updateFilter("reasoning", event.target.checked)}
              />
              <span>支持思考</span>
            </label>
            <button
              className="reset-button"
              type="button"
              onClick={() => setFilters(emptyFilters)}
              disabled={!activeFilterCount}
            >
              清除{activeFilterCount ? ` (${activeFilterCount})` : ""}
            </button>
          </div>

          {error && (
            <div className="message-state" role="alert">
              <strong>目录加载失败</strong>
              <span>{error}</span>
              <button type="button" onClick={() => setAttempt((current) => current + 1)}>重试</button>
            </div>
          )}

          <div className="model-list" aria-busy={loading}>
            <div className="list-header" aria-hidden="true">
              <span>模型 / Provider</span>
              <span>上下文</span>
              <span>最大输出</span>
              <span>输入 / 输出价格</span>
              <span>输入模态</span>
              <span />
            </div>
            {loading
              ? Array.from({ length: 8 }, (_, index) => <div className="skeleton-row" key={index} />)
              : models.map((model) => <ModelRow key={offeringId(model)} model={model} provider={providers[model.provider]} />)}
          </div>

          {!loading && !error && models.length === 0 && (
            <div className="message-state">
              <strong>没有符合条件的模型</strong>
              <span>尝试减少筛选条件或更换搜索词。</span>
              <button type="button" onClick={() => setFilters(emptyFilters)}>清除筛选</button>
            </div>
          )}

          {!loading && filtered.length > models.length && (
            <button
              className="load-more"
              type="button"
              onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
            >
              加载更多
            </button>
          )}
        </section>
      </main>

      <footer>
        <span>ModelInfo · 多源模型目录</span>
        <span>价格仅用于比较，实际账单以 Provider 为准。</span>
      </footer>
    </div>
  );
}

export default App;
