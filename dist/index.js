'use client';
"use strict";
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
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
  AIChatButton: () => AIChatButton,
  CartBadge: () => CartBadge,
  CartDrawer: () => CartDrawer,
  ChatWidget: () => ChatWidget,
  HuskelAPI: () => HuskelAPI,
  HuskelClient: () => HuskelClient,
  HuskelProvider: () => HuskelProvider,
  SearchBar: () => SearchBar,
  Sparkle: () => Sparkle,
  getHuskelClient: () => getHuskelClient,
  initHuskel: () => initHuskel,
  useCart: () => useCart,
  useChat: () => useChat,
  useHuskel: () => useHuskel,
  useIngest: () => useIngest,
  usePageIngest: () => usePageIngest,
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
  constructor(apiUrl, siteId, apiToken, getShopperId, getSessionId) {
    this.apiUrl = apiUrl;
    this.siteId = siteId;
    this.apiToken = apiToken;
    this.getShopperId = getShopperId;
    this.getSessionId = getSessionId;
  }
  async post(path, body, attempt = 0) {
    var _a, _b;
    const url = `${this.apiUrl}${path}`;
    try {
      const headers = {
        "Content-Type": "application/json",
        "X-Huskel-Token": this.apiToken,
        "X-Huskel-Site": this.siteId
      };
      const shopperId = (_a = this.getShopperId) == null ? void 0 : _a.call(this);
      if (shopperId) {
        headers["X-Huskel-Shopper-Id"] = shopperId;
      }
      const sessionId = (_b = this.getSessionId) == null ? void 0 : _b.call(this);
      if (sessionId) {
        headers["X-Huskel-Session-Id"] = sessionId;
      }
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const text = await res.text();
        let message = text;
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed.error === "string") {
            message = parsed.error;
          }
        } catch (e) {
        }
        const err = { status: res.status, message };
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
  // Pure vector search — no LLM, instant results. This is what the SearchBar uses.
  async searchVector(query, limit = 10) {
    return this.post("/search/vector", { query, siteId: this.siteId, limit });
  }
  // Autocomplete — pure in-memory Trie, <1ms, no Upstash call. Only true prefix matches.
  async searchAutocomplete(query, limit = 8) {
    return this.post("/search/autocomplete", { query, siteId: this.siteId, limit });
  }
  // LLM chat — conversational search with history context.
  async chat(query, history = []) {
    log("info", "chat query", query);
    return this.post("/chat", { query, siteId: this.siteId, history });
  }
  // --- Cart System ---
  buildHeaders() {
    var _a, _b;
    const headers = {
      "Content-Type": "application/json",
      "X-Huskel-Token": this.apiToken,
      "X-Huskel-Site": this.siteId
    };
    const shopperId = (_a = this.getShopperId) == null ? void 0 : _a.call(this);
    if (shopperId) headers["X-Huskel-Shopper-Id"] = shopperId;
    const sessionId = (_b = this.getSessionId) == null ? void 0 : _b.call(this);
    if (sessionId) headers["X-Huskel-Session-Id"] = sessionId;
    return headers;
  }
  async getCart() {
    const res = await fetch(`${this.apiUrl}/cart?siteId=${this.siteId}`, {
      headers: this.buildHeaders()
    });
    if (!res.ok) throw new Error("Failed to fetch cart");
    return res.json();
  }
  async clearCart() {
    const res = await fetch(`${this.apiUrl}/cart?siteId=${this.siteId}`, {
      method: "DELETE",
      headers: this.buildHeaders()
    });
    if (!res.ok) throw new Error("Failed to clear cart");
    return res.json();
  }
  async checkoutCart() {
    const res = await fetch(`${this.apiUrl}/cart/checkout`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({ siteId: this.siteId })
    });
    if (!res.ok) throw new Error("Failed to checkout cart");
    return res.json();
  }
  async getCheckoutConfig() {
    const res = await fetch(`${this.apiUrl}/checkout/config?site_id=${this.siteId}`, {
      method: "GET",
      headers: this.buildHeaders()
    });
    if (!res.ok) throw new Error("Failed to fetch checkout config");
    return res.json();
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
function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
var _HuskelClient = class _HuskelClient {
  constructor(config) {
    this.ingestQueue = [];
    this.ingestTimer = null;
    this.ingestedUrls = /* @__PURE__ */ new Set();
    this.onlineHandler = null;
    this.sessionId = "";
    const siteId = config.siteId || getEnvVar("NEXT_PUBLIC_HUSKEL_SITE_ID") || "";
    const apiUrl = config.apiUrl || getEnvVar("NEXT_PUBLIC_HUSKEL_API_URL") || "";
    const apiToken = config.apiToken || getEnvVar("NEXT_PUBLIC_HUSKEL_API_TOKEN") || "";
    if (!siteId) console.error('[Huskel] Missing siteId. Set it via <HuskelProvider siteId="..."> or NEXT_PUBLIC_HUSKEL_SITE_ID.');
    if (!apiUrl) console.error('[Huskel] Missing apiUrl. Set it via <HuskelProvider apiUrl="..."> or NEXT_PUBLIC_HUSKEL_API_URL.');
    if (!apiToken) console.error('[Huskel] Missing apiToken. Set it via <HuskelProvider apiToken="..."> or NEXT_PUBLIC_HUSKEL_API_TOKEN.');
    this.shopperId = config.shopperId;
    this.onCheckout = config.onCheckout;
    this.initSession();
    this.loadIngestedCache();
    this.api = new HuskelAPI(
      apiUrl,
      siteId,
      apiToken,
      () => this.getShopperId(),
      () => this.sessionId
    );
    instance = this;
    if (typeof window !== "undefined") {
      this.onlineHandler = () => {
        console.log("[Huskel] Connectivity restored, flushing queued ingestions.");
        this.flushQueue();
      };
      window.addEventListener("online", this.onlineHandler);
    }
  }
  // 24h
  loadIngestedCache() {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(_HuskelClient.INGEST_CACHE_KEY);
      if (!raw) return;
      const { ts, urls } = JSON.parse(raw);
      if (Date.now() - ts > _HuskelClient.INGEST_CACHE_TTL) {
        localStorage.removeItem(_HuskelClient.INGEST_CACHE_KEY);
        return;
      }
      this.ingestedUrls = new Set(urls);
    } catch (e) {
    }
  }
  saveIngestedCache() {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        _HuskelClient.INGEST_CACHE_KEY,
        JSON.stringify({ ts: Date.now(), urls: [...this.ingestedUrls] })
      );
    } catch (e) {
    }
  }
  setShopperId(id) {
    this.shopperId = id;
  }
  getShopperId() {
    return this.shopperId || "guest_" + this.sessionId;
  }
  getSessionId() {
    return this.sessionId;
  }
  initSession() {
    if (typeof window !== "undefined" && window.sessionStorage) {
      try {
        let sid = window.sessionStorage.getItem("huskel_session_id");
        if (!sid) {
          sid = generateUUID();
          window.sessionStorage.setItem("huskel_session_id", sid);
        }
        this.sessionId = sid;
        return;
      } catch (e) {
      }
    }
    this.sessionId = generateUUID();
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
    this.saveIngestedCache();
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
      this.saveIngestedCache();
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
_HuskelClient.INGEST_CACHE_KEY = "huskel_ingested_v1";
_HuskelClient.INGEST_CACHE_TTL = 24 * 60 * 60 * 1e3;
var HuskelClient = _HuskelClient;
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
function HuskelProvider({ siteId, apiUrl, apiToken, shopperId, children }) {
  const clientRef = (0, import_react2.useRef)(null);
  if (!clientRef.current) {
    clientRef.current = new HuskelClient({ siteId, apiUrl, apiToken, shopperId });
  }
  (0, import_react2.useEffect)(() => {
    var _a;
    (_a = clientRef.current) == null ? void 0 : _a.setShopperId(shopperId);
  }, [shopperId]);
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
  const genRef = (0, import_react3.useRef)(0);
  const search = (0, import_react3.useCallback)(async (query, limit = 8) => {
    var _a, _b;
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    const gen = ++genRef.current;
    setError(null);
    try {
      const res = await client.api.searchAutocomplete(query, limit);
      if (gen === genRef.current) {
        setResults((_a = res.results) != null ? _a : []);
      }
    } catch (e) {
      if (gen === genRef.current) {
        let msg = (_b = e == null ? void 0 : e.message) != null ? _b : "Search failed";
        try {
          const parsed = JSON.parse(msg);
          if (parsed && parsed.error) {
            msg = parsed.error;
          }
        } catch (e2) {
        }
        setError(msg);
      }
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [client]);
  const clear = (0, import_react3.useCallback)(() => {
    genRef.current++;
    setResults([]);
    setError(null);
    setLoading(false);
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

// src/hooks/usePageIngest.ts
var import_react5 = require("react");
function usePageIngest(product) {
  var _a;
  const ingestedRef = (0, import_react5.useRef)(null);
  (0, import_react5.useEffect)(() => {
    if (!product) return;
    const url = product.url || (typeof window !== "undefined" ? window.location.href : "");
    if (ingestedRef.current === url) return;
    ingestedRef.current = url;
    try {
      getHuskelClient().queueIngest(__spreadProps(__spreadValues({}, product), { url }));
    } catch (e) {
    }
  }, [(_a = product == null ? void 0 : product.url) != null ? _a : product == null ? void 0 : product.name]);
}

// src/hooks/useChat.ts
var import_react6 = require("react");
function useChat() {
  const client = useHuskelContext();
  const [messages, setMessages] = (0, import_react6.useState)([]);
  const [sources, setSources] = (0, import_react6.useState)([]);
  const [loading, setLoading] = (0, import_react6.useState)(false);
  const [error, setError] = (0, import_react6.useState)(null);
  const abortRef = (0, import_react6.useRef)(null);
  const send = (0, import_react6.useCallback)(async (query, displayQuery) => {
    var _a, _b, _c, _d, _e;
    if (!query.trim() || loading) return;
    (_a = abortRef.current) == null ? void 0 : _a.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    const userMsg = { role: "user", content: displayQuery != null ? displayQuery : query };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setError(null);
    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await client.api.chat(query, history);
      if (signal.aborted) return;
      const fullAnswer = res.answer || "";
      const words = fullAnswer.split(/(\s+)/);
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      let currentContent = "";
      for (const word of words) {
        if (signal.aborted) return;
        currentContent += word;
        setMessages((prev) => {
          const next = [...prev];
          if (next.length > 0) {
            next[next.length - 1] = { role: "assistant", content: currentContent };
          }
          return next;
        });
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      if (signal.aborted) return;
      setSources((_b = res.sources) != null ? _b : []);
      if (((_c = res.action) == null ? void 0 : _c.type) === "add_to_cart" || res.checkout) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("huskel:cart_updated", { detail: res.checkout }));
        }
      }
      if (((_d = res.action) == null ? void 0 : _d.type) === "checkout") {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("huskel:trigger_checkout", { detail: res.checkout }));
        }
      }
      if (res.checkout && client.onCheckout) {
        client.onCheckout(res.checkout);
      }
    } catch (e) {
      if (signal.aborted) return;
      let msg = (_e = e == null ? void 0 : e.message) != null ? _e : "Chat request failed";
      try {
        const parsed = JSON.parse(msg);
        if (parsed && parsed.error) {
          msg = parsed.error;
        }
      } catch (e2) {
      }
      setError(msg);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, [client, messages, loading]);
  const reset = (0, import_react6.useCallback)(() => {
    var _a;
    (_a = abortRef.current) == null ? void 0 : _a.abort();
    setMessages([]);
    setSources([]);
    setError(null);
    setLoading(false);
  }, []);
  return { messages, sources, loading, error, send, reset };
}

// src/hooks/useCart.ts
var import_react7 = require("react");
function useCart() {
  const client = useHuskelContext();
  const [cart, setCart] = (0, import_react7.useState)(null);
  const [loading, setLoading] = (0, import_react7.useState)(false);
  const shopperId = client.getShopperId();
  const fetchCart = (0, import_react7.useCallback)(async () => {
    if (!shopperId) return;
    setLoading(true);
    try {
      const res = await client.api.getCart();
      setCart(res);
    } catch (e) {
      console.error("[Huskel] Failed to fetch cart", e);
    } finally {
      setLoading(false);
    }
  }, [client, shopperId]);
  (0, import_react7.useEffect)(() => {
    fetchCart();
    const handleCartUpdate = (e) => {
      if (e.detail) {
        setCart(e.detail);
      } else {
        fetchCart();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("huskel:cart_updated", handleCartUpdate);
      return () => window.removeEventListener("huskel:cart_updated", handleCartUpdate);
    }
  }, [fetchCart, shopperId]);
  return { cart, loading, fetchCart };
}

// src/components/SearchBar.tsx
var import_react8 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
var SearchIcon = () => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { width: "15", height: "15", viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", children: [
  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: "8.5", cy: "8.5", r: "5.5" }),
  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("line", { x1: "13", y1: "13", x2: "18", y2: "18" })
] });
function SearchBar({
  placeholder = "Search products\u2026",
  limit = 10,
  debounceMs = 80,
  onSelect,
  className,
  inputClassName,
  dropdownClassName,
  renderResult,
  theme,
  classNames = {}
}) {
  const [query, setQuery] = (0, import_react8.useState)("");
  const [open, setOpen] = (0, import_react8.useState)(false);
  const { results, loading, search, clear } = useSearch();
  const timer = (0, import_react8.useRef)();
  const wrap = (0, import_react8.useRef)(null);
  (0, import_react8.useEffect)(() => {
    clearTimeout(timer.current);
    if (!query.trim()) {
      clear();
      setOpen(false);
      return;
    }
    setOpen(true);
    timer.current = setTimeout(() => {
      search(query, limit);
    }, debounceMs);
    return () => clearTimeout(timer.current);
  }, [query]);
  (0, import_react8.useEffect)(() => {
    const h = (e) => {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const handleSelect = (r) => {
    setOpen(false);
    setQuery(r.product.name);
    onSelect == null ? void 0 : onSelect(r);
  };
  const showDrop = open && query.trim().length > 0;
  const customStyles = __spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues({}, (theme == null ? void 0 : theme.primaryColor) && { "--hsk-primary": theme.primaryColor }), (theme == null ? void 0 : theme.backgroundColor) && { "--hsk-bg": theme.backgroundColor }), (theme == null ? void 0 : theme.textColor) && { "--hsk-text": theme.textColor }), (theme == null ? void 0 : theme.fontFamily) && { "--hsk-font": theme.fontFamily }), (theme == null ? void 0 : theme.borderRadius) && { "--hsk-border-radius": theme.borderRadius });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `hsk-sb-wrap ${classNames.root || ""} ${className || ""}`, ref: wrap, style: customStyles, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "hsk-sb-icon", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SearchIcon, {}) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "input",
      {
        className: `hsk-sb-input ${classNames.input || ""} ${inputClassName || ""}`,
        type: "text",
        value: query,
        placeholder,
        onChange: (e) => setQuery(e.target.value),
        onFocus: () => results.length > 0 && query.trim() && setOpen(true),
        autoComplete: "off",
        spellCheck: false
      }
    ),
    showDrop && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `hsk-sb-drop ${classNames.dropdown || ""} ${dropdownClassName || ""}`, style: { position: "absolute" }, children: [
      loading && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "hsk-sb-loading-bar" }),
      results.length === 0 && !loading && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "hsk-sb-empty", children: [
        "No results for \u201C",
        query,
        "\u201D"
      ] }),
      results.map((r, i) => {
        var _a;
        return renderResult ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "div",
          {
            onClick: () => handleSelect(r),
            className: "hsk-sb-fade",
            style: { animationDelay: `${i * 18}ms` },
            children: renderResult(r)
          },
          r.id
        ) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "div",
          {
            className: `hsk-sb-row hsk-sb-fade ${classNames.row || ""}`,
            style: { animationDelay: `${i * 18}ms` },
            onClick: () => handleSelect(r),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "hsk-sb-row-icon", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SearchIcon, {}) }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "hsk-sb-row-body", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "hsk-sb-row-title", children: r.product.name }),
                (r.product.category || r.product.brand) && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "hsk-sb-row-sub", children: (_a = r.product.category) != null ? _a : r.product.brand })
              ] })
            ]
          },
          r.id
        );
      })
    ] })
  ] });
}

// src/components/Sparkle.tsx
var import_react9 = require("react");
var import_react_dom = require("react-dom");

// src/utils/markdown.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var parseInline = (text, keyPrefix) => {
  const tokenRegex = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts = text.split(tokenRegex);
  return parts.map((part, index) => {
    if (!part) return null;
    const key = `${keyPrefix}-inline-${index}`;
    if (part.startsWith("`") && part.endsWith("`")) {
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("code", { className: "hsk-markdown-code", children: part.slice(1, -1) }, key);
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: parseInline(part.slice(2, -2), key) }, key);
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const url = linkMatch[2];
      const isSafeUrl = /^(https?|mailto|tel):/i.test(url) || url.startsWith("/");
      if (isSafeUrl) {
        return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("a", { href: url, target: "_blank", rel: "noopener noreferrer", className: "hsk-markdown-link", children: parseInline(linkMatch[1], key) }, key);
      }
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: parseInline(linkMatch[1], key) }, key);
    }
    return part;
  });
};
function renderMarkdown(content) {
  const lines = content.split("\n");
  const elements = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `md-line-${i}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    const headerMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const Tag = `h${level + 3}`;
      elements.push(/* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Tag, { className: `hsk-markdown-h${level}`, children: parseInline(headerMatch[2], key) }, key));
      i++;
      continue;
    }
    if (line.match(/^[-*]\s+/)) {
      const listItems = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        const itemText = lines[i].replace(/^[-*]\s+/, "");
        listItems.push(/* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { children: parseInline(itemText, `li-${i}`) }, `li-${i}`));
        i++;
      }
      elements.push(/* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ul", { className: "hsk-markdown-list", children: listItems }, `ul-${key}`));
      continue;
    }
    if (line.trim().startsWith("|")) {
      const tableRows = [];
      let isHeader = true;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const rowLine = lines[i].trim();
        if (rowLine.match(/^\|[-:| ]+\|$/)) {
          i++;
          isHeader = false;
          continue;
        }
        const cells = rowLine.split("|").slice(1, -1).map((c) => c.trim());
        const Tag = isHeader ? "th" : "td";
        tableRows.push(
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("tr", { children: cells.map((cell, cIdx) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Tag, { children: parseInline(cell, `td-${i}-${cIdx}`) }, `td-${i}-${cIdx}`)) }, `tr-${i}`)
        );
        i++;
      }
      elements.push(
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "hsk-table-wrapper", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("table", { className: "hsk-markdown-table", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("tbody", { children: tableRows }) }) }, `table-wrapper-${key}`)
      );
      continue;
    }
    elements.push(
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "hsk-markdown-p", children: parseInline(line, key) }, key)
    );
    i++;
  }
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_jsx_runtime3.Fragment, { children: elements });
}

// src/components/Sparkle.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var SparkleIcon = ({ className }) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("svg", { className, width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" }) });
var CloseIcon = () => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
] });
var ArrowUpIcon = () => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "m5 12 7-7 7 7" }),
  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "M12 19V5" })
] });
var getFriendlyError = (err) => {
  let str = "";
  if (typeof err === "string") str = err;
  else if (err && typeof err === "object" && err.message) str = err.message;
  else try {
    str = JSON.stringify(err);
  } catch (e) {
    str = String(err);
  }
  if (str.toLowerCase().includes("token limit")) {
    return "You've reached your usage limit. Please update your billing limits in your dashboard to continue.";
  }
  try {
    const parsed = JSON.parse(str);
    return parsed.error || parsed.message || str;
  } catch (e) {
    return str;
  }
};
function SparkleModal({
  productName,
  limit,
  backdropColor,
  backdropBlur,
  onClose,
  onNavigate,
  onResult,
  theme,
  classNames = {},
  product: initialProduct
}) {
  var _a, _b, _c;
  const client = useHuskelContext();
  const [fetchedProduct, setFetchedProduct] = (0, import_react9.useState)(null);
  const displayProduct = initialProduct || fetchedProduct;
  const { results, loading: searchLoading, search } = useSearch();
  const { messages, sources, loading: chatLoading, error: chatError, send } = useChat();
  const [chatInput, setChatInput] = (0, import_react9.useState)("");
  const chatBottomRef = (0, import_react9.useRef)(null);
  const chatTextareaRef = (0, import_react9.useRef)(null);
  (0, import_react9.useEffect)(() => {
    if (!initialProduct && !fetchedProduct) {
      client.api.searchVector(productName, 1).then((res) => {
        if (res.results && res.results.length > 0) {
          setFetchedProduct(res.results[0].product);
        }
      }).catch((err) => console.error("[Huskel] Failed to fetch product details", err));
    }
    search(productName, limit);
  }, [productName, initialProduct, fetchedProduct, client, limit, search]);
  (0, import_react9.useEffect)(() => {
    if (results.length > 0) onResult == null ? void 0 : onResult(results);
  }, [results, onResult]);
  (0, import_react9.useEffect)(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  (0, import_react9.useEffect)(() => {
    var _a2;
    (_a2 = chatBottomRef.current) == null ? void 0 : _a2.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);
  const blurVal = typeof backdropBlur === "number" ? `${backdropBlur}px` : backdropBlur != null ? backdropBlur : "16px";
  const bg = backdropColor != null ? backdropColor : void 0;
  const handleNav = (r) => {
    const prevent = onNavigate == null ? void 0 : onNavigate(r);
    if (prevent !== false) {
      onClose();
      if (r.product.url) window.location.href = r.product.url;
    }
  };
  const handleSend = async (text) => {
    const q = (text != null ? text : chatInput).trim();
    if (!q || chatLoading) return;
    setChatInput("");
    if (chatTextareaRef.current) {
      chatTextareaRef.current.style.height = "auto";
    }
    if (messages.length === 0 && displayProduct) {
      const contextQuery = `[Context: Shopper is viewing "${displayProduct.name}". Price: ${displayProduct.price}. Description: ${displayProduct.description || ""}]

Question: ${q}`;
      await send(contextQuery, q);
    } else {
      await send(q);
    }
  };
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  const handleInput = (e) => {
    setChatInput(e.target.value);
    const t = e.target;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 140)}px`;
  };
  const customStyles = __spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues({}, (theme == null ? void 0 : theme.primaryColor) && { "--hsk-primary": theme.primaryColor }), (theme == null ? void 0 : theme.backgroundColor) && { "--hsk-bg": theme.backgroundColor }), (theme == null ? void 0 : theme.textColor) && { "--hsk-text": theme.textColor }), (theme == null ? void 0 : theme.fontFamily) && { "--hsk-font": theme.fontFamily }), (theme == null ? void 0 : theme.borderRadius) && { "--hsk-border-radius": theme.borderRadius });
  const displayMessages = messages.length === 0 && displayProduct ? [
    {
      role: "assistant",
      content: `Hi! I can help you with **${displayProduct.name}**. Ask me about its specifications, features, compare it with other options, or find alternatives!`
    }
  ] : messages;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    "div",
    {
      className: `hsk-sp-backdrop ${classNames.backdrop || ""}`,
      onClick: onClose,
      style: __spreadValues({
        backdropFilter: `blur(${blurVal})`,
        WebkitBackdropFilter: `blur(${blurVal})`,
        background: bg != null ? bg : void 0
      }, customStyles),
      children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: `hsk-sp-card hsk-sp-fullscreen ${classNames.card || ""}`, onClick: (e) => e.stopPropagation(), children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "hsk-sp-header", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "hsk-sp-header-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SparkleIcon, {}) }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "hsk-sp-header-body", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-sp-header-title", children: (displayProduct == null ? void 0 : displayProduct.name) || productName }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-sp-header-sub", children: "Ask questions, compare specs, or check similar products" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "hsk-sp-close", onClick: onClose, "aria-label": "Close", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(CloseIcon, {}) })
        ] }),
        searchLoading && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-sp-bar" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "hsk-sp-body", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "hsk-sp-details-pane", children: [
            displayProduct && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "hsk-sp-product-profile-container", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "hsk-sp-product-profile", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-sp-details-imgwrap", children: ((_a = displayProduct.images) == null ? void 0 : _a[0]) ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("img", { src: displayProduct.images[0], alt: displayProduct.name }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "hsk-sp-img-placeholder", children: "\u{1F6CD}" }) }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "hsk-sp-details-meta", children: [
                  displayProduct.brand && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "hsk-sp-item-brand", children: displayProduct.brand }),
                  displayProduct.category && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "hsk-sp-item-cat", children: displayProduct.category }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h2", { className: "hsk-sp-details-name", children: displayProduct.name }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "hsk-sp-item-price-row", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "hsk-sp-item-currency", children: (_b = displayProduct.currency) != null ? _b : "KES" }),
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "hsk-sp-item-price", children: parseFloat(((_c = displayProduct.price) == null ? void 0 : _c.replace(/[^0-9.]/g, "")) || "0").toLocaleString() }),
                    displayProduct.originalPrice && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "hsk-sp-item-original-price", children: parseFloat(displayProduct.originalPrice.replace(/[^0-9.]/g, "") || "0").toLocaleString() }),
                    displayProduct.discount && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "hsk-sp-item-discount", children: [
                      "(",
                      displayProduct.discount,
                      ")"
                    ] })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "hsk-sp-item-meta-badges", children: [
                    displayProduct.rating && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "hsk-sp-meta-badge hsk-sp-meta-badge-rating", children: [
                      "\u2605 ",
                      parseFloat(displayProduct.rating.toString()).toFixed(1),
                      " ",
                      displayProduct.reviewCount ? `(${displayProduct.reviewCount})` : ""
                    ] }),
                    displayProduct.availability && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: `hsk-sp-meta-badge hsk-sp-meta-badge-avail ${displayProduct.availability.toLowerCase().includes("in") ? "in-stock" : "out-stock"}`, children: displayProduct.availability }),
                    displayProduct.stock && !displayProduct.availability && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "hsk-sp-meta-badge hsk-sp-meta-badge-stock", children: [
                      "Stock: ",
                      displayProduct.stock
                    ] })
                  ] })
                ] })
              ] }),
              displayProduct.specs && Object.keys(displayProduct.specs).length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-sp-specs-horizontal", children: Object.entries(displayProduct.specs).map(([key, val]) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "hsk-sp-spec-item-horizontal", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "hsk-sp-spec-label-horizontal", children: [
                  key,
                  ":"
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "hsk-sp-spec-value-horizontal", title: val, children: val })
              ] }, key)) }),
              displayProduct.description && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "hsk-sp-details-desc", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h4", { children: "Description" }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: displayProduct.description })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "hsk-sp-similar-section", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { children: "Similar Products" }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-sp-results", children: (() => {
                const similarProducts = results.filter(
                  (r) => {
                    var _a2;
                    const isSameName = r.product.name.toLowerCase() === ((_a2 = displayProduct == null ? void 0 : displayProduct.name) == null ? void 0 : _a2.toLowerCase());
                    const isSameSlug = r.product.slug && (displayProduct == null ? void 0 : displayProduct.slug) && r.product.slug.toLowerCase() === displayProduct.slug.toLowerCase();
                    return !isSameName && !isSameSlug;
                  }
                );
                if (!searchLoading && similarProducts.length === 0) {
                  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-sp-empty", children: "No similar products found." });
                }
                return similarProducts.map((r, i) => {
                  var _a2, _b2, _c2;
                  const price = parseFloat(((_a2 = r.product.price) == null ? void 0 : _a2.replace(/[^0-9.]/g, "")) || "0");
                  const currency = (_b2 = r.product.currency) != null ? _b2 : "KES";
                  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
                    "div",
                    {
                      className: `hsk-sp-item ${classNames.item || ""}`,
                      style: { animationDelay: `${i * 55}ms` },
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-sp-img-wrap", children: ((_c2 = r.product.images) == null ? void 0 : _c2[0]) ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("img", { src: r.product.images[0], alt: r.product.name }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "hsk-sp-img-placeholder", children: "\u{1F6CD}" }) }),
                        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "hsk-sp-item-body", children: [
                          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
                            r.product.category && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-sp-item-cat", children: r.product.category }),
                            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-sp-item-name", title: r.product.name, children: r.product.name })
                          ] }),
                          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "hsk-sp-item-price-row", children: [
                            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "hsk-sp-item-currency", children: currency }),
                            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "hsk-sp-item-price", children: price.toLocaleString() })
                          ] }),
                          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-sp-actions", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                            "button",
                            {
                              className: "hsk-sp-action hsk-sp-action-primary",
                              onClick: () => handleNav(r),
                              children: "View"
                            }
                          ) })
                        ] })
                      ]
                    },
                    r.id
                  );
                });
              })() })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "hsk-sp-chat-pane", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "hsk-cb-msgs", children: [
              displayMessages.map((msg, idx) => {
                const isUser = msg.role === "user";
                return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-cb-msg-group", children: isUser ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-cb-user-msg", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-cb-user-bubble", children: msg.content }) }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "hsk-cb-ai-msg", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-cb-ai-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SparkleIcon, {}) }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-cb-ai-body", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-cb-ai-text", children: renderMarkdown(msg.content) }) })
                ] }) }, idx);
              }),
              chatLoading && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "hsk-cb-typing-row", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-cb-ai-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SparkleIcon, {}) }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "hsk-cb-typing", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-cb-dot" }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-cb-dot" }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-cb-dot" })
                ] })
              ] }),
              chatError && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-cb-error", children: getFriendlyError(chatError) }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { ref: chatBottomRef, style: { height: 1 } })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "hsk-cb-input-wrap", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "hsk-cb-input-box", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  "textarea",
                  {
                    ref: chatTextareaRef,
                    className: "hsk-cb-textarea",
                    value: chatInput,
                    onChange: handleInput,
                    onKeyDown: handleKeyDown,
                    placeholder: "Ask about this product, specs, or comparison...",
                    rows: 1,
                    disabled: chatLoading
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  "button",
                  {
                    className: "hsk-cb-send",
                    onClick: () => handleSend(),
                    disabled: !chatInput.trim() || chatLoading,
                    "aria-label": "Send message",
                    children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(ArrowUpIcon, {})
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-cb-hint", children: "Huskel AI \xB7 instant product knowledge" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "hsk-sp-footer", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "hsk-sp-esc", children: "Esc to close" }) })
      ] })
    }
  );
}
function Sparkle({
  productName,
  limit = 8,
  onResult,
  backdropColor,
  backdropBlur,
  className,
  onNavigate,
  theme,
  classNames = {},
  product
}) {
  const [open, setOpen] = (0, import_react9.useState)(false);
  const [mounted, setMounted] = (0, import_react9.useState)(false);
  (0, import_react9.useEffect)(() => {
    setMounted(true);
  }, []);
  const customStyles = __spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues({}, (theme == null ? void 0 : theme.primaryColor) && { "--hsk-primary": theme.primaryColor }), (theme == null ? void 0 : theme.backgroundColor) && { "--hsk-bg": theme.backgroundColor }), (theme == null ? void 0 : theme.textColor) && { "--hsk-text": theme.textColor }), (theme == null ? void 0 : theme.fontFamily) && { "--hsk-font": theme.fontFamily }), (theme == null ? void 0 : theme.borderRadius) && { "--hsk-border-radius": theme.borderRadius });
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "button",
      {
        className: `hsk-sp-btn ${classNames.button || ""} ${className || ""}`,
        onClick: () => setOpen(true),
        style: customStyles,
        title: "Find similar products",
        "aria-label": "Find similar products",
        children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SparkleIcon, {})
      }
    ),
    open && mounted && (0, import_react_dom.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        SparkleModal,
        {
          productName,
          limit,
          onResult,
          backdropColor,
          backdropBlur,
          onClose: () => setOpen(false),
          onNavigate,
          theme,
          classNames,
          product
        }
      ),
      document.body
    )
  ] });
}

// src/components/ChatWidget.tsx
var import_react10 = require("react");
var import_jsx_runtime5 = require("react/jsx-runtime");
var SparkleIcon2 = () => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" }) });
var ArrowUpIcon2 = () => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "m5 12 7-7 7 7" }),
  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M12 19V5" })
] });
function SourceCard({ source, defaultCurrency, onSelect }) {
  var _a;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "hsk-source-card", onClick: () => onSelect == null ? void 0 : onSelect(source), children: [
    source.image && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("img", { src: source.image, alt: source.name, className: "hsk-source-img" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { flex: 1, minWidth: 0 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "hsk-source-name", children: source.name }),
      source.price && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "hsk-source-price", children: [
        (_a = source.currency) != null ? _a : defaultCurrency,
        " ",
        source.price
      ] })
    ] })
  ] });
}
function ChatWidget({
  title = "AI Shopping Assistant",
  placeholder = "Ask about anything in our store\u2026",
  emptyStateText = "Ask me anything about our products",
  emptyStateSuggestions = '"Find me headphones under KSh 5,000" \xB7 "Gift ideas"',
  defaultCurrency = "KES",
  className,
  theme,
  classNames = {},
  onSelectSource
}) {
  const { messages, sources, loading, error, send, reset } = useChat();
  const [input, setInput] = (0, import_react10.useState)("");
  const bottomRef = (0, import_react10.useRef)(null);
  const textareaRef = (0, import_react10.useRef)(null);
  (0, import_react10.useEffect)(() => {
    var _a;
    (_a = bottomRef.current) == null ? void 0 : _a.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);
  const handleSend = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await send(q);
  };
  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  const handleInput = (e) => {
    setInput(e.target.value);
    const t = e.target;
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, 120) + "px";
  };
  const customStyles = __spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues({}, (theme == null ? void 0 : theme.primaryColor) && { "--hsk-primary": theme.primaryColor }), (theme == null ? void 0 : theme.backgroundColor) && { "--hsk-bg": theme.backgroundColor }), (theme == null ? void 0 : theme.textColor) && { "--hsk-text": theme.textColor }), (theme == null ? void 0 : theme.fontFamily) && { "--hsk-font": theme.fontFamily }), (theme == null ? void 0 : theme.borderRadius) && { "--hsk-border-radius": theme.borderRadius });
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    "div",
    {
      className: `hsk-chat-widget ${classNames.root || ""} ${className || ""}`,
      style: customStyles,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: `hsk-chat-header ${classNames.header || ""}`, children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "hsk-chat-header-icon", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(SparkleIcon2, {}) }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "hsk-chat-title", children: title }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "hsk-chat-badge", children: "AI" }),
          messages.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { className: "hsk-chat-reset", onClick: reset, style: { marginLeft: "auto" }, children: "Clear" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "hsk-chat-messages", children: [
          messages.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "hsk-chat-empty", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "hsk-chat-empty-icon", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(SparkleIcon2, {}) }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { children: emptyStateText }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "hsk-chat-empty-suggestions", children: emptyStateSuggestions })
          ] }) : messages.map((msg, idx) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: `hsk-msg-row ${msg.role}`, children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: `hsk-msg-avatar ${msg.role === "assistant" ? "ai" : "user"}`, children: msg.role === "assistant" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(SparkleIcon2, {}) : "U" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: `hsk-msg-bubble ${msg.role} ${classNames.messageBubble || ""}`, children: renderMarkdown(msg.content) })
            ] }),
            msg.role === "assistant" && idx === messages.length - 1 && sources.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "hsk-sources-container", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "hsk-sources", children: sources.map((src, si) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(SourceCard, { source: src, defaultCurrency, onSelect: onSelectSource }, si)) }) })
          ] }, idx)),
          loading && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "hsk-msg-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "hsk-msg-avatar ai", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(SparkleIcon2, {}) }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "hsk-typing", children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "hsk-typing-dot" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "hsk-typing-dot" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "hsk-typing-dot" })
            ] })
          ] }),
          error && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "hsk-chat-error", children: (() => {
            try {
              const parsed = JSON.parse(error);
              return parsed.error || parsed.message || error;
            } catch (e) {
              return error;
            }
          })() }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { ref: bottomRef })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "hsk-chat-input-area", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "textarea",
            {
              ref: textareaRef,
              className: `hsk-chat-input ${classNames.input || ""}`,
              value: input,
              onChange: handleInput,
              onKeyDown: handleKey,
              placeholder,
              rows: 1,
              disabled: loading
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "button",
            {
              className: "hsk-chat-send",
              onClick: handleSend,
              disabled: !input.trim() || loading,
              "aria-label": "Send message",
              children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ArrowUpIcon2, {})
            }
          )
        ] })
      ]
    }
  );
}

// src/components/AIChatButton.tsx
var import_react11 = require("react");
var import_react_dom2 = require("react-dom");
var import_jsx_runtime6 = require("react/jsx-runtime");
var SparkleIcon3 = ({ className }) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("svg", { className, width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("path", { d: "m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" }) });
var ArrowUpIcon3 = () => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("path", { d: "m5 12 7-7 7 7" }),
  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("path", { d: "M12 19V5" })
] });
var CloseIcon2 = () => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
] });
var ChevronRightIcon = () => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("path", { d: "m9 18 6-6-6-6" }) });
var DEFAULT_CHIPS = [
  "Cheapest smartphone",
  "Smart TV under KSh 20,000",
  "Noise-cancelling headphones",
  "Best laptop for students"
];
function SourcesCarousel({ sources, defaultCurrency, onSelectSource }) {
  const railRef = (0, import_react11.useRef)(null);
  const [showNext, setShowNext] = (0, import_react11.useState)(false);
  const measure = (0, import_react11.useCallback)(() => {
    const el = railRef.current;
    if (!el) return;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
    setShowNext(el.scrollWidth > el.clientWidth + 4 && !atEnd);
  }, []);
  (0, import_react11.useEffect)(() => {
    measure();
    const el = railRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [measure, sources]);
  const scrollNext = () => {
    var _a;
    (_a = railRef.current) == null ? void 0 : _a.scrollBy({ left: 170, behavior: "smooth" });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "hsk-cb-sources-wrap", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "hsk-cb-sources", ref: railRef, children: sources.map((src, si) => {
      var _a;
      return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
        "div",
        {
          className: "hsk-cb-source",
          style: { animationDelay: `${si * 50}ms` },
          onClick: () => onSelectSource == null ? void 0 : onSelectSource(src),
          children: [
            src.image ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "hsk-cb-src-imgwrap", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("img", { src: src.image, alt: src.name, loading: "lazy" }) }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "hsk-cb-src-imgwrap-empty", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(SparkleIcon3, {}) }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "hsk-cb-src-info", children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "hsk-cb-src-name", children: src.name }),
              src.price && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "hsk-cb-src-price", children: [
                (_a = src.currency) != null ? _a : defaultCurrency,
                " ",
                parseFloat(src.price.replace(/[^0-9.]/g, "") || "0").toLocaleString()
              ] })
            ] })
          ]
        },
        si
      );
    }) }),
    showNext && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        "div",
        {
          className: "hsk-cb-sources-fade",
          style: { background: "linear-gradient(to right, transparent, var(--hsk-fade-bg, #0e0e0f))" }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { className: "hsk-cb-sources-next", onClick: scrollNext, "aria-label": "See more", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ChevronRightIcon, {}) })
    ] })
  ] });
}
function ChatModal({
  title = "Shopping Assistant",
  placeholder = "Ask me anything \u2014 gifts, budget, use case\u2026",
  backdropColor,
  backdropBlur,
  onClose,
  onSelectSource,
  defaultCurrency = "KES",
  chips = DEFAULT_CHIPS,
  theme,
  classNames = {}
}) {
  var _a, _b;
  const { messages, sources, loading, error, send, reset } = useChat();
  const [input, setInput] = (0, import_react11.useState)("");
  const [selectedProduct, setSelectedProduct] = (0, import_react11.useState)(null);
  const bottomRef = (0, import_react11.useRef)(null);
  const textareaRef = (0, import_react11.useRef)(null);
  (0, import_react11.useEffect)(() => {
    var _a2;
    (_a2 = bottomRef.current) == null ? void 0 : _a2.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, selectedProduct]);
  (0, import_react11.useEffect)(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);
  const handleSourceClick = (src) => {
    var _a2;
    setSelectedProduct(src);
    onSelectSource == null ? void 0 : onSelectSource(src);
    const q = `Tell me more about the ${src.name}${src.price ? ` (${(_a2 = src.currency) != null ? _a2 : defaultCurrency} ${src.price})` : ""} \u2014 what are its key specs, who is it best for, and is it worth buying?`;
    send(q);
  };
  const handleSend = async (text) => {
    const q = (text != null ? text : input).trim();
    if (!q || loading) return;
    setSelectedProduct(null);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    await send(q);
  };
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  const handleInput = (e) => {
    setInput(e.target.value);
    const t = e.target;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 140)}px`;
  };
  const blurVal = typeof backdropBlur === "number" ? `${backdropBlur}px` : backdropBlur != null ? backdropBlur : "20px";
  const customStyles = __spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues({}, (theme == null ? void 0 : theme.primaryColor) && { "--hsk-primary": theme.primaryColor }), (theme == null ? void 0 : theme.backgroundColor) && { "--hsk-bg": theme.backgroundColor }), (theme == null ? void 0 : theme.textColor) && { "--hsk-text": theme.textColor }), (theme == null ? void 0 : theme.fontFamily) && { "--hsk-font": theme.fontFamily }), (theme == null ? void 0 : theme.borderRadius) && { "--hsk-border-radius": theme.borderRadius });
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
    "div",
    {
      className: `hsk-cb-overlay ${classNames.overlay || ""}`,
      onClick: onClose,
      style: __spreadValues(__spreadValues({
        backdropFilter: `blur(${blurVal})`,
        WebkitBackdropFilter: `blur(${blurVal})`
      }, backdropColor ? { background: backdropColor } : {}), customStyles),
      children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: `hsk-cb-panel ${classNames.panel || ""}`, onClick: (e) => e.stopPropagation(), children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "hsk-cb-topbar", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "hsk-cb-topbar-left", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "hsk-cb-topbar-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(SparkleIcon3, {}) }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "hsk-cb-topbar-title", children: title }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "hsk-cb-topbar-actions", children: [
            messages.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { className: "hsk-cb-topbar-btn", onClick: reset, children: "Clear chat" }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { className: "hsk-cb-close", onClick: onClose, "aria-label": "Close", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(CloseIcon2, {}) })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "hsk-cb-msgs", children: [
          messages.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "hsk-cb-empty", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "hsk-cb-empty-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(SparkleIcon3, {}) }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "hsk-cb-empty-title", children: "Find exactly what you need" }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "hsk-cb-chips", children: chips.map((chip) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              "button",
              {
                className: "hsk-cb-chip",
                onClick: () => handleSend(chip),
                children: chip
              },
              chip
            )) })
          ] }) : messages.map((msg, idx) => {
            const isLast = idx === messages.length - 1;
            const isUser = msg.role === "user";
            return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "hsk-cb-msg-group", children: isUser ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "hsk-cb-user-msg", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "hsk-cb-user-bubble", children: msg.content }) }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "hsk-cb-ai-msg", children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "hsk-cb-ai-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(SparkleIcon3, {}) }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "hsk-cb-ai-body", children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "hsk-cb-ai-text", children: renderMarkdown(msg.content) }),
                isLast && sources.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                  SourcesCarousel,
                  {
                    sources,
                    defaultCurrency,
                    onSelectSource: handleSourceClick
                  }
                )
              ] })
            ] }) }, idx);
          }),
          selectedProduct && loading && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
            "div",
            {
              className: "hsk-cb-selected-product",
              onClick: () => selectedProduct.url && window.open(selectedProduct.url, "_blank"),
              children: [
                selectedProduct.image && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("img", { className: "hsk-cb-selected-img", src: selectedProduct.image, alt: selectedProduct.name }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "hsk-cb-selected-info", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "hsk-cb-selected-name", children: selectedProduct.name }),
                  selectedProduct.price && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "hsk-cb-selected-price", children: [
                    (_a = selectedProduct.currency) != null ? _a : defaultCurrency,
                    " ",
                    parseFloat(((_b = selectedProduct.price) != null ? _b : "").replace(/[^0-9.]/g, "") || "0").toLocaleString()
                  ] })
                ] })
              ]
            }
          ),
          loading && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "hsk-cb-typing-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "hsk-cb-ai-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(SparkleIcon3, {}) }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "hsk-cb-typing", children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "hsk-cb-dot" }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "hsk-cb-dot" }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "hsk-cb-dot" })
            ] })
          ] }),
          error && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "hsk-cb-error", children: error }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { ref: bottomRef, style: { height: 1 } })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "hsk-cb-input-wrap", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "hsk-cb-input-box", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              "textarea",
              {
                ref: textareaRef,
                className: `hsk-cb-textarea ${classNames.input || ""}`,
                value: input,
                onChange: handleInput,
                onKeyDown: handleKeyDown,
                placeholder,
                rows: 1,
                disabled: loading,
                autoFocus: true
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              "button",
              {
                className: `hsk-cb-send ${classNames.sendButton || ""}`,
                onClick: () => handleSend(),
                disabled: !input.trim() || loading,
                "aria-label": "Send message",
                children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ArrowUpIcon3, {})
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "hsk-cb-hint", children: "Huskel AI \xB7 searches the whole catalogue in real time" })
        ] })
      ] })
    }
  );
}
function AIChatButton({
  label,
  title,
  placeholder,
  backdropColor,
  backdropBlur,
  className,
  onSelectSource,
  defaultCurrency,
  chips,
  theme,
  classNames = {}
}) {
  const [open, setOpen] = (0, import_react11.useState)(false);
  const [mounted, setMounted] = (0, import_react11.useState)(false);
  (0, import_react11.useEffect)(() => {
    setMounted(true);
  }, []);
  const customStyles = __spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues({}, (theme == null ? void 0 : theme.primaryColor) && { "--hsk-primary": theme.primaryColor }), (theme == null ? void 0 : theme.backgroundColor) && { "--hsk-bg": theme.backgroundColor }), (theme == null ? void 0 : theme.textColor) && { "--hsk-text": theme.textColor }), (theme == null ? void 0 : theme.fontFamily) && { "--hsk-font": theme.fontFamily }), (theme == null ? void 0 : theme.borderRadius) && { "--hsk-border-radius": theme.borderRadius });
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
      "button",
      {
        className: `hsk-cb-btn ${classNames.button || ""} ${className || ""}`,
        onClick: () => setOpen(true),
        style: customStyles,
        "aria-label": "Open AI chat",
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "hsk-cb-btn-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(SparkleIcon3, {}) }),
          label !== void 0 ? label : null
        ]
      }
    ),
    open && mounted && (0, import_react_dom2.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        ChatModal,
        {
          title,
          placeholder,
          backdropColor,
          backdropBlur,
          onClose: () => setOpen(false),
          onSelectSource,
          defaultCurrency,
          chips,
          theme,
          classNames
        }
      ),
      document.body
    )
  ] });
}

// src/components/CartBadge.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
function CartBadge({ className }) {
  const { cart } = useCart();
  if (!cart || cart.item_count === 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: `hsk-cart-badge ${className || ""}`, children: cart.item_count });
}

// src/components/CartDrawer.tsx
var import_react13 = require("react");
var import_react_dom4 = require("react-dom");

// src/components/CheckoutModal.tsx
var import_react12 = require("react");
var import_react_dom3 = require("react-dom");
var import_jsx_runtime8 = require("react/jsx-runtime");
function CheckoutModal({
  onClose,
  theme,
  customStyles,
  hskThemeAttr
}) {
  var _a, _b, _c, _d;
  const { cart, loading: cartLoading } = useCart();
  const client = useHuskelContext();
  const [config, setConfig] = (0, import_react12.useState)(null);
  const [loading, setLoading] = (0, import_react12.useState)(true);
  const [checkingOut, setCheckingOut] = (0, import_react12.useState)(false);
  const [paymentSuccess, setPaymentSuccess] = (0, import_react12.useState)(false);
  (0, import_react12.useEffect)(() => {
    client.api.getCheckoutConfig().then((res) => setConfig(res.payment_methods)).catch((e) => console.error("[Huskel] Failed to fetch checkout config", e)).finally(() => setLoading(false));
  }, [client]);
  const handlePay = async (method) => {
    setCheckingOut(true);
    setTimeout(async () => {
      try {
        const payload = await client.api.checkoutCart();
        if (client.onCheckout) {
          client.onCheckout(payload);
        }
        setPaymentSuccess(true);
        setTimeout(() => {
          onClose();
        }, 3e3);
      } catch (e) {
        console.error("[Huskel] Checkout failed", e);
        setCheckingOut(false);
      }
    }, 1500);
  };
  const hasPaymentMethods = config && Object.values(config).some((m) => m.enabled);
  return (0, import_react_dom3.createPortal)(
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      "div",
      {
        className: "hsk-cart-backdrop",
        style: __spreadProps(__spreadValues({}, customStyles), { zIndex: 999999 }),
        "data-hsk-theme": hskThemeAttr,
        onClick: onClose,
        children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
          "div",
          {
            className: "hsk-checkout-modal",
            style: customStyles,
            "data-hsk-theme": hskThemeAttr,
            onClick: (e) => e.stopPropagation(),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hsk-checkout-header", children: [
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h2", { children: "Secure Checkout" }),
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { onClick: onClose, className: "hsk-close-btn", children: "\xD7" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "hsk-checkout-content", children: paymentSuccess ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hsk-checkout-success", children: [
                /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", className: "hsk-success-icon", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("path", { d: "M22 11.08V12a10 10 0 1 1-5.93-9.14" }),
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("polyline", { points: "22 4 12 14.01 9 11.01" })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h3", { children: "Payment Successful!" }),
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { children: "Thank you for your order." })
              ] }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hsk-checkout-split", children: [
                /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hsk-checkout-summary", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h3", { children: "Order Summary" }),
                  cartLoading || !cart ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "hsk-cart-loading", children: "Loading order..." }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("ul", { className: "hsk-checkout-items", children: cart.items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("li", { children: [
                      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
                        item.quantity,
                        "x ",
                        item.name
                      ] }),
                      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
                        item.currency,
                        " ",
                        (item.price_numeric * item.quantity).toLocaleString(void 0, { minimumFractionDigits: 2 })
                      ] })
                    ] }, item.id)) }),
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hsk-checkout-total", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "Total" }),
                      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
                        cart.currency,
                        " ",
                        cart.total.toLocaleString(void 0, { minimumFractionDigits: 2 })
                      ] })
                    ] })
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hsk-checkout-payment", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h3", { children: "Payment Method" }),
                  loading ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "hsk-cart-loading", children: "Loading secure payment methods..." }) : !hasPaymentMethods ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "hsk-checkout-error", children: "No payment methods are currently available for this store." }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hsk-payment-options", children: [
                    ((_a = config == null ? void 0 : config.mpesa) == null ? void 0 : _a.enabled) && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { onClick: () => handlePay("mpesa"), disabled: checkingOut, className: "hsk-pay-btn hsk-pay-mpesa", children: checkingOut ? "Processing..." : "Pay with M-Pesa" }),
                    ((_b = config == null ? void 0 : config.equity) == null ? void 0 : _b.enabled) && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { onClick: () => handlePay("equity"), disabled: checkingOut, className: "hsk-pay-btn hsk-pay-equity", children: checkingOut ? "Processing..." : "Pay with Equity Bank" }),
                    ((_c = config == null ? void 0 : config.stripe) == null ? void 0 : _c.enabled) && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { onClick: () => handlePay("stripe"), disabled: checkingOut, className: "hsk-pay-btn hsk-pay-stripe", children: checkingOut ? "Processing..." : "Pay with Card (Stripe)" }),
                    ((_d = config == null ? void 0 : config.paypal) == null ? void 0 : _d.enabled) && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { onClick: () => handlePay("paypal"), disabled: checkingOut, className: "hsk-pay-btn hsk-pay-paypal", children: checkingOut ? "Processing..." : "Pay with PayPal" })
                  ] })
                ] })
              ] }) })
            ]
          }
        )
      }
    ),
    document.body
  );
}

// src/components/CartDrawer.tsx
var import_jsx_runtime9 = require("react/jsx-runtime");
function CartDrawer({
  trigger,
  className,
  theme
}) {
  const { cart, loading } = useCart();
  const [open, setOpen] = (0, import_react13.useState)(false);
  const [showCheckout, setShowCheckout] = (0, import_react13.useState)(false);
  const [mounted, setMounted] = (0, import_react13.useState)(false);
  const client = useHuskelContext();
  (0, import_react13.useEffect)(() => {
    setMounted(true);
    const handleTriggerCheckout = () => {
      setShowCheckout(true);
      setOpen(false);
    };
    window.addEventListener("huskel:trigger_checkout", handleTriggerCheckout);
    return () => {
      window.removeEventListener("huskel:trigger_checkout", handleTriggerCheckout);
    };
  }, []);
  (0, import_react13.useEffect)(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  const handleCheckout = async () => {
    if (!cart || cart.items.length === 0) return;
    setShowCheckout(true);
  };
  const isStringTheme = typeof theme === "string";
  const hskThemeAttr = isStringTheme ? theme : void 0;
  const customStyles = !isStringTheme && theme ? __spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues({}, (theme == null ? void 0 : theme.primaryColor) && { "--hsk-primary": theme.primaryColor, "--hsk-primary-color": theme.primaryColor }), (theme == null ? void 0 : theme.backgroundColor) && { "--hsk-bg": theme.backgroundColor }), (theme == null ? void 0 : theme.textColor) && { "--hsk-text": theme.textColor }), (theme == null ? void 0 : theme.fontFamily) && { "--hsk-font": theme.fontFamily }), (theme == null ? void 0 : theme.borderRadius) && { "--hsk-border-radius": theme.borderRadius }) : void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { onClick: () => setOpen(true), style: { display: "inline-block" }, children: trigger || /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
      "button",
      {
        className: `hsk-cart-trigger ${className || ""}`,
        style: customStyles,
        "data-hsk-theme": hskThemeAttr,
        "aria-label": "Open cart",
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("circle", { cx: "9", cy: "21", r: "1" }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("circle", { cx: "20", cy: "21", r: "1" }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("path", { d: "M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" })
          ] }),
          cart && cart.item_count > 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "hsk-cart-trigger-badge", children: cart.item_count }) : null
        ]
      }
    ) }),
    open && mounted && (0, import_react_dom4.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
        "div",
        {
          className: "hsk-cart-backdrop",
          style: customStyles,
          "data-hsk-theme": hskThemeAttr,
          onClick: () => setOpen(false),
          children: /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
            "div",
            {
              className: "hsk-cart-bottom-sheet",
              style: customStyles,
              "data-hsk-theme": hskThemeAttr,
              onClick: (e) => e.stopPropagation(),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "hsk-cart-sheet-handle" }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "hsk-cart-sheet-header", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h2", { children: "Your Cart" }),
                  /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { onClick: () => setOpen(false), className: "hsk-close-btn", children: "\xD7" })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "hsk-cart-sheet-content", children: loading && !cart ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "hsk-cart-loading", children: "Loading cart..." }) : !cart || cart.items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "hsk-cart-empty", children: "Your cart is empty." }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("ul", { className: "hsk-cart-items", children: cart.items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("li", { className: "hsk-cart-item", children: [
                  item.image && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("img", { src: item.image, alt: item.name, className: "hsk-cart-item-img" }),
                  /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "hsk-cart-item-info", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "hsk-cart-item-name", children: item.name }),
                    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "hsk-cart-item-price", children: [
                      item.currency,
                      " ",
                      item.price_numeric.toLocaleString(void 0, { minimumFractionDigits: 2 })
                    ] })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "hsk-cart-item-qty", children: [
                    "x",
                    item.quantity
                  ] })
                ] }, item.id)) }) }),
                cart && cart.items.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "hsk-cart-sheet-footer", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "hsk-cart-total", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "Total" }),
                    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { children: [
                      cart.currency,
                      " ",
                      cart.total.toLocaleString(void 0, { minimumFractionDigits: 2 })
                    ] })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { onClick: handleCheckout, className: "hsk-checkout-btn", children: "Checkout securely" })
                ] })
              ]
            }
          )
        }
      ),
      document.body
    ),
    showCheckout && mounted && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
      CheckoutModal,
      {
        onClose: () => {
          setShowCheckout(false);
          setOpen(false);
        },
        theme: isStringTheme ? theme : void 0,
        customStyles,
        hskThemeAttr
      }
    )
  ] });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AIChatButton,
  CartBadge,
  CartDrawer,
  ChatWidget,
  HuskelAPI,
  HuskelClient,
  HuskelProvider,
  SearchBar,
  Sparkle,
  getHuskelClient,
  initHuskel,
  useCart,
  useChat,
  useHuskel,
  useIngest,
  usePageIngest,
  useSearch
});
//# sourceMappingURL=index.js.map