"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  HuskelAPI: () => HuskelAPI,
  HuskelClient: () => HuskelClient,
  HuskelProvider: () => HuskelProvider,
  SearchBar: () => SearchBar,
  Sparkle: () => Sparkle,
  getHuskelClient: () => getHuskelClient,
  initHuskel: () => initHuskel,
  useHuskel: () => useHuskel,
  useIngest: () => useIngest,
  useSearch: () => useSearch
});
module.exports = __toCommonJS(index_exports);

// src/api.ts
var MAX_RETRIES = 3;
var RETRY_DELAYS = [500, 1e3, 2e3];
function log(level, msg, data) {
  const prefix = "[Huskel]";
  if (level === "error") console.error(prefix, msg, data != null ? data : "");
  else if (level === "warn") console.warn(prefix, msg, data != null ? data : "");
  else console.log(prefix, msg, data != null ? data : "");
}
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
var HuskelAPI = class {
  constructor(apiUrl, siteId, apiToken) {
    this.apiUrl = apiUrl;
    this.siteId = siteId;
    this.apiToken = apiToken;
  }
  async post(path, body, attempt = 0) {
    const url = `${this.apiUrl}${path}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Huskel-Token": this.apiToken,
          "X-Huskel-Site": this.siteId
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const text = await res.text();
        const err = { status: res.status, message: text };
        if (res.status >= 400 && res.status < 500) {
          log("error", `${path} failed [${res.status}]`, text);
          throw err;
        }
        if (attempt < MAX_RETRIES - 1) {
          log("warn", `${path} [${res.status}] retrying (${attempt + 1}/${MAX_RETRIES})...`);
          await sleep(RETRY_DELAYS[attempt]);
          return this.post(path, body, attempt + 1);
        }
        log("error", `${path} failed after ${MAX_RETRIES} attempts`, err);
        throw err;
      }
      return res.json();
    } catch (e) {
      if (e.status === void 0) {
        if (attempt < MAX_RETRIES - 1) {
          log("warn", `${path} network error, retrying (${attempt + 1}/${MAX_RETRIES})...`);
          await sleep(RETRY_DELAYS[attempt]);
          return this.post(path, body, attempt + 1);
        }
        log("error", `${path} unreachable after ${MAX_RETRIES} attempts`);
      }
      throw e;
    }
  }
  async ingest(product) {
    log("info", "ingesting product", product.name);
    return this.post("/ingest", { siteId: this.siteId, product });
  }
  async ingestBatch(products) {
    log("info", `ingesting batch of ${products.length} products`);
    return this.post("/ingest/batch", { siteId: this.siteId, products });
  }
  async search(query, limit = 10) {
    log("info", "search query", query);
    return this.post("/search", { query, siteId: this.siteId, limit });
  }
};

// src/client.ts
function getEnvVar(key) {
  if (typeof globalThis !== "undefined") {
    const g = globalThis;
    if (g.process && g.process.env) {
      return g.process.env[key];
    }
  }
  return void 0;
}
function mapRawProduct(input) {
  var _a;
  const name = input.name || input.title || input.productName || "";
  let price = "";
  let priceNumeric = void 0;
  if (input.price !== void 0) {
    if (typeof input.price === "number") {
      priceNumeric = input.price;
      price = String(input.price);
    } else {
      price = input.price;
      const num = parseFloat(input.price.replace(/[^0-9.]/g, ""));
      priceNumeric = isNaN(num) ? void 0 : num;
    }
  }
  if (input.priceNumeric !== void 0) {
    priceNumeric = input.priceNumeric;
  }
  let url = input.url || "";
  if (!url && typeof window !== "undefined") {
    url = window.location.href;
  }
  let slug = input.slug || input.id || input.productId || "";
  if (!slug && url) {
    slug = url.split("/").filter(Boolean).pop() || "";
  }
  if (!slug && name) {
    slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }
  let images = [];
  if (input.images) {
    images = input.images;
  } else if (input.image) {
    images = [input.image];
  } else if (input.thumbnail) {
    images = [input.thumbnail];
  }
  if (!name) {
    console.warn("[Huskel] Validation warning: Product name/title is missing. Skipping:", input);
    return null;
  }
  if (!price) {
    console.warn("[Huskel] Validation warning: Product price is missing. Skipping:", input);
    return null;
  }
  if (!url) {
    console.warn("[Huskel] Validation warning: Product URL is missing. Skipping:", input);
    return null;
  }
  return {
    name,
    price,
    url,
    brand: input.brand,
    description: input.description,
    originalPrice: input.originalPrice,
    discount: input.discount,
    currency: (_a = input.currency) != null ? _a : "KES",
    stock: input.stock,
    availability: input.availability,
    rating: input.rating,
    reviewCount: input.reviewCount,
    category: input.category,
    subCategory: input.subCategory,
    tags: input.tags,
    images: images.length > 0 ? images : void 0,
    specs: input.specs,
    priceNumeric,
    slug
  };
}
var HuskelClient = class {
  constructor(config) {
    this.ingestQueue = [];
    this.ingestTimer = null;
    this.ingestedUrls = /* @__PURE__ */ new Set();
    this.onlineHandler = null;
    const siteId = config.siteId || getEnvVar("NEXT_PUBLIC_HUSKEL_SITE_ID") || "";
    const apiUrl = config.apiUrl || getEnvVar("NEXT_PUBLIC_HUSKEL_API_URL") || "";
    const apiToken = config.apiToken || getEnvVar("NEXT_PUBLIC_HUSKEL_API_TOKEN") || "";
    if (!siteId) console.error('[Huskel] Missing siteId. Set it via <HuskelProvider siteId="..."> or NEXT_PUBLIC_HUSKEL_SITE_ID.');
    if (!apiUrl) console.error('[Huskel] Missing apiUrl. Set it via <HuskelProvider apiUrl="..."> or NEXT_PUBLIC_HUSKEL_API_URL.');
    if (!apiToken) console.error('[Huskel] Missing apiToken. Set it via <HuskelProvider apiToken="..."> or NEXT_PUBLIC_HUSKEL_API_TOKEN.');
    this.api = new HuskelAPI(apiUrl, siteId, apiToken);
    instance = this;
    if (typeof window !== "undefined") {
      this.onlineHandler = () => {
        console.log("[Huskel] Connectivity restored, flushing queued ingestions.");
        this.flushQueue();
      };
      window.addEventListener("online", this.onlineHandler);
    }
  }
  destroy() {
    if (typeof window !== "undefined" && this.onlineHandler) {
      window.removeEventListener("online", this.onlineHandler);
      this.onlineHandler = null;
    }
    if (this.ingestTimer) {
      clearTimeout(this.ingestTimer);
      this.ingestTimer = null;
    }
    if (instance === this) instance = null;
  }
  async queueIngest(rawProduct) {
    const product = mapRawProduct(rawProduct);
    if (!product) return;
    if (this.ingestedUrls.has(product.url)) {
      return;
    }
    this.ingestedUrls.add(product.url);
    this.ingestQueue.push(product);
    this.scheduleFlush();
  }
  async queueIngestBatch(rawProducts) {
    rawProducts.forEach((p) => {
      const product = mapRawProduct(p);
      if (!product) return;
      if (this.ingestedUrls.has(product.url)) {
        return;
      }
      this.ingestedUrls.add(product.url);
      this.ingestQueue.push(product);
    });
    if (this.ingestQueue.length > 0) {
      this.scheduleFlush();
    }
  }
  scheduleFlush() {
    if (this.ingestTimer) return;
    this.ingestTimer = setTimeout(() => {
      this.flushQueue();
    }, 300);
  }
  async flushQueue() {
    this.ingestTimer = null;
    if (this.ingestQueue.length === 0) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      console.warn("[Huskel] Browser offline. Postponing ingestion.");
      return;
    }
    const batch = [...this.ingestQueue];
    this.ingestQueue = [];
    try {
      await this.api.ingestBatch(batch);
    } catch (e) {
      if (e.status && e.status >= 400 && e.status < 500) {
        console.error("[Huskel] Ingestion discarded due to client error:", e.message);
        return;
      }
      console.warn("[Huskel] Ingestion failed. Re-queuing to retry.", e);
      this.ingestQueue = [...batch, ...this.ingestQueue];
      this.scheduleFlush();
    }
  }
};
var instance = null;
function initHuskel(config) {
  instance = new HuskelClient(config);
  return instance;
}
function getHuskelClient() {
  if (!instance) {
    const siteId = getEnvVar("NEXT_PUBLIC_HUSKEL_SITE_ID");
    const apiUrl = getEnvVar("NEXT_PUBLIC_HUSKEL_API_URL");
    const apiToken = getEnvVar("NEXT_PUBLIC_HUSKEL_API_TOKEN");
    if (siteId && apiUrl && apiToken) {
      instance = new HuskelClient({ siteId, apiUrl, apiToken });
    } else {
      throw new Error("[Huskel] Call initHuskel() or set NEXT_PUBLIC_HUSKEL_* environment variables before using the client.");
    }
  }
  return instance;
}

// src/hooks/useHuskel.ts
var import_react = require("react");
function useHuskel(config) {
  const clientRef = (0, import_react.useRef)(null);
  if (!clientRef.current) {
    console.warn("[Huskel] useHuskel() is deprecated. Please wrap your application in <HuskelProvider> instead.");
    clientRef.current = initHuskel(config);
  }
  return clientRef.current;
}

// src/hooks/useSearch.ts
var import_react3 = require("react");

// src/components/HuskelProvider.tsx
var import_react2 = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var HuskelContext = (0, import_react2.createContext)(null);
function HuskelProvider({ siteId, apiUrl, apiToken, children }) {
  const clientRef = (0, import_react2.useRef)(null);
  if (!clientRef.current) {
    clientRef.current = new HuskelClient({ siteId, apiUrl, apiToken });
  }
  (0, import_react2.useEffect)(() => {
    return () => {
      var _a;
      (_a = clientRef.current) == null ? void 0 : _a.destroy();
    };
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HuskelContext.Provider, { value: clientRef.current, children });
}
function useHuskelContext() {
  const context = (0, import_react2.useContext)(HuskelContext);
  if (!context) {
    return getHuskelClient();
  }
  return context;
}

// src/hooks/useSearch.ts
function useSearch() {
  const client = useHuskelContext();
  const [results, setResults] = (0, import_react3.useState)([]);
  const [loading, setLoading] = (0, import_react3.useState)(false);
  const [error, setError] = (0, import_react3.useState)(null);
  const abortRef = (0, import_react3.useRef)(null);
  const search = (0, import_react3.useCallback)(async (query, limit = 10) => {
    var _a, _b, _c;
    if (!query.trim()) {
      setResults([]);
      return;
    }
    (_a = abortRef.current) == null ? void 0 : _a.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const res = await client.api.search(query, limit);
      setResults((_b = res.results) != null ? _b : []);
    } catch (e) {
      setError((_c = e.message) != null ? _c : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [client]);
  const clear = (0, import_react3.useCallback)(() => {
    setResults([]);
    setError(null);
  }, []);
  return { results, loading, error, search, clear };
}

// src/hooks/useIngest.ts
var import_react4 = require("react");
function useIngest() {
  const client = useHuskelContext();
  const [loading, setLoading] = (0, import_react4.useState)(false);
  const [error, setError] = (0, import_react4.useState)(null);
  const ingest = (0, import_react4.useCallback)(async (product) => {
    var _a;
    setLoading(true);
    setError(null);
    try {
      await client.queueIngest(product);
    } catch (e) {
      setError((_a = e.message) != null ? _a : "Ingest failed");
    } finally {
      setLoading(false);
    }
  }, [client]);
  const ingestBatch = (0, import_react4.useCallback)(async (products) => {
    var _a;
    if (!products.length) return;
    setLoading(true);
    setError(null);
    try {
      await client.queueIngestBatch(products);
    } catch (e) {
      setError((_a = e.message) != null ? _a : "Batch ingest failed");
    } finally {
      setLoading(false);
    }
  }, [client]);
  return { ingest, ingestBatch, loading, error };
}

// src/components/SearchBar.tsx
var import_react5 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
var S = `
  .hsk-wrap{position:relative;width:100%;font-family:inherit}
  .hsk-input{width:100%;padding:10px 16px;font-size:15px;border:1.5px solid #e2e2e2;border-radius:8px;outline:none;box-sizing:border-box;background:#fff;transition:border-color .2s}
  .hsk-input:focus{border-color:#f47c3c}
  .hsk-drop{position:absolute;top:calc(100% + 6px);left:0;right:0;background:#fff;border:1px solid #e2e2e2;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.1);z-index:9999;max-height:360px;overflow-y:auto}
  .hsk-item{display:flex;align-items:center;gap:12px;padding:10px 14px;cursor:pointer;transition:background .15s}
  .hsk-item:hover{background:#faf5f1}
  .hsk-item img{width:40px;height:40px;object-fit:cover;border-radius:4px}
  .hsk-item-name{font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .hsk-item-price{font-size:13px;color:#f47c3c;margin-top:2px}
  .hsk-msg{padding:16px;text-align:center;font-size:14px;color:#888}
`;
function SearchBar({
  placeholder = "Search for what you want \u2014 how you want",
  limit = 10,
  debounceMs = 300,
  onSelect,
  className,
  inputClassName,
  dropdownClassName,
  renderResult
}) {
  const [query, setQuery] = (0, import_react5.useState)("");
  const [open, setOpen] = (0, import_react5.useState)(false);
  const { results, loading, search, clear } = useSearch();
  const timer = (0, import_react5.useRef)();
  const wrap = (0, import_react5.useRef)(null);
  (0, import_react5.useEffect)(() => {
    clearTimeout(timer.current);
    if (!query.trim()) {
      clear();
      setOpen(false);
      return;
    }
    timer.current = setTimeout(() => {
      search(query, limit);
      setOpen(true);
    }, debounceMs);
    return () => clearTimeout(timer.current);
  }, [query, search, clear, limit, debounceMs]);
  (0, import_react5.useEffect)(() => {
    const handler = (e) => {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const handleSelect = (r) => {
    setOpen(false);
    setQuery(r.product.name);
    onSelect == null ? void 0 : onSelect(r);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("style", { children: S }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `hsk-wrap ${className != null ? className : ""}`, ref: wrap, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "input",
        {
          className: `hsk-input ${inputClassName != null ? inputClassName : ""}`,
          type: "text",
          value: query,
          placeholder,
          onChange: (e) => setQuery(e.target.value),
          onFocus: () => results.length && setOpen(true)
        }
      ),
      open && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `hsk-drop ${dropdownClassName != null ? dropdownClassName : ""}`, children: [
        loading && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "hsk-msg", children: "Searching\u2026" }),
        !loading && results.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "hsk-msg", children: [
          'No results for "',
          query,
          '"'
        ] }),
        results.map(
          (r) => {
            var _a, _b;
            return renderResult ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { onClick: () => handleSelect(r), children: renderResult(r) }, r.id) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "hsk-item", onClick: () => handleSelect(r), children: [
              ((_a = r.product.images) == null ? void 0 : _a[0]) && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("img", { src: r.product.images[0], alt: r.product.name }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "hsk-item-name", children: r.product.name }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "hsk-item-price", children: [
                  (_b = r.product.currency) != null ? _b : "KES",
                  " ",
                  r.product.price
                ] })
              ] })
            ] }, r.id);
          }
        )
      ] })
    ] })
  ] });
}

// src/components/Sparkle.tsx
var import_react6 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
var S2 = `
  .hsk-sparkle{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;font-size:12px;font-weight:600;background:#f47c3c;color:#fff;border:none;border-radius:20px;cursor:pointer;transition:opacity .2s,transform .15s}
  .hsk-sparkle:hover{opacity:.88;transform:scale(1.04)}
  .hsk-sparkle:disabled{opacity:.5;cursor:not-allowed}
`;
function Sparkle({ productName, limit = 5, onResult, className }) {
  const client = useHuskelContext();
  const [loading, setLoading] = (0, import_react6.useState)(false);
  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await client.api.search(productName, limit);
      onResult == null ? void 0 : onResult(res.results);
    } catch (e) {
      console.error("[Huskel Sparkle]", e);
    } finally {
      setLoading(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("style", { children: S2 }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("button", { className: `hsk-sparkle ${className != null ? className : ""}`, onClick: handleClick, disabled: loading, children: [
      "\u2726 ",
      loading ? "Finding\u2026" : "Similar"
    ] })
  ] });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  HuskelAPI,
  HuskelClient,
  HuskelProvider,
  SearchBar,
  Sparkle,
  getHuskelClient,
  initHuskel,
  useHuskel,
  useIngest,
  useSearch
});
