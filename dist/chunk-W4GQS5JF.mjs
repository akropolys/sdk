'use client';
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
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
      if (typeof window !== "undefined") {
        const phone = localStorage.getItem("huskel_user_phone");
        if (phone) {
          headers["X-Huskel-Shopper-Phone"] = phone;
        }
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
  // Streaming variant — returns the raw fetch Response.
  // The caller reads body as a ReadableStream of SSE frames.
  async chatStream(query, history = [], signal) {
    var _a, _b;
    log("info", "chatStream query", query);
    const headers = {
      "Content-Type": "application/json",
      "X-Huskel-Token": this.apiToken,
      "X-Huskel-Site": this.siteId
    };
    const shopperId = (_a = this.getShopperId) == null ? void 0 : _a.call(this);
    if (shopperId) headers["X-Huskel-Shopper-Id"] = shopperId;
    const sessionId = (_b = this.getSessionId) == null ? void 0 : _b.call(this);
    if (sessionId) headers["X-Huskel-Session-Id"] = sessionId;
    if (typeof window !== "undefined") {
      const phone = localStorage.getItem("huskel_user_phone");
      if (phone) headers["X-Huskel-Shopper-Phone"] = phone;
    }
    const res = await fetch(`${this.apiUrl}/chat/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, siteId: this.siteId, history }),
      signal
    });
    if (!res.ok || !res.body) {
      throw new Error(`Stream request failed: ${res.status}`);
    }
    return res;
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
    if (typeof window !== "undefined") {
      const phone = localStorage.getItem("huskel_user_phone");
      if (phone) {
        headers["X-Huskel-Shopper-Phone"] = phone;
      }
    }
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
  async initiatePayment(phoneNumber, email, firstName, lastName) {
    const res = await fetch(`${this.apiUrl}/payment/initiate`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({
        siteId: this.siteId,
        phoneNumber,
        email,
        firstName,
        lastName
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error("Failed to initiate payment: " + errText);
    }
    return res.json();
  }
  async getPaymentStatus(ref) {
    const res = await fetch(`${this.apiUrl}/payment/status?ref=${ref}`, {
      method: "GET",
      headers: this.buildHeaders()
    });
    if (!res.ok) throw new Error("Failed to get payment status");
    return res.json();
  }
};

// src/client.ts
function getEnvVar(key) {
  if (key === "NEXT_PUBLIC_HUSKEL_SITE_ID") {
    try {
      return process.env.NEXT_PUBLIC_HUSKEL_SITE_ID;
    } catch (e) {
    }
  }
  if (key === "NEXT_PUBLIC_HUSKEL_API_URL") {
    try {
      return process.env.NEXT_PUBLIC_HUSKEL_API_URL;
    } catch (e) {
    }
  }
  if (key === "NEXT_PUBLIC_HUSKEL_API_TOKEN") {
    try {
      return process.env.NEXT_PUBLIC_HUSKEL_API_TOKEN;
    } catch (e) {
    }
  }
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
  reRegister() {
    instance = this;
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
import { useRef } from "react";
function useHuskel(config) {
  const clientRef = useRef(null);
  if (!clientRef.current) {
    console.warn("[Huskel] useHuskel() is deprecated. Please wrap your application in <HuskelProvider> instead.");
    clientRef.current = initHuskel(config);
  }
  return clientRef.current;
}

// src/hooks/useSearch.ts
import { useState, useCallback, useRef as useRef3 } from "react";

// src/components/HuskelProvider.tsx
import { createContext, useContext, useEffect, useRef as useRef2 } from "react";
import { jsx } from "react/jsx-runtime";
var HuskelContext = createContext(null);
function HuskelProvider({ siteId, apiUrl, apiToken, shopperId, children }) {
  const clientRef = useRef2(null);
  if (!clientRef.current) {
    clientRef.current = new HuskelClient({ siteId, apiUrl, apiToken, shopperId });
  } else {
    clientRef.current.reRegister();
  }
  useEffect(() => {
    var _a;
    (_a = clientRef.current) == null ? void 0 : _a.setShopperId(shopperId);
  }, [shopperId]);
  useEffect(() => {
    var _a;
    (_a = clientRef.current) == null ? void 0 : _a.reRegister();
  }, []);
  useEffect(() => {
    return () => {
      var _a;
      (_a = clientRef.current) == null ? void 0 : _a.destroy();
    };
  }, []);
  return /* @__PURE__ */ jsx(HuskelContext.Provider, { value: clientRef.current, children });
}
function useHuskelContext() {
  const context = useContext(HuskelContext);
  if (!context) {
    return getHuskelClient();
  }
  return context;
}

// src/hooks/useSearch.ts
function useSearch() {
  const client = useHuskelContext();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const genRef = useRef3(0);
  const search = useCallback(async (query, limit = 8) => {
    var _a, _b;
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    const gen = ++genRef.current;
    setLoading(true);
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
  const clear = useCallback(() => {
    genRef.current++;
    setResults([]);
    setError(null);
    setLoading(false);
  }, []);
  return { results, loading, error, search, clear };
}

// src/hooks/useIngest.ts
import { useCallback as useCallback2, useState as useState2 } from "react";
function useIngest() {
  const client = useHuskelContext();
  const [loading, setLoading] = useState2(false);
  const [error, setError] = useState2(null);
  const ingest = useCallback2(async (product) => {
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
  const ingestBatch = useCallback2(async (products) => {
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
import { useEffect as useEffect2, useRef as useRef4 } from "react";
function usePageIngest(product) {
  var _a;
  const ingestedRef = useRef4(null);
  useEffect2(() => {
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
import { useState as useState3, useCallback as useCallback3, useRef as useRef5 } from "react";
function parseSSEChunk(raw) {
  const frames = [];
  const blocks = raw.split(/\n\n+/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = "";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data = line.slice(5);
    }
    if (data !== "") frames.push({ event, data });
  }
  return frames;
}
function useChat() {
  const client = useHuskelContext();
  const [messages, setMessages] = useState3([]);
  const [sources, setSources] = useState3([]);
  const [loading, setLoading] = useState3(false);
  const [streaming, setStreaming] = useState3(false);
  const [error, setError] = useState3(null);
  const [lastAction, setLastAction] = useState3(null);
  const [lastIntent, setLastIntent] = useState3(null);
  const abortRef = useRef5(null);
  const send = useCallback3(async (query, displayQuery) => {
    var _a, _b, _c, _d, _e, _f;
    if (!query.trim() || loading) return;
    (_a = abortRef.current) == null ? void 0 : _a.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    const userMsg = { role: "user", content: displayQuery != null ? displayQuery : query };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setStreaming(false);
    setError(null);
    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const response = await client.api.chatStream(query, history, signal);
      if (signal.aborted) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let metaIntent = "";
      let metaSources = [];
      let metaAction = null;
      let metaCheckout;
      let messageInitialised = false;
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done || signal.aborted) break;
        buffer += decoder.decode(value, { stream: true });
        const lastBoundary = buffer.lastIndexOf("\n\n");
        if (lastBoundary === -1) continue;
        const complete = buffer.slice(0, lastBoundary + 2);
        buffer = buffer.slice(lastBoundary + 2);
        const frames = parseSSEChunk(complete);
        for (const { event, data } of frames) {
          if (event === "meta") {
            try {
              const meta = JSON.parse(data);
              metaIntent = (_b = meta.intent) != null ? _b : "";
              metaSources = (_c = meta.sources) != null ? _c : [];
              metaAction = (_d = meta.action) != null ? _d : null;
              metaCheckout = meta.checkout;
              setSources(metaSources);
              if (metaIntent) setLastIntent(metaIntent);
              if (metaAction) setLastAction(metaAction);
            } catch (e) {
            }
            continue;
          }
          if (event === "done") break;
          if (event === "error") {
            let msg = "Chat request failed";
            try {
              msg = (_e = JSON.parse(data).error) != null ? _e : msg;
            } catch (e) {
              msg = data;
            }
            setError(msg);
            setMessages((prev) => prev.slice(0, -1));
            return;
          }
          const token = data.replace(/\\n/g, "\n");
          if (!messageInitialised) {
            setLoading(false);
            setStreaming(true);
            setMessages((prev) => [...prev, { role: "assistant", content: token }]);
            messageInitialised = true;
          } else {
            setMessages((prev) => {
              const next = [...prev];
              if (next.length > 0 && next[next.length - 1].role === "assistant") {
                next[next.length - 1] = __spreadProps(__spreadValues({}, next[next.length - 1]), {
                  content: next[next.length - 1].content + token
                });
              }
              return next;
            });
          }
        }
      }
      if (signal.aborted) return;
      const isCartAction = (metaAction == null ? void 0 : metaAction.type) === "add_to_cart" || (metaAction == null ? void 0 : metaAction.type) === "remove_from_cart" || (metaAction == null ? void 0 : metaAction.type) === "clear_cart" || (metaAction == null ? void 0 : metaAction.type) === "view_cart";
      if (isCartAction || metaCheckout) {
        setMessages((prev) => {
          const next = [...prev];
          if (next.length > 0 && next[next.length - 1].role === "assistant") {
            next[next.length - 1] = __spreadProps(__spreadValues({}, next[next.length - 1]), {
              cartSnapshot: metaCheckout,
              actionType: metaAction == null ? void 0 : metaAction.type
            });
          }
          return next;
        });
      }
      if (isCartAction || metaCheckout) {
        window.dispatchEvent(new CustomEvent("huskel:cart_updated", { detail: metaCheckout }));
      }
      if ((metaAction == null ? void 0 : metaAction.type) === "checkout") {
        window.dispatchEvent(new CustomEvent("huskel:trigger_checkout", { detail: metaCheckout }));
      }
      if ((metaAction == null ? void 0 : metaAction.type) === "awaiting_payment") {
        window.dispatchEvent(new CustomEvent("huskel:awaiting_payment", { detail: metaAction }));
      }
      if (metaCheckout && client.onCheckout) {
        client.onCheckout(metaCheckout);
      }
    } catch (e) {
      if (signal.aborted) return;
      let msg = (_f = e == null ? void 0 : e.message) != null ? _f : "Chat request failed";
      try {
        const parsed = JSON.parse(msg);
        if (parsed == null ? void 0 : parsed.error) msg = parsed.error;
      } catch (e2) {
      }
      setError(msg);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      if (!signal.aborted) {
        setLoading(false);
        setStreaming(false);
      }
    }
  }, [client, messages, loading]);
  const reset = useCallback3(() => {
    var _a;
    (_a = abortRef.current) == null ? void 0 : _a.abort();
    setMessages([]);
    setSources([]);
    setStreaming(false);
    setError(null);
    setLoading(false);
    setLastAction(null);
    setLastIntent(null);
  }, []);
  return { messages, sources, loading, streaming, error, lastAction, lastIntent, send, reset };
}

// src/hooks/useCart.ts
import { useState as useState4, useEffect as useEffect3, useCallback as useCallback4 } from "react";
function useCart() {
  const client = useHuskelContext();
  const [cart, setCart] = useState4(null);
  const [loading, setLoading] = useState4(false);
  const shopperId = client.getShopperId();
  const fetchCart = useCallback4(async () => {
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
  useEffect3(() => {
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

// src/hooks/usePaymentPolling.ts
import { useState as useState5, useEffect as useEffect4, useRef as useRef6 } from "react";
function usePaymentPolling({
  client,
  merchantReference,
  onSuccess,
  onFailure,
  intervalMs = 3e3,
  timeoutMs = 3e5
  // 5 minutes default
}) {
  const [status, setStatus] = useState5("IDLE");
  const [error, setError] = useState5(null);
  const onSuccessRef = useRef6(onSuccess);
  const onFailureRef = useRef6(onFailure);
  useEffect4(() => {
    onSuccessRef.current = onSuccess;
    onFailureRef.current = onFailure;
  }, [onSuccess, onFailure]);
  useEffect4(() => {
    if (!merchantReference) {
      setStatus("IDLE");
      setError(null);
      return;
    }
    setStatus("PENDING");
    setError(null);
    const startTime = Date.now();
    let timerId = null;
    async function checkStatus() {
      try {
        if (Date.now() - startTime >= timeoutMs) {
          setStatus("FAILED");
          setError("Payment session timed out");
          if (onFailureRef.current) onFailureRef.current("Payment session timed out");
          return;
        }
        const res = await client.getPaymentStatus(merchantReference);
        if (res.status === "COMPLETED") {
          setStatus("COMPLETED");
          if (onSuccessRef.current) onSuccessRef.current();
        } else if (res.status === "FAILED") {
          setStatus("FAILED");
          setError("Payment failed");
          if (onFailureRef.current) onFailureRef.current("Payment failed");
        } else {
          timerId = setTimeout(checkStatus, intervalMs);
        }
      } catch (err) {
        console.error("[Huskel Polling Error]", err);
        timerId = setTimeout(checkStatus, intervalMs);
      }
    }
    timerId = setTimeout(checkStatus, intervalMs);
    return () => {
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [client, merchantReference, intervalMs, timeoutMs]);
  return { status, error };
}

// src/components/SearchBar.tsx
import { useState as useState6, useEffect as useEffect5, useRef as useRef7 } from "react";

// src/utils/cn.ts
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// src/components/SearchBar.tsx
import { Fragment, jsx as jsx2, jsxs } from "react/jsx-runtime";
var SearchIcon = () => /* @__PURE__ */ jsxs("svg", { width: "15", height: "15", viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", children: [
  /* @__PURE__ */ jsx2("circle", { cx: "8.5", cy: "8.5", r: "5.5" }),
  /* @__PURE__ */ jsx2("line", { x1: "13", y1: "13", x2: "18", y2: "18" })
] });
function SearchBar({
  placeholder = "Search products\u2026",
  limit = 10,
  debounceMs = 300,
  onSelect,
  className,
  inputClassName,
  dropdownClassName,
  renderResult,
  theme,
  classNames = {}
}) {
  const [query, setQuery] = useState6("");
  const [open, setOpen] = useState6(false);
  const [isDebouncing, setIsDebouncing] = useState6(false);
  const { results, loading, search, clear } = useSearch();
  const client = useHuskelContext();
  const timer = useRef7();
  const wrap = useRef7(null);
  const ignoreNextQueryChange = useRef7(false);
  useEffect5(() => {
    if (ignoreNextQueryChange.current) {
      ignoreNextQueryChange.current = false;
      return;
    }
    clearTimeout(timer.current);
    if (!query.trim()) {
      clear();
      setOpen(false);
      setIsDebouncing(false);
      return;
    }
    setOpen(true);
    setIsDebouncing(true);
    timer.current = setTimeout(() => {
      setIsDebouncing(false);
      search(query, limit);
    }, debounceMs);
    return () => clearTimeout(timer.current);
  }, [query]);
  useEffect5(() => {
    const h = (e) => {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const handleSelect = (r) => {
    if (query.trim()) {
      client.api.searchVector(query, 1).catch(() => {
      });
    }
    ignoreNextQueryChange.current = true;
    setOpen(false);
    setQuery(r.product.name);
    onSelect == null ? void 0 : onSelect(r);
  };
  const handleCommitSearch = () => {
    if (!query.trim()) return;
    client.api.searchVector(query, 1).catch(() => {
    });
    if (results.length > 0) {
      handleSelect(results[0]);
    }
  };
  const showDrop = open && query.trim().length > 0;
  const customStyles = __spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues({}, (theme == null ? void 0 : theme.primaryColor) && { "--hsk-primary": theme.primaryColor }), (theme == null ? void 0 : theme.backgroundColor) && { "--hsk-bg": theme.backgroundColor }), (theme == null ? void 0 : theme.textColor) && { "--hsk-text": theme.textColor }), (theme == null ? void 0 : theme.fontFamily) && { "--hsk-font": theme.fontFamily }), (theme == null ? void 0 : theme.borderRadius) && { "--hsk-border-radius": theme.borderRadius });
  return /* @__PURE__ */ jsxs("div", { className: cn("hsk-sb-wrap", classNames.root, className), ref: wrap, style: customStyles, children: [
    /* @__PURE__ */ jsx2("span", { className: "hsk-sb-icon", children: /* @__PURE__ */ jsx2(SearchIcon, {}) }),
    /* @__PURE__ */ jsx2(
      "input",
      {
        className: cn("hsk-sb-input", classNames.input, inputClassName),
        type: "text",
        value: query,
        placeholder,
        onChange: (e) => setQuery(e.target.value),
        onFocus: () => results.length > 0 && query.trim() && setOpen(true),
        onKeyDown: (e) => {
          if (e.key === "Enter") {
            handleCommitSearch();
          }
        },
        autoComplete: "off",
        spellCheck: false
      }
    ),
    showDrop && /* @__PURE__ */ jsxs("div", { className: cn("hsk-sb-drop", classNames.dropdown, dropdownClassName), style: { position: "absolute" }, children: [
      (loading || isDebouncing) && /* @__PURE__ */ jsx2("div", { className: "hsk-sb-loading-bar" }),
      (loading || isDebouncing) && results.length === 0 ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "hsk-sb-skeleton-row", children: [
          /* @__PURE__ */ jsx2("span", { className: "hsk-sb-skeleton-icon" }),
          /* @__PURE__ */ jsxs("div", { className: "hsk-sb-row-body", children: [
            /* @__PURE__ */ jsx2("div", { className: "hsk-sb-skeleton-text1" }),
            /* @__PURE__ */ jsx2("div", { className: "hsk-sb-skeleton-text2" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "hsk-sb-skeleton-row", children: [
          /* @__PURE__ */ jsx2("span", { className: "hsk-sb-skeleton-icon" }),
          /* @__PURE__ */ jsxs("div", { className: "hsk-sb-row-body", children: [
            /* @__PURE__ */ jsx2("div", { className: "hsk-sb-skeleton-text1", style: { width: "45%" } }),
            /* @__PURE__ */ jsx2("div", { className: "hsk-sb-skeleton-text2", style: { width: "25%" } })
          ] })
        ] })
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        results.length === 0 && !loading && !isDebouncing && /* @__PURE__ */ jsxs("div", { className: "hsk-sb-empty", children: [
          "No results for \u201C",
          query,
          "\u201D"
        ] }),
        results.map((r, i) => {
          var _a;
          return renderResult ? /* @__PURE__ */ jsx2(
            "div",
            {
              onClick: () => handleSelect(r),
              className: "hsk-sb-fade",
              style: { animationDelay: `${i * 18}ms` },
              children: renderResult(r)
            },
            r.id
          ) : /* @__PURE__ */ jsxs(
            "div",
            {
              className: cn("hsk-sb-row hsk-sb-fade", classNames.row),
              style: { animationDelay: `${i * 18}ms` },
              onClick: () => handleSelect(r),
              children: [
                /* @__PURE__ */ jsx2("span", { className: "hsk-sb-row-icon", children: /* @__PURE__ */ jsx2(SearchIcon, {}) }),
                /* @__PURE__ */ jsxs("div", { className: "hsk-sb-row-body", children: [
                  /* @__PURE__ */ jsx2("div", { className: "hsk-sb-row-title", children: r.product.name }),
                  (r.product.category || r.product.brand) && /* @__PURE__ */ jsx2("div", { className: "hsk-sb-row-sub", children: (_a = r.product.category) != null ? _a : r.product.brand })
                ] })
              ]
            },
            r.id
          );
        })
      ] })
    ] })
  ] });
}

// src/components/Sparkle.tsx
import { useState as useState7, useEffect as useEffect6, useRef as useRef8 } from "react";
import { createPortal } from "react-dom";

// src/utils/markdown.tsx
import { Fragment as Fragment2, jsx as jsx3 } from "react/jsx-runtime";
var parseInline = (text, keyPrefix) => {
  const tokenRegex = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts = text.split(tokenRegex);
  return parts.map((part, index) => {
    if (!part) return null;
    const key = `${keyPrefix}-inline-${index}`;
    if (part.startsWith("`") && part.endsWith("`")) {
      return /* @__PURE__ */ jsx3("code", { className: "hsk-markdown-code", children: part.slice(1, -1) }, key);
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return /* @__PURE__ */ jsx3("strong", { children: parseInline(part.slice(2, -2), key) }, key);
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const url = linkMatch[2];
      const isSafeUrl = /^(https?|mailto|tel):/i.test(url) || url.startsWith("/");
      if (isSafeUrl) {
        return /* @__PURE__ */ jsx3("a", { href: url, target: "_blank", rel: "noopener noreferrer", className: "hsk-markdown-link", children: parseInline(linkMatch[1], key) }, key);
      }
      return /* @__PURE__ */ jsx3("span", { children: parseInline(linkMatch[1], key) }, key);
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
      elements.push(/* @__PURE__ */ jsx3(Tag, { className: `hsk-markdown-h${level}`, children: parseInline(headerMatch[2], key) }, key));
      i++;
      continue;
    }
    if (line.match(/^[-*]\s+/)) {
      const listItems = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        const itemText = lines[i].replace(/^[-*]\s+/, "");
        listItems.push(/* @__PURE__ */ jsx3("li", { children: parseInline(itemText, `li-${i}`) }, `li-${i}`));
        i++;
      }
      elements.push(/* @__PURE__ */ jsx3("ul", { className: "hsk-markdown-list", children: listItems }, `ul-${key}`));
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
          /* @__PURE__ */ jsx3("tr", { children: cells.map((cell, cIdx) => /* @__PURE__ */ jsx3(Tag, { children: parseInline(cell, `td-${i}-${cIdx}`) }, `td-${i}-${cIdx}`)) }, `tr-${i}`)
        );
        i++;
      }
      elements.push(
        /* @__PURE__ */ jsx3("div", { className: "hsk-table-wrapper", children: /* @__PURE__ */ jsx3("table", { className: "hsk-markdown-table", children: /* @__PURE__ */ jsx3("tbody", { children: tableRows }) }) }, `table-wrapper-${key}`)
      );
      continue;
    }
    elements.push(
      /* @__PURE__ */ jsx3("p", { className: "hsk-markdown-p", children: parseInline(line, key) }, key)
    );
    i++;
  }
  return /* @__PURE__ */ jsx3(Fragment2, { children: elements });
}

// src/components/Sparkle.tsx
import { Fragment as Fragment3, jsx as jsx4, jsxs as jsxs2 } from "react/jsx-runtime";
var SparkleIcon = ({ className, size = 16 }) => /* @__PURE__ */ jsxs2(
  "svg",
  {
    className: cn("hsk-brand-a", className),
    width: size,
    height: size,
    viewBox: "0 0 28 30",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-label": "Akropolys",
    children: [
      /* @__PURE__ */ jsx4(
        "path",
        {
          d: "M14.5 4.5 L6.5 25",
          stroke: "currentColor",
          strokeWidth: "2.2",
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ jsx4(
        "path",
        {
          d: "M14.5 4.5 L22.5 25",
          stroke: "currentColor",
          strokeWidth: "4.2",
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ jsx4(
        "path",
        {
          d: "M9.5 17 H19.5",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ jsx4(
        "path",
        {
          d: "M3 25 H10",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ jsx4(
        "path",
        {
          d: "M19 25 H26",
          stroke: "currentColor",
          strokeWidth: "2.5",
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ jsx4(
        "path",
        {
          d: "M8.5 2.5 C10 2.5, 11 3.5, 11 5 C11 7, 8.5 8.5, 7.5 9.5",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round",
          fill: "none",
          className: "hsk-akr-breath"
        }
      )
    ]
  }
);
var CloseIcon = () => /* @__PURE__ */ jsxs2("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsx4("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
  /* @__PURE__ */ jsx4("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
] });
var ArrowUpIcon = () => /* @__PURE__ */ jsxs2("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsx4("path", { d: "m5 12 7-7 7 7" }),
  /* @__PURE__ */ jsx4("path", { d: "M12 19V5" })
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
  const [fetchedProduct, setFetchedProduct] = useState7(null);
  const displayProduct = initialProduct || fetchedProduct;
  const { results, loading: searchLoading, search } = useSearch();
  const { messages, sources, loading: chatLoading, error: chatError, send } = useChat();
  const [chatInput, setChatInput] = useState7("");
  const chatBottomRef = useRef8(null);
  const chatTextareaRef = useRef8(null);
  useEffect6(() => {
    if (!initialProduct && !fetchedProduct) {
      client.api.searchVector(productName, 1).then((res) => {
        if (res.results && res.results.length > 0) {
          setFetchedProduct(res.results[0].product);
        }
      }).catch((err) => console.error("[Huskel] Failed to fetch product details", err));
    }
    search(productName, limit);
  }, [productName, initialProduct, fetchedProduct, client, limit, search]);
  useEffect6(() => {
    if (results.length > 0) onResult == null ? void 0 : onResult(results);
  }, [results, onResult]);
  useEffect6(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  useEffect6(() => {
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
  return /* @__PURE__ */ jsx4(
    "div",
    {
      className: cn("hsk-sp-backdrop", classNames.backdrop),
      onClick: onClose,
      style: __spreadValues({
        backdropFilter: `blur(${blurVal})`,
        WebkitBackdropFilter: `blur(${blurVal})`,
        background: bg != null ? bg : void 0
      }, customStyles),
      children: /* @__PURE__ */ jsxs2("div", { className: cn("hsk-sp-card hsk-sp-fullscreen", classNames.card), onClick: (e) => e.stopPropagation(), children: [
        /* @__PURE__ */ jsxs2("div", { className: "hsk-sp-header", children: [
          /* @__PURE__ */ jsx4("span", { className: "hsk-sp-header-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsx4(SparkleIcon, {}) }),
          /* @__PURE__ */ jsxs2("div", { className: "hsk-sp-header-body", children: [
            /* @__PURE__ */ jsx4("div", { className: "hsk-sp-header-title", children: (displayProduct == null ? void 0 : displayProduct.name) || productName }),
            /* @__PURE__ */ jsx4("div", { className: "hsk-sp-header-sub", children: "Ask questions, compare specs, or check similar products" })
          ] }),
          /* @__PURE__ */ jsx4("button", { className: "hsk-sp-close", onClick: onClose, "aria-label": "Close", children: /* @__PURE__ */ jsx4(CloseIcon, {}) })
        ] }),
        searchLoading && /* @__PURE__ */ jsx4("div", { className: "hsk-sp-bar" }),
        /* @__PURE__ */ jsxs2("div", { className: "hsk-sp-body", children: [
          /* @__PURE__ */ jsxs2("div", { className: "hsk-sp-details-pane", children: [
            displayProduct && /* @__PURE__ */ jsxs2("div", { className: "hsk-sp-product-profile-container", children: [
              /* @__PURE__ */ jsxs2("div", { className: "hsk-sp-product-profile", children: [
                /* @__PURE__ */ jsx4("div", { className: "hsk-sp-details-imgwrap", children: ((_a = displayProduct.images) == null ? void 0 : _a[0]) ? /* @__PURE__ */ jsx4("img", { src: displayProduct.images[0], alt: displayProduct.name }) : /* @__PURE__ */ jsx4("span", { className: "hsk-sp-img-placeholder", children: "\u{1F6CD}" }) }),
                /* @__PURE__ */ jsxs2("div", { className: "hsk-sp-details-meta", children: [
                  displayProduct.brand && /* @__PURE__ */ jsx4("span", { className: "hsk-sp-item-brand", children: displayProduct.brand }),
                  displayProduct.category && /* @__PURE__ */ jsx4("span", { className: "hsk-sp-item-cat", children: displayProduct.category }),
                  /* @__PURE__ */ jsx4("h2", { className: "hsk-sp-details-name", children: displayProduct.name }),
                  /* @__PURE__ */ jsxs2("div", { className: "hsk-sp-item-price-row", children: [
                    /* @__PURE__ */ jsx4("span", { className: "hsk-sp-item-currency", children: (_b = displayProduct.currency) != null ? _b : "KES" }),
                    /* @__PURE__ */ jsx4("span", { className: "hsk-sp-item-price", children: parseFloat(((_c = displayProduct.price) == null ? void 0 : _c.replace(/[^0-9.]/g, "")) || "0").toLocaleString() }),
                    displayProduct.originalPrice && /* @__PURE__ */ jsx4("span", { className: "hsk-sp-item-original-price", children: parseFloat(displayProduct.originalPrice.replace(/[^0-9.]/g, "") || "0").toLocaleString() }),
                    displayProduct.discount && /* @__PURE__ */ jsxs2("span", { className: "hsk-sp-item-discount", children: [
                      "(",
                      displayProduct.discount,
                      ")"
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs2("div", { className: "hsk-sp-item-meta-badges", children: [
                    displayProduct.rating && /* @__PURE__ */ jsxs2("span", { className: "hsk-sp-meta-badge hsk-sp-meta-badge-rating", children: [
                      "\u2605 ",
                      parseFloat(displayProduct.rating.toString()).toFixed(1),
                      " ",
                      displayProduct.reviewCount ? `(${displayProduct.reviewCount})` : ""
                    ] }),
                    displayProduct.availability && /* @__PURE__ */ jsx4("span", { className: `hsk-sp-meta-badge hsk-sp-meta-badge-avail ${displayProduct.availability.toLowerCase().includes("in") ? "in-stock" : "out-stock"}`, children: displayProduct.availability }),
                    displayProduct.stock && !displayProduct.availability && /* @__PURE__ */ jsxs2("span", { className: "hsk-sp-meta-badge hsk-sp-meta-badge-stock", children: [
                      "Stock: ",
                      displayProduct.stock
                    ] })
                  ] })
                ] })
              ] }),
              displayProduct.specs && Object.keys(displayProduct.specs).length > 0 && /* @__PURE__ */ jsx4("div", { className: "hsk-sp-specs-horizontal", children: Object.entries(displayProduct.specs).map(([key, val]) => /* @__PURE__ */ jsxs2("div", { className: "hsk-sp-spec-item-horizontal", children: [
                /* @__PURE__ */ jsxs2("span", { className: "hsk-sp-spec-label-horizontal", children: [
                  key,
                  ":"
                ] }),
                /* @__PURE__ */ jsx4("span", { className: "hsk-sp-spec-value-horizontal", title: val, children: val })
              ] }, key)) }),
              displayProduct.description && /* @__PURE__ */ jsxs2("div", { className: "hsk-sp-details-desc", children: [
                /* @__PURE__ */ jsx4("h4", { children: "Description" }),
                /* @__PURE__ */ jsx4("p", { children: displayProduct.description })
              ] })
            ] }),
            /* @__PURE__ */ jsxs2("div", { className: "hsk-sp-similar-section", children: [
              /* @__PURE__ */ jsx4("h3", { children: "Similar Products" }),
              /* @__PURE__ */ jsx4("div", { className: "hsk-sp-results", children: (() => {
                const similarProducts = results.filter(
                  (r) => {
                    var _a2;
                    const isSameName = r.product.name.toLowerCase() === ((_a2 = displayProduct == null ? void 0 : displayProduct.name) == null ? void 0 : _a2.toLowerCase());
                    const isSameSlug = r.product.slug && (displayProduct == null ? void 0 : displayProduct.slug) && r.product.slug.toLowerCase() === displayProduct.slug.toLowerCase();
                    return !isSameName && !isSameSlug;
                  }
                );
                if (!searchLoading && similarProducts.length === 0) {
                  return /* @__PURE__ */ jsx4("div", { className: "hsk-sp-empty", children: "No similar products found." });
                }
                return similarProducts.map((r, i) => {
                  var _a2, _b2, _c2;
                  const price = parseFloat(((_a2 = r.product.price) == null ? void 0 : _a2.replace(/[^0-9.]/g, "")) || "0");
                  const currency = (_b2 = r.product.currency) != null ? _b2 : "KES";
                  return /* @__PURE__ */ jsxs2(
                    "div",
                    {
                      className: cn("hsk-sp-item", classNames.item),
                      style: { animationDelay: `${i * 55}ms` },
                      children: [
                        /* @__PURE__ */ jsx4("div", { className: "hsk-sp-img-wrap", children: ((_c2 = r.product.images) == null ? void 0 : _c2[0]) ? /* @__PURE__ */ jsx4("img", { src: r.product.images[0], alt: r.product.name }) : /* @__PURE__ */ jsx4("span", { className: "hsk-sp-img-placeholder", children: "\u{1F6CD}" }) }),
                        /* @__PURE__ */ jsxs2("div", { className: "hsk-sp-item-body", children: [
                          /* @__PURE__ */ jsxs2("div", { children: [
                            r.product.category && /* @__PURE__ */ jsx4("div", { className: "hsk-sp-item-cat", children: r.product.category }),
                            /* @__PURE__ */ jsx4("div", { className: "hsk-sp-item-name", title: r.product.name, children: r.product.name })
                          ] }),
                          /* @__PURE__ */ jsxs2("div", { className: "hsk-sp-item-price-row", children: [
                            /* @__PURE__ */ jsx4("span", { className: "hsk-sp-item-currency", children: currency }),
                            /* @__PURE__ */ jsx4("span", { className: "hsk-sp-item-price", children: price.toLocaleString() })
                          ] }),
                          /* @__PURE__ */ jsx4("div", { className: "hsk-sp-actions", children: /* @__PURE__ */ jsx4(
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
          /* @__PURE__ */ jsxs2("div", { className: "hsk-sp-chat-pane", children: [
            /* @__PURE__ */ jsxs2("div", { className: "hsk-cb-msgs", children: [
              displayMessages.map((msg, idx) => {
                const isUser = msg.role === "user";
                return /* @__PURE__ */ jsx4("div", { className: "hsk-cb-msg-group", children: isUser ? /* @__PURE__ */ jsx4("div", { className: "hsk-cb-user-msg", children: /* @__PURE__ */ jsx4("div", { className: "hsk-cb-user-bubble", children: msg.content }) }) : /* @__PURE__ */ jsxs2("div", { className: "hsk-cb-ai-msg", children: [
                  /* @__PURE__ */ jsx4("div", { className: "hsk-cb-ai-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsx4(SparkleIcon, {}) }),
                  /* @__PURE__ */ jsx4("div", { className: "hsk-cb-ai-body", children: /* @__PURE__ */ jsx4("div", { className: "hsk-cb-ai-text", children: renderMarkdown(msg.content) }) })
                ] }) }, idx);
              }),
              chatLoading && /* @__PURE__ */ jsxs2("div", { className: "hsk-cb-typing-row", children: [
                /* @__PURE__ */ jsx4("div", { className: "hsk-cb-ai-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsx4(SparkleIcon, {}) }),
                /* @__PURE__ */ jsxs2("div", { className: "hsk-cb-typing", children: [
                  /* @__PURE__ */ jsx4("div", { className: "hsk-cb-dot" }),
                  /* @__PURE__ */ jsx4("div", { className: "hsk-cb-dot" }),
                  /* @__PURE__ */ jsx4("div", { className: "hsk-cb-dot" })
                ] })
              ] }),
              chatError && /* @__PURE__ */ jsx4("div", { className: "hsk-cb-error", children: getFriendlyError(chatError) }),
              /* @__PURE__ */ jsx4("div", { ref: chatBottomRef, style: { height: 1 } })
            ] }),
            /* @__PURE__ */ jsxs2("div", { className: "hsk-cb-input-wrap", children: [
              /* @__PURE__ */ jsxs2("div", { className: "hsk-cb-input-box", children: [
                /* @__PURE__ */ jsx4(
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
                /* @__PURE__ */ jsx4(
                  "button",
                  {
                    className: "hsk-cb-send",
                    onClick: () => handleSend(),
                    disabled: !chatInput.trim() || chatLoading,
                    "aria-label": "Send message",
                    children: /* @__PURE__ */ jsx4(ArrowUpIcon, {})
                  }
                )
              ] }),
              /* @__PURE__ */ jsx4("div", { className: "hsk-cb-hint", children: "Akropolys \xB7 instant product knowledge" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx4("div", { className: "hsk-sp-footer", children: /* @__PURE__ */ jsx4("span", { className: "hsk-sp-esc", children: "Esc to close" }) })
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
  const [open, setOpen] = useState7(false);
  const [mounted, setMounted] = useState7(false);
  useEffect6(() => {
    setMounted(true);
  }, []);
  const customStyles = __spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues({}, (theme == null ? void 0 : theme.primaryColor) && { "--hsk-primary": theme.primaryColor }), (theme == null ? void 0 : theme.backgroundColor) && { "--hsk-bg": theme.backgroundColor }), (theme == null ? void 0 : theme.textColor) && { "--hsk-text": theme.textColor }), (theme == null ? void 0 : theme.fontFamily) && { "--hsk-font": theme.fontFamily }), (theme == null ? void 0 : theme.borderRadius) && { "--hsk-border-radius": theme.borderRadius });
  return /* @__PURE__ */ jsxs2(Fragment3, { children: [
    /* @__PURE__ */ jsx4(
      "button",
      {
        className: cn("hsk-sp-btn", classNames.button, className),
        onClick: () => setOpen(true),
        style: customStyles,
        title: "Find similar products",
        "aria-label": "Find similar products",
        children: /* @__PURE__ */ jsx4(SparkleIcon, {})
      }
    ),
    open && mounted && createPortal(
      /* @__PURE__ */ jsx4(
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
import { useState as useState8, useRef as useRef9, useEffect as useEffect7 } from "react";
import { jsx as jsx5, jsxs as jsxs3 } from "react/jsx-runtime";
var SparkleIcon2 = () => /* @__PURE__ */ jsx5("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx5("path", { d: "m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" }) });
var ArrowUpIcon2 = () => /* @__PURE__ */ jsxs3("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsx5("path", { d: "m5 12 7-7 7 7" }),
  /* @__PURE__ */ jsx5("path", { d: "M12 19V5" })
] });
function SourceCard({ source, defaultCurrency, onSelect }) {
  var _a;
  return /* @__PURE__ */ jsxs3("div", { className: "hsk-source-card", onClick: () => onSelect == null ? void 0 : onSelect(source), children: [
    source.image && /* @__PURE__ */ jsx5("img", { src: source.image, alt: source.name, className: "hsk-source-img" }),
    /* @__PURE__ */ jsxs3("div", { style: { flex: 1, minWidth: 0 }, children: [
      /* @__PURE__ */ jsx5("div", { className: "hsk-source-name", children: source.name }),
      source.price && /* @__PURE__ */ jsxs3("div", { className: "hsk-source-price", children: [
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
  const [input, setInput] = useState8("");
  const bottomRef = useRef9(null);
  const textareaRef = useRef9(null);
  useEffect7(() => {
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
  return /* @__PURE__ */ jsxs3(
    "div",
    {
      className: cn("hsk-chat-widget", classNames.root, className),
      style: customStyles,
      children: [
        /* @__PURE__ */ jsxs3("div", { className: cn("hsk-chat-header", classNames.header), children: [
          /* @__PURE__ */ jsx5("span", { className: "hsk-chat-header-icon", children: /* @__PURE__ */ jsx5(SparkleIcon2, {}) }),
          /* @__PURE__ */ jsx5("span", { className: "hsk-chat-title", children: title }),
          /* @__PURE__ */ jsx5("span", { className: "hsk-chat-badge", children: "AI" }),
          messages.length > 0 && /* @__PURE__ */ jsx5("button", { className: "hsk-chat-reset", onClick: reset, style: { marginLeft: "auto" }, children: "Clear" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "hsk-chat-messages", children: [
          messages.length === 0 ? /* @__PURE__ */ jsxs3("div", { className: "hsk-chat-empty", children: [
            /* @__PURE__ */ jsx5("div", { className: "hsk-chat-empty-icon", children: /* @__PURE__ */ jsx5(SparkleIcon2, {}) }),
            /* @__PURE__ */ jsx5("div", { children: emptyStateText }),
            /* @__PURE__ */ jsx5("div", { className: "hsk-chat-empty-suggestions", children: emptyStateSuggestions })
          ] }) : messages.map((msg, idx) => /* @__PURE__ */ jsxs3("div", { children: [
            /* @__PURE__ */ jsxs3("div", { className: `hsk-msg-row ${msg.role}`, children: [
              /* @__PURE__ */ jsx5("div", { className: cn("hsk-msg-avatar", msg.role === "assistant" ? "ai" : "user"), children: msg.role === "assistant" ? /* @__PURE__ */ jsx5(SparkleIcon2, {}) : "U" }),
              /* @__PURE__ */ jsx5("div", { className: cn("hsk-msg-bubble", msg.role, classNames.messageBubble), children: renderMarkdown(msg.content) })
            ] }),
            msg.role === "assistant" && idx === messages.length - 1 && sources.length > 0 && /* @__PURE__ */ jsx5("div", { className: "hsk-sources-container", children: /* @__PURE__ */ jsx5("div", { className: "hsk-sources", children: sources.map((src, si) => /* @__PURE__ */ jsx5(SourceCard, { source: src, defaultCurrency, onSelect: onSelectSource }, si)) }) })
          ] }, idx)),
          loading && /* @__PURE__ */ jsxs3("div", { className: "hsk-msg-row", children: [
            /* @__PURE__ */ jsx5("div", { className: "hsk-msg-avatar ai", children: /* @__PURE__ */ jsx5(SparkleIcon2, {}) }),
            /* @__PURE__ */ jsxs3("div", { className: "hsk-pending", role: "status", "aria-live": "polite", children: [
              /* @__PURE__ */ jsxs3("div", { className: "hsk-pending-glyph", children: [
                /* @__PURE__ */ jsx5("span", { className: "hsk-pending-ring" }),
                /* @__PURE__ */ jsx5("span", { className: "hsk-pending-dot" })
              ] }),
              /* @__PURE__ */ jsxs3("div", { className: "hsk-pending-text", children: [
                /* @__PURE__ */ jsx5("span", { className: "hsk-pending-step step-1", children: "Searching catalog" }),
                /* @__PURE__ */ jsx5("span", { className: "hsk-pending-step step-2", children: "Reasoning" }),
                /* @__PURE__ */ jsx5("span", { className: "hsk-pending-step step-3", children: "Composing" })
              ] })
            ] })
          ] }),
          error && /* @__PURE__ */ jsx5("div", { className: "hsk-chat-error", children: (() => {
            try {
              const parsed = JSON.parse(error);
              return parsed.error || parsed.message || error;
            } catch (e) {
              return error;
            }
          })() }),
          /* @__PURE__ */ jsx5("div", { ref: bottomRef })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "hsk-chat-input-area", children: [
          /* @__PURE__ */ jsx5(
            "textarea",
            {
              ref: textareaRef,
              className: cn("hsk-chat-input", classNames.input),
              value: input,
              onChange: handleInput,
              onKeyDown: handleKey,
              placeholder,
              rows: 1,
              disabled: loading
            }
          ),
          /* @__PURE__ */ jsx5(
            "button",
            {
              className: "hsk-chat-send",
              onClick: handleSend,
              disabled: !input.trim() || loading,
              "aria-label": "Send message",
              children: /* @__PURE__ */ jsx5(ArrowUpIcon2, {})
            }
          )
        ] })
      ]
    }
  );
}

// src/components/AIChatButton.tsx
import { useState as useState9, useEffect as useEffect8, useRef as useRef10, useCallback as useCallback5 } from "react";
import { createPortal as createPortal2 } from "react-dom";

// src/components/ComparisonMatrix.tsx
import { jsx as jsx6, jsxs as jsxs4 } from "react/jsx-runtime";
function extractSize(p) {
  const name = p.name;
  const cat = (p.category || "").toLowerCase();
  const mExplicit = name.match(/(\d+(?:\.\d+)?)\s*(?:inch(?:es)?|["'″])/i);
  if (mExplicit) {
    return `${mExplicit[1]} inches`;
  }
  if (cat.includes("tv") || cat.includes("audio")) {
    const mTv = name.match(/\b(\d{2})(?:[a-zA-Z]|\b)/);
    if (mTv) {
      const size = parseInt(mTv[1], 10);
      if (size >= 24 && size <= 120) {
        return `${size} inches`;
      }
    }
  }
  return null;
}
function extractResolution(name) {
  if (/\b4K\b/i.test(name)) return "4K Ultra HD (2160p)";
  if (/\bUHD\b/i.test(name)) return "Ultra HD (2160p)";
  if (/\b(?:Full HD|FHD|1080p)\b/i.test(name)) return "Full HD (1080p)";
  if (/\b(?:HD|720p)\b/i.test(name)) return "HD (720p)";
  return null;
}
function extractStorage(name) {
  const m = name.match(/(\d+)\s*GB(?!\s*RAM)/i);
  return m ? `${m[1]} GB` : null;
}
function extractRAM(name) {
  const m = name.match(/(\d+)\s*GB\s*RAM/i);
  return m ? `${m[1]} GB` : null;
}
function extractCamera(name) {
  const m = name.match(/(\d+)\s*MP/i);
  return m ? `${m[1]} MP` : null;
}
function extractBattery(name) {
  const m = name.match(/(\d{3,5})\s*mAh/i);
  return m ? `${m[1]} mAh` : null;
}
function buildRows(products, currency) {
  const rows = [];
  rows.push({
    label: "Product Preview",
    values: products.map((s) => s.image || null),
    type: "image"
  });
  const prices = products.map((s) => {
    var _a;
    const n = parseFloat(String((_a = s.price) != null ? _a : "").replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  });
  const priceLabels = products.map((s, i) => {
    const c = s.currency || currency;
    const n = prices[i];
    return n !== null ? `${c} ${n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;
  });
  const validPrices = prices.filter((p) => p !== null);
  const minPrice = validPrices.length ? Math.min(...validPrices) : null;
  rows.push({
    label: "Price",
    values: priceLabels,
    type: "price",
    bestIdx: minPrice !== null ? prices.indexOf(minPrice) : void 0
  });
  const brands = products.map((s) => s.brand || null);
  if (brands.some(Boolean)) rows.push({ label: "Brand", values: brands });
  const specDefs = [
    { label: "Display Size", fn: extractSize },
    { label: "Resolution", fn: (p) => extractResolution(p.name), higherIsBetter: true },
    { label: "Storage", fn: (p) => extractStorage(p.name), higherIsBetter: true },
    { label: "RAM", fn: (p) => extractRAM(p.name), higherIsBetter: true },
    { label: "Camera", fn: (p) => extractCamera(p.name), higherIsBetter: true },
    { label: "Battery", fn: (p) => extractBattery(p.name), higherIsBetter: true }
  ];
  const resOrder = ["4K Ultra HD (2160p)", "Ultra HD (2160p)", "Full HD (1080p)", "HD (720p)"];
  for (const { label, fn, higherIsBetter } of specDefs) {
    const vals = products.map((s) => fn(s));
    if (!vals.some(Boolean)) continue;
    let bestIdx;
    if (higherIsBetter && vals.filter(Boolean).length > 1) {
      if (label === "Resolution") {
        bestIdx = vals.reduce((best, v, i) => {
          var _a;
          const rank = resOrder.indexOf(v != null ? v : "");
          const bestRank = resOrder.indexOf((_a = vals[best]) != null ? _a : "");
          return rank !== -1 && (bestRank === -1 || rank < bestRank) ? i : best;
        }, 0);
      } else {
        const nums = vals.map((v) => parseFloat((v != null ? v : "").replace(/[^0-9.]/g, "")));
        const max = Math.max(...nums.filter((n) => !isNaN(n)));
        bestIdx = nums.indexOf(max);
      }
    }
    rows.push({ label, values: vals, bestIdx });
  }
  const avail = products.map((s) => {
    var _a;
    const a = (_a = s.availability) != null ? _a : "";
    if (!a) return null;
    if (/in.?stock/i.test(a)) return "In-Stock";
    if (/out.?of.?stock/i.test(a)) return "Out of Stock";
    return a;
  });
  if (avail.some(Boolean)) {
    rows.push({ label: "Availability", values: avail, type: "availability" });
  }
  const cats = products.map((s) => s.category || null);
  if (cats.some(Boolean)) rows.push({ label: "Category", values: cats });
  return rows;
}
function ImageCell({ value, name }) {
  if (!value) {
    return /* @__PURE__ */ jsx6("div", { style: { fontSize: 28, textAlign: "center" }, children: "\u{1F4E6}" });
  }
  return /* @__PURE__ */ jsx6(
    "img",
    {
      src: value,
      alt: name,
      style: {
        width: 72,
        height: 72,
        objectFit: "contain",
        borderRadius: 8,
        background: "#f5f5f5",
        display: "block"
      }
    }
  );
}
function AvailabilityCell({ value }) {
  if (!value) return /* @__PURE__ */ jsx6("span", { style: { color: "#9ca3af" }, children: "\u2014" });
  const inStock = /in.?stock/i.test(value);
  return /* @__PURE__ */ jsxs4("span", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--hsk-text, #111827)" }, children: [
    /* @__PURE__ */ jsx6("span", { style: {
      width: 8,
      height: 8,
      borderRadius: "50%",
      flexShrink: 0,
      background: inStock ? "#22c55e" : "#ef4444",
      boxShadow: inStock ? "0 0 0 3px rgba(34,197,94,0.2)" : "0 0 0 3px rgba(239,68,68,0.2)",
      display: "inline-block"
    } }),
    value
  ] });
}
function ComparisonMatrix({ sources, defaultCurrency = "KES" }) {
  if (sources.length < 2) return null;
  const products = sources.slice(0, 3);
  const rows = buildRows(products, defaultCurrency);
  const colTemplate = `140px repeat(${products.length}, 1fr)`;
  const labelStyle = {
    padding: "10px 12px",
    fontSize: 11,
    fontWeight: 700,
    // Solid dark fallback — never inherit a muted ancestor color
    color: "var(--hsk-text-muted, #4b5563)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderBottom: "1px solid var(--hsk-border, rgba(0,0,0,0.07))",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "center"
  };
  const cellBase = {
    padding: "10px 14px",
    fontSize: 13,
    // Explicit color so cells are always readable regardless of parent theme
    color: "var(--hsk-text, #111827)",
    borderBottom: "1px solid var(--hsk-border, rgba(0,0,0,0.07))",
    verticalAlign: "middle",
    display: "flex",
    alignItems: "center"
  };
  return /* @__PURE__ */ jsxs4(
    "div",
    {
      className: "hsk-compare-matrix",
      style: {
        marginTop: 10,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid var(--hsk-border, rgba(0,0,0,0.09))",
        background: "var(--hsk-surface, #fff)",
        fontSize: 13
      },
      children: [
        /* @__PURE__ */ jsxs4("div", { style: { display: "grid", gridTemplateColumns: colTemplate, background: "var(--hsk-surface2, #f9fafb)", borderBottom: "2px solid var(--hsk-border, rgba(0,0,0,0.09))" }, children: [
          /* @__PURE__ */ jsx6("div", { style: __spreadProps(__spreadValues({}, labelStyle), { borderBottom: "none", color: "var(--hsk-text, #111)", fontSize: 12 }), children: "Feature" }),
          products.map((p, i) => /* @__PURE__ */ jsx6(
            "a",
            {
              href: p.url || "#",
              target: "_blank",
              rel: "noopener noreferrer",
              style: {
                display: "flex",
                alignItems: "center",
                padding: "10px 14px",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--hsk-primary, #16a34a)",
                textDecoration: "none",
                lineHeight: 1.3,
                borderLeft: i > 0 ? "1px solid var(--hsk-border, rgba(0,0,0,0.07))" : "none"
              },
              children: p.name
            },
            i
          ))
        ] }),
        rows.map((row, rowIdx) => /* @__PURE__ */ jsxs4(
          "div",
          {
            style: {
              display: "grid",
              gridTemplateColumns: colTemplate,
              background: rowIdx % 2 === 1 ? "var(--hsk-surface2, rgba(0,0,0,0.015))" : "transparent"
            },
            children: [
              /* @__PURE__ */ jsx6("div", { style: labelStyle, children: row.label }),
              products.map((p, i) => {
                const val = row.values[i];
                const isBest = row.bestIdx === i && row.values.filter(Boolean).length > 1;
                if (row.type === "image") {
                  return /* @__PURE__ */ jsx6("div", { style: __spreadProps(__spreadValues({}, cellBase), { justifyContent: "center", padding: "12px", borderLeft: i > 0 ? "1px solid var(--hsk-border, rgba(0,0,0,0.07))" : "none" }), children: /* @__PURE__ */ jsx6(ImageCell, { value: val, name: p.name }) }, i);
                }
                if (row.type === "availability") {
                  return /* @__PURE__ */ jsx6("div", { style: __spreadProps(__spreadValues({}, cellBase), { borderLeft: i > 0 ? "1px solid var(--hsk-border, rgba(0,0,0,0.07))" : "none" }), children: /* @__PURE__ */ jsx6(AvailabilityCell, { value: val }) }, i);
                }
                return /* @__PURE__ */ jsx6(
                  "div",
                  {
                    style: __spreadProps(__spreadValues({}, cellBase), {
                      fontWeight: isBest ? 700 : 400,
                      // Always use a solid dark fallback — never 'inherit' which can be muted/invisible
                      color: isBest ? "var(--hsk-primary, #ea580c)" : row.type === "price" ? "var(--hsk-text, #374151)" : "var(--hsk-text, #111827)",
                      borderLeft: i > 0 ? "1px solid var(--hsk-border, rgba(0,0,0,0.07))" : "none"
                    }),
                    children: val != null ? val : /* @__PURE__ */ jsx6("span", { style: { color: "#9ca3af" }, children: "\u2014" })
                  },
                  i
                );
              })
            ]
          },
          rowIdx
        ))
      ]
    }
  );
}

// src/components/AIChatButton.tsx
import { Fragment as Fragment4, jsx as jsx7, jsxs as jsxs5 } from "react/jsx-runtime";
var AkropolysAIcon = ({ className, size = 18 }) => /* @__PURE__ */ jsxs5(
  "svg",
  {
    className: cn("hsk-brand-a", className),
    width: size,
    height: size,
    viewBox: "0 0 28 30",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-label": "Akropolys",
    children: [
      /* @__PURE__ */ jsx7(
        "path",
        {
          d: "M14.5 4.5 L6.5 25",
          stroke: "currentColor",
          strokeWidth: "2.2",
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ jsx7(
        "path",
        {
          d: "M14.5 4.5 L22.5 25",
          stroke: "currentColor",
          strokeWidth: "4.2",
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ jsx7(
        "path",
        {
          d: "M9.5 17 H19.5",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ jsx7(
        "path",
        {
          d: "M3 25 H10",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ jsx7(
        "path",
        {
          d: "M19 25 H26",
          stroke: "currentColor",
          strokeWidth: "2.5",
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ jsx7(
        "path",
        {
          d: "M8.5 2.5 C10 2.5, 11 3.5, 11 5 C11 7, 8.5 8.5, 7.5 9.5",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round",
          fill: "none",
          className: "hsk-akr-breath"
        }
      )
    ]
  }
);
var SparkleIcon3 = AkropolysAIcon;
var ArrowUpIcon3 = () => /* @__PURE__ */ jsxs5("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsx7("path", { d: "m5 12 7-7 7 7" }),
  /* @__PURE__ */ jsx7("path", { d: "M12 19V5" })
] });
var CloseIcon2 = () => /* @__PURE__ */ jsxs5("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsx7("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
  /* @__PURE__ */ jsx7("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
] });
var ChevronRightIcon = () => /* @__PURE__ */ jsx7("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx7("path", { d: "m9 18 6-6-6-6" }) });
var HistoryIcon = () => /* @__PURE__ */ jsxs5("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsx7("path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }),
  /* @__PURE__ */ jsx7("path", { d: "M3 3v5h5" }),
  /* @__PURE__ */ jsx7("path", { d: "M12 7v5l4 2" })
] });
var NewChatIcon = () => /* @__PURE__ */ jsx7("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx7("path", { d: "M12 5v14M5 12h14" }) });
var ShoppingBagIcon = () => /* @__PURE__ */ jsxs5("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsx7("path", { d: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" }),
  /* @__PURE__ */ jsx7("line", { x1: "3", y1: "6", x2: "21", y2: "6" }),
  /* @__PURE__ */ jsx7("path", { d: "M16 10a4 4 0 0 1-8 0" })
] });
var DEFAULT_CHIPS = [
  "Cheapest smartphone",
  "Smart TV under KSh 20,000",
  "Noise-cancelling headphones",
  "Best laptop for students"
];
var SESSIONS_KEY = "huskel_chat_sessions";
var MAX_SESSIONS = 20;
function loadSessions() {
  try {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}
function saveSessions(sessions) {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch (e) {
  }
}
function relativeTime(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 6e4);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
function CartContextCard({ cart, defaultCurrency }) {
  var _a, _b, _c;
  if (!cart.items || cart.items.length === 0) return null;
  const currency = cart.currency || defaultCurrency;
  const total = (_a = cart.total) != null ? _a : cart.items.reduce((s, i) => s + i.price_numeric * i.quantity, 0);
  return /* @__PURE__ */ jsxs5("div", { className: "hsk-cart-card", children: [
    /* @__PURE__ */ jsxs5("div", { className: "hsk-cart-card-header", children: [
      /* @__PURE__ */ jsx7(ShoppingBagIcon, {}),
      /* @__PURE__ */ jsxs5("span", { children: [
        "Your cart \xB7 ",
        (_b = cart.item_count) != null ? _b : cart.items.length,
        " item",
        ((_c = cart.item_count) != null ? _c : cart.items.length) !== 1 ? "s" : ""
      ] })
    ] }),
    /* @__PURE__ */ jsx7("div", { className: "hsk-cart-items", children: cart.items.map((item) => /* @__PURE__ */ jsxs5("div", { className: "hsk-cart-item", children: [
      /* @__PURE__ */ jsxs5("div", { className: "hsk-cart-item-img-wrap", children: [
        item.image ? /* @__PURE__ */ jsx7("img", { className: "hsk-cart-item-img", src: item.image, alt: item.name, loading: "lazy" }) : /* @__PURE__ */ jsx7("div", { className: "hsk-cart-item-img-placeholder", children: /* @__PURE__ */ jsx7(ShoppingBagIcon, {}) }),
        item.quantity > 1 && /* @__PURE__ */ jsx7("span", { className: "hsk-cart-item-qty", children: item.quantity })
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "hsk-cart-item-info", children: [
        /* @__PURE__ */ jsx7("div", { className: "hsk-cart-item-name", children: item.name }),
        /* @__PURE__ */ jsxs5("div", { className: "hsk-cart-item-price", children: [
          item.quantity > 1 && /* @__PURE__ */ jsxs5("span", { className: "hsk-cart-item-qty-label", children: [
            item.quantity,
            "\xD7 "
          ] }),
          currency,
          " ",
          (item.price_numeric * item.quantity).toLocaleString()
        ] })
      ] })
    ] }, item.id)) }),
    /* @__PURE__ */ jsxs5("div", { className: "hsk-cart-total", children: [
      /* @__PURE__ */ jsx7("span", { children: "Total" }),
      /* @__PURE__ */ jsxs5("span", { className: "hsk-cart-total-amount", children: [
        currency,
        " ",
        total.toLocaleString()
      ] })
    ] })
  ] });
}
function ActionPills({ cart, actionType, onSend, loading }) {
  const hasItems = cart.items && cart.items.length > 0;
  const lastItem = hasItems ? cart.items[cart.items.length - 1] : null;
  const pills = [];
  if (hasItems && lastItem) {
    if (actionType === "add_to_cart") {
      pills.push({ emoji: "\u2795", label: "Add 1 more", query: `Add one more ${lastItem.name} to my cart` });
      pills.push({ emoji: "\u{1F5D1}\uFE0F", label: `Remove ${lastItem.name.split(" ")[0]}`, query: `Remove the ${lastItem.name} from my cart` });
    }
    if (cart.items.length > 1) {
      pills.push({ emoji: "\u{1F6D2}", label: "View cart", query: "Show me my cart" });
    }
    pills.push({ emoji: "\u{1F4B3}", label: "Checkout", query: "Proceed to checkout" });
    pills.push({ emoji: "\u{1F6CD}\uFE0F", label: "Keep shopping", query: "What else do you recommend?" });
  } else if (actionType === "clear_cart" || actionType === "remove_from_cart") {
    pills.push({ emoji: "\u{1F6CD}\uFE0F", label: "Continue shopping", query: "Show me popular products" });
    pills.push({ emoji: "\u{1F50D}", label: "Search again", query: "Help me find something" });
  } else if (actionType === "view_cart") {
    if (hasItems) {
      pills.push({ emoji: "\u{1F4B3}", label: "Checkout", query: "Proceed to checkout" });
      pills.push({ emoji: "\u{1F5D1}\uFE0F", label: "Clear cart", query: "Clear my cart" });
    }
  }
  if (pills.length === 0) return null;
  return /* @__PURE__ */ jsx7("div", { className: "hsk-action-pills", children: pills.map((pill) => /* @__PURE__ */ jsxs5(
    "button",
    {
      className: "hsk-action-pill",
      onClick: () => onSend(pill.query),
      disabled: loading,
      children: [
        /* @__PURE__ */ jsx7("span", { className: "hsk-pill-emoji", children: pill.emoji }),
        pill.label
      ]
    },
    pill.query
  )) });
}
function SourcesCarousel({ sources, defaultCurrency, onSelectSource }) {
  const railRef = useRef10(null);
  const [showNext, setShowNext] = useState9(false);
  const measure = useCallback5(() => {
    const el = railRef.current;
    if (!el) return;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
    setShowNext(el.scrollWidth > el.clientWidth + 4 && !atEnd);
  }, []);
  useEffect8(() => {
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
  return /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-sources-wrap", children: [
    /* @__PURE__ */ jsx7("div", { className: "hsk-cb-sources", ref: railRef, children: sources.map((src, si) => {
      var _a;
      return /* @__PURE__ */ jsxs5(
        "div",
        {
          className: "hsk-cb-source",
          style: { animationDelay: `${si * 50}ms` },
          onClick: () => onSelectSource == null ? void 0 : onSelectSource(src),
          children: [
            src.image ? /* @__PURE__ */ jsx7("div", { className: "hsk-cb-src-imgwrap", children: /* @__PURE__ */ jsx7("img", { src: src.image, alt: src.name, loading: "lazy" }) }) : /* @__PURE__ */ jsx7("div", { className: "hsk-cb-src-imgwrap-empty", children: /* @__PURE__ */ jsx7(SparkleIcon3, {}) }),
            /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-src-info", children: [
              /* @__PURE__ */ jsx7("div", { className: "hsk-cb-src-name", children: src.name }),
              src.price && /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-src-price", children: [
                (_a = src.currency) != null ? _a : defaultCurrency,
                " ",
                parseFloat(String(src.price).replace(/[^0-9.]/g, "") || "0").toLocaleString()
              ] })
            ] })
          ]
        },
        si
      );
    }) }),
    showNext && /* @__PURE__ */ jsxs5(Fragment4, { children: [
      /* @__PURE__ */ jsx7(
        "div",
        {
          className: "hsk-cb-sources-fade",
          style: { background: "linear-gradient(to right, transparent, var(--hsk-fade-bg, #0e0e0f))" }
        }
      ),
      /* @__PURE__ */ jsx7("button", { className: "hsk-cb-sources-next", onClick: scrollNext, "aria-label": "See more", children: /* @__PURE__ */ jsx7(ChevronRightIcon, {}) })
    ] })
  ] });
}
function stripMarkdownTables(content) {
  const lines = content.split("\n");
  const out = [];
  for (const line of lines) {
    if (line.trim().startsWith("|")) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
function SmartContextPills({
  intent,
  sources,
  onSend,
  loading
}) {
  var _a, _b;
  if (!intent) return null;
  const pills = [];
  const cheapest = sources.length > 0 ? sources.reduce((min, s) => {
    var _a2, _b2;
    const p = parseFloat(String((_a2 = s.price) != null ? _a2 : "").replace(/[^0-9.]/g, ""));
    const m = parseFloat(String((_b2 = min.price) != null ? _b2 : "").replace(/[^0-9.]/g, ""));
    return !isNaN(p) && (isNaN(m) || p < m) ? s : min;
  }, sources[0]) : null;
  const firstName = (_b = (_a = sources[0]) == null ? void 0 : _a.name) != null ? _b : "";
  const firstTwo = sources.slice(0, 2).map((s) => s.name);
  if (intent === "search" && sources.length > 0) {
    if (firstTwo.length >= 2) {
      pills.push({
        emoji: "\u2696\uFE0F",
        label: "Compare top 2",
        query: `Compare the ${firstTwo[0]} and ${firstTwo[1]}`
      });
    }
    if (cheapest) {
      const short = cheapest.name.split(" ").slice(0, 3).join(" ");
      pills.push({
        emoji: "\u{1F6D2}",
        label: `Add ${short}`,
        query: `Add the ${cheapest.name} to my cart`
      });
    }
    pills.push({ emoji: "\u{1F4B0}", label: "Under KSh 20K", query: "Show me options under KSh 20,000" });
  } else if (intent === "compare" && sources.length > 0) {
    if (cheapest) {
      const short = cheapest.name.split(" ").slice(0, 3).join(" ");
      pills.push({
        emoji: "\u{1F6D2}",
        label: `Add ${short}`,
        query: `Add the ${cheapest.name} to my cart`
      });
    }
    if (firstName) {
      pills.push({
        emoji: "\u{1F50D}",
        label: "Similar options",
        query: `Show me more products similar to the ${firstName}`
      });
    }
    pills.push({ emoji: "\u{1F4A1}", label: "Which is best?", query: "Which one would you recommend and why?" });
  } else if (intent === "specs" && sources.length > 0) {
    if (firstName) {
      pills.push({ emoji: "\u{1F6D2}", label: "Add to cart", query: `Add the ${firstName} to my cart` });
      pills.push({
        emoji: "\u{1F504}",
        label: "Find alternatives",
        query: `What are good alternatives to the ${firstName}?`
      });
    }
  } else if (intent === "general") {
    pills.push({ emoji: "\u{1F50D}", label: "Show popular items", query: "What are your most popular products?" });
    pills.push({ emoji: "\u{1F4A1}", label: "Recommend something", query: "What do you recommend for me?" });
  }
  if (pills.length === 0) return null;
  return /* @__PURE__ */ jsx7("div", { className: "hsk-action-pills", children: pills.map((pill) => /* @__PURE__ */ jsxs5(
    "button",
    {
      className: "hsk-action-pill",
      onClick: () => onSend(pill.query),
      disabled: loading,
      children: [
        /* @__PURE__ */ jsx7("span", { className: "hsk-pill-emoji", children: pill.emoji }),
        pill.label
      ]
    },
    pill.query
  )) });
}
var getFriendlyError2 = (err) => {
  let str = "";
  if (typeof err === "string") str = err;
  else if (err && typeof err === "object" && err.message) str = err.message;
  else try {
    str = JSON.stringify(err);
  } catch (e) {
    str = String(err);
  }
  const lower = str.toLowerCase();
  if (lower.includes("429") || lower.includes("too many requests") || lower.includes("requests per minute limit exceeded") || lower.includes("too_many_requests_error") || lower.includes("request_quota_exceeded") || lower.includes("quota")) {
    return "The assistant is currently receiving too many requests. Please try again in a few moments.";
  }
  if (lower.includes("token limit")) {
    return "You've reached your usage limit. Please update your billing limits in your dashboard to continue.";
  }
  try {
    const parsed = JSON.parse(str);
    return parsed.error || parsed.message || str;
  } catch (e) {
    return str;
  }
};
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
  const client = useHuskelContext();
  const { messages, sources, loading, streaming, error, lastAction, lastIntent, send, reset } = useChat();
  const [input, setInput] = useState9("");
  const [selectedProduct, setSelectedProduct] = useState9(null);
  const bottomRef = useRef10(null);
  const textareaRef = useRef10(null);
  const [phoneInput, setPhoneInput] = useState9(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("huskel_user_phone") || "";
    }
    return "";
  });
  const [merchantRef, setMerchantRef] = useState9(null);
  const [paymentPhase, setPaymentPhase] = useState9("idle");
  const [sessions, setSessions] = useState9(() => loadSessions());
  const [sidebarOpen, setSidebarOpen] = useState9(false);
  const [replayMessages, setReplayMessages] = useState9(null);
  const { status: pollStatus } = usePaymentPolling({
    client: client.api,
    merchantReference: merchantRef,
    onSuccess: () => {
      setPaymentPhase("done");
      setMerchantRef(null);
    },
    onFailure: () => {
      setPaymentPhase("failed");
      setMerchantRef(null);
    }
  });
  useEffect8(() => {
    var _a2;
    if (!lastAction) return;
    if (lastAction.type === "request_phone") {
      setPaymentPhase("prompt_phone");
    } else if (lastAction.type === "awaiting_payment") {
      setMerchantRef((_a2 = lastAction.merchantReference) != null ? _a2 : null);
      setPaymentPhase("awaiting");
    }
  }, [lastAction]);
  const isStringTheme = typeof theme === "string";
  const hskThemeAttr = isStringTheme ? theme : void 0;
  const customStyles = !isStringTheme && theme ? __spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues({}, (theme == null ? void 0 : theme.primaryColor) && { "--hsk-primary": theme.primaryColor }), (theme == null ? void 0 : theme.backgroundColor) && { "--hsk-bg": theme.backgroundColor }), (theme == null ? void 0 : theme.textColor) && { "--hsk-text": theme.textColor }), (theme == null ? void 0 : theme.fontFamily) && { "--hsk-font": theme.fontFamily }), (theme == null ? void 0 : theme.borderRadius) && { "--hsk-border-radius": theme.borderRadius }) : void 0;
  const handlePhoneSubmit = async () => {
    if (!phoneInput.trim()) return;
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("huskel_user_phone", phoneInput.trim());
      }
      const res = await client.api.initiatePayment(phoneInput.trim());
      setMerchantRef(res.merchantReference);
      setPaymentPhase("awaiting");
    } catch (e) {
      console.error("[Huskel] initiatePayment error", e);
      setPaymentPhase("failed");
    }
  };
  const msgsContainerRef = useRef10(null);
  useEffect8(() => {
    var _a2;
    const container = msgsContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 120) {
      (_a2 = bottomRef.current) == null ? void 0 : _a2.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading, selectedProduct]);
  useEffect8(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);
  const saveCurrentSession = useCallback5(() => {
    if (messages.length < 2) return;
    const firstUser = messages.find((m) => m.role === "user");
    const session = {
      id: `session_${Date.now()}`,
      title: firstUser ? firstUser.content.slice(0, 60) : "Chat session",
      messages,
      ts: Date.now()
    };
    const updated = [session, ...sessions].slice(0, MAX_SESSIONS);
    setSessions(updated);
    saveSessions(updated);
  }, [messages, sessions]);
  const handleReset = useCallback5(() => {
    saveCurrentSession();
    reset();
    setReplayMessages(null);
    setPaymentPhase("idle");
    setMerchantRef(null);
  }, [reset, saveCurrentSession]);
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
    setReplayMessages(null);
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
  const displayMessages = replayMessages != null ? replayMessages : messages;
  const loadSession = (session) => {
    setReplayMessages(session.messages);
    setSidebarOpen(false);
  };
  const deleteSession = (id, e) => {
    e.stopPropagation();
    const updated = sessions.filter((s) => s.id !== id);
    setSessions(updated);
    saveSessions(updated);
  };
  return /* @__PURE__ */ jsx7(
    "div",
    {
      className: cn("hsk-cb-overlay", classNames.overlay),
      onClick: onClose,
      "data-hsk-theme": hskThemeAttr,
      style: __spreadValues(__spreadValues({
        backdropFilter: `blur(${blurVal})`,
        WebkitBackdropFilter: `blur(${blurVal})`
      }, backdropColor ? { background: backdropColor } : {}), customStyles),
      children: /* @__PURE__ */ jsxs5("div", { className: cn("hsk-cb-panel hsk-cb-panel--with-sidebar", classNames.panel), onClick: (e) => e.stopPropagation(), children: [
        /* @__PURE__ */ jsxs5("div", { className: cn("hsk-cb-sidebar", sidebarOpen && "hsk-cb-sidebar--open"), children: [
          /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-sidebar-header", children: [
            /* @__PURE__ */ jsx7("span", { className: "hsk-cb-sidebar-title", children: "History" }),
            /* @__PURE__ */ jsxs5(
              "button",
              {
                className: "hsk-cb-sidebar-new",
                onClick: handleReset,
                title: "New chat",
                children: [
                  /* @__PURE__ */ jsx7(NewChatIcon, {}),
                  /* @__PURE__ */ jsx7("span", { children: "New chat" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsx7("div", { className: "hsk-cb-sidebar-list", children: sessions.length === 0 ? /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-sidebar-empty", children: [
            /* @__PURE__ */ jsx7(HistoryIcon, {}),
            /* @__PURE__ */ jsx7("span", { children: "No history yet" })
          ] }) : sessions.map((session) => /* @__PURE__ */ jsxs5(
            "div",
            {
              className: cn(
                "hsk-cb-sidebar-session",
                replayMessages === session.messages && "hsk-cb-sidebar-session--active"
              ),
              onClick: () => loadSession(session),
              children: [
                /* @__PURE__ */ jsx7("div", { className: "hsk-cb-sidebar-session-title", children: session.title }),
                /* @__PURE__ */ jsx7("div", { className: "hsk-cb-sidebar-session-meta", children: relativeTime(session.ts) }),
                /* @__PURE__ */ jsx7(
                  "button",
                  {
                    className: "hsk-cb-sidebar-session-del",
                    onClick: (e) => deleteSession(session.id, e),
                    title: "Delete",
                    children: "\xD7"
                  }
                )
              ]
            },
            session.id
          )) })
        ] }),
        /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-main", children: [
          /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-topbar", children: [
            /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-topbar-left", children: [
              /* @__PURE__ */ jsx7(
                "button",
                {
                  className: cn("hsk-cb-sidebar-toggle", sidebarOpen && "hsk-cb-sidebar-toggle--active"),
                  onClick: (e) => {
                    e.stopPropagation();
                    setSidebarOpen((v) => !v);
                  },
                  "aria-label": "Toggle history",
                  children: /* @__PURE__ */ jsx7(HistoryIcon, {})
                }
              ),
              /* @__PURE__ */ jsx7("span", { className: "hsk-cb-topbar-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsx7(SparkleIcon3, {}) }),
              /* @__PURE__ */ jsx7("div", { children: /* @__PURE__ */ jsx7("div", { className: "hsk-cb-topbar-title", children: title }) })
            ] }),
            /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-topbar-actions", children: [
              replayMessages ? /* @__PURE__ */ jsx7("button", { className: "hsk-cb-topbar-btn", onClick: () => {
                setReplayMessages(null);
              }, children: "\u2190 Live chat" }) : messages.length > 0 && /* @__PURE__ */ jsx7("button", { className: "hsk-cb-topbar-btn", onClick: handleReset, children: "Clear chat" }),
              /* @__PURE__ */ jsx7("button", { className: "hsk-cb-close", onClick: onClose, "aria-label": "Close", children: /* @__PURE__ */ jsx7(CloseIcon2, {}) })
            ] })
          ] }),
          replayMessages && /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-replay-banner", children: [
            /* @__PURE__ */ jsx7(HistoryIcon, {}),
            /* @__PURE__ */ jsx7("span", { children: "You're viewing a past conversation." }),
            /* @__PURE__ */ jsx7("button", { onClick: () => setReplayMessages(null), children: "Back to chat \u2192" })
          ] }),
          /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-msgs", ref: msgsContainerRef, children: [
            displayMessages.length === 0 ? /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-empty", children: [
              /* @__PURE__ */ jsx7("div", { className: "hsk-cb-empty-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsx7(SparkleIcon3, {}) }),
              /* @__PURE__ */ jsx7("div", { className: "hsk-cb-empty-title", children: "Find exactly what you need" }),
              /* @__PURE__ */ jsx7("div", { className: "hsk-cb-chips", children: chips.map((chip) => /* @__PURE__ */ jsx7(
                "button",
                {
                  className: "hsk-cb-chip",
                  onClick: () => handleSend(chip),
                  children: chip
                },
                chip
              )) })
            ] }) : displayMessages.map((msg, idx) => {
              var _a2;
              const isLast = idx === displayMessages.length - 1 && !replayMessages;
              const isUser = msg.role === "user";
              const displayContent = !isUser && isLast && lastIntent === "compare" && sources.length >= 2 && !replayMessages ? stripMarkdownTables(msg.content) : msg.content;
              return /* @__PURE__ */ jsx7("div", { className: "hsk-cb-msg-group", children: isUser ? /* @__PURE__ */ jsx7("div", { className: "hsk-cb-user-msg", children: /* @__PURE__ */ jsx7("div", { className: "hsk-cb-user-bubble", children: msg.content }) }) : /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-ai-msg", children: [
                /* @__PURE__ */ jsx7("div", { className: "hsk-cb-ai-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsx7(SparkleIcon3, {}) }),
                /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-ai-body", children: [
                  /* @__PURE__ */ jsx7("div", { className: "hsk-cb-ai-text", children: renderMarkdown(displayContent) }),
                  isLast && lastIntent === "compare" && sources.length >= 2 && !replayMessages && /* @__PURE__ */ jsx7(ComparisonMatrix, { sources, defaultCurrency }),
                  isLast && sources.length > 0 && lastIntent !== "compare" && (lastAction == null ? void 0 : lastAction.type) !== "request_phone" && (lastAction == null ? void 0 : lastAction.type) !== "awaiting_payment" && (lastAction == null ? void 0 : lastAction.type) !== "checkout" && !msg.cartSnapshot && /* @__PURE__ */ jsx7(
                    SourcesCarousel,
                    {
                      sources,
                      defaultCurrency,
                      onSelectSource: handleSourceClick
                    }
                  ),
                  msg.cartSnapshot && ((_a2 = msg.cartSnapshot.items) == null ? void 0 : _a2.length) > 0 && /* @__PURE__ */ jsx7(
                    CartContextCard,
                    {
                      cart: msg.cartSnapshot,
                      defaultCurrency
                    }
                  ),
                  isLast && msg.cartSnapshot && !loading && /* @__PURE__ */ jsx7(
                    ActionPills,
                    {
                      cart: msg.cartSnapshot,
                      actionType: msg.actionType,
                      onSend: handleSend,
                      loading
                    }
                  ),
                  isLast && !loading && !msg.cartSnapshot && !replayMessages && /* @__PURE__ */ jsx7(
                    SmartContextPills,
                    {
                      intent: lastIntent,
                      sources,
                      onSend: handleSend,
                      loading
                    }
                  )
                ] })
              ] }) }, idx);
            }),
            selectedProduct && loading && /* @__PURE__ */ jsxs5(
              "div",
              {
                className: "hsk-cb-selected-product",
                onClick: () => selectedProduct.url && window.open(selectedProduct.url, "_blank"),
                children: [
                  selectedProduct.image && /* @__PURE__ */ jsx7("img", { className: "hsk-cb-selected-img", src: selectedProduct.image, alt: selectedProduct.name }),
                  /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-selected-info", children: [
                    /* @__PURE__ */ jsx7("div", { className: "hsk-cb-selected-name", children: selectedProduct.name }),
                    selectedProduct.price && /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-selected-price", children: [
                      (_a = selectedProduct.currency) != null ? _a : defaultCurrency,
                      " ",
                      parseFloat(String((_b = selectedProduct.price) != null ? _b : "").replace(/[^0-9.]/g, "") || "0").toLocaleString()
                    ] })
                  ] })
                ]
              }
            ),
            loading && !streaming && /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-typing-row", children: [
              /* @__PURE__ */ jsx7("div", { className: "hsk-cb-ai-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsx7(SparkleIcon3, {}) }),
              /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-typing", children: [
                /* @__PURE__ */ jsx7("div", { className: "hsk-cb-dot" }),
                /* @__PURE__ */ jsx7("div", { className: "hsk-cb-dot" }),
                /* @__PURE__ */ jsx7("div", { className: "hsk-cb-dot" })
              ] })
            ] }),
            error && /* @__PURE__ */ jsx7("div", { className: "hsk-cb-error", children: getFriendlyError2(error) }),
            !replayMessages && paymentPhase === "prompt_phone" && /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-payment-prompt", children: [
              /* @__PURE__ */ jsx7("div", { className: "hsk-cb-payment-icon", children: "\u{1F4F1}" }),
              /* @__PURE__ */ jsx7("p", { className: "hsk-cb-payment-label", children: "Enter your M-Pesa number to pay" }),
              /* @__PURE__ */ jsx7(
                "input",
                {
                  type: "tel",
                  className: "hsk-cb-phone-input",
                  placeholder: "e.g. 0712 345 678",
                  value: phoneInput,
                  onChange: (e) => setPhoneInput(e.target.value),
                  onKeyDown: (e) => e.key === "Enter" && handlePhoneSubmit()
                }
              ),
              /* @__PURE__ */ jsx7("button", { className: "hsk-cb-pay-submit", onClick: handlePhoneSubmit, children: "Send STK Push \u2192" })
            ] }),
            !replayMessages && paymentPhase === "awaiting" && /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-payment-prompt hsk-cb-payment-prompt--awaiting", children: [
              /* @__PURE__ */ jsx7("div", { className: "hsk-cb-payment-pulse-ring" }),
              /* @__PURE__ */ jsx7("div", { className: "hsk-cb-payment-icon-wrap", children: /* @__PURE__ */ jsx7("span", { style: { fontSize: "2rem" }, children: "\u{1F4F1}" }) }),
              /* @__PURE__ */ jsx7("p", { className: "hsk-cb-payment-label", style: { fontWeight: 600 }, children: "Check your phone" }),
              /* @__PURE__ */ jsxs5("p", { className: "hsk-cb-payment-sub", children: [
                "An M-Pesa STK push has been sent.",
                /* @__PURE__ */ jsx7("br", {}),
                "Enter your PIN to complete payment."
              ] }),
              /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-payment-dots", children: [
                /* @__PURE__ */ jsx7("div", { className: "hsk-cb-dot hsk-cb-dot--amber" }),
                /* @__PURE__ */ jsx7("div", { className: "hsk-cb-dot hsk-cb-dot--amber" }),
                /* @__PURE__ */ jsx7("div", { className: "hsk-cb-dot hsk-cb-dot--amber" })
              ] })
            ] }),
            !replayMessages && paymentPhase === "done" && /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-payment-prompt hsk-cb-payment-prompt--success", children: [
              /* @__PURE__ */ jsx7("div", { className: "hsk-cb-payment-success-ring" }),
              /* @__PURE__ */ jsx7("div", { className: "hsk-cb-payment-icon-wrap", children: /* @__PURE__ */ jsx7("span", { style: { fontSize: "2.5rem" }, children: "\u2705" }) }),
              /* @__PURE__ */ jsx7("p", { className: "hsk-cb-payment-label", children: "Payment complete!" }),
              /* @__PURE__ */ jsx7("p", { className: "hsk-cb-payment-sub", children: "Thank you for your order. A confirmation has been sent." })
            ] }),
            !replayMessages && paymentPhase === "failed" && /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-payment-prompt hsk-cb-payment-prompt--failed", children: [
              /* @__PURE__ */ jsx7("div", { className: "hsk-cb-payment-icon-wrap", children: /* @__PURE__ */ jsx7("span", { style: { fontSize: "2.5rem" }, children: "\u274C" }) }),
              /* @__PURE__ */ jsx7("p", { className: "hsk-cb-payment-label", children: "Payment failed or timed out" }),
              /* @__PURE__ */ jsx7("p", { className: "hsk-cb-payment-sub", children: "Please check your M-Pesa PIN and try again, or contact support." }),
              /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-payment-actions", children: [
                /* @__PURE__ */ jsx7(
                  "button",
                  {
                    className: "hsk-cb-pay-submit",
                    onClick: () => {
                      setPaymentPhase("prompt_phone");
                      setMerchantRef(null);
                    },
                    children: "Try again"
                  }
                ),
                /* @__PURE__ */ jsx7(
                  "button",
                  {
                    className: "hsk-cb-pay-secondary",
                    onClick: () => {
                      setPaymentPhase("idle");
                      setMerchantRef(null);
                    },
                    children: "Cancel"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsx7("div", { ref: bottomRef, style: { height: 1 } })
          ] }),
          !replayMessages && /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-input-wrap", children: [
            /* @__PURE__ */ jsxs5("div", { className: "hsk-cb-input-box", children: [
              /* @__PURE__ */ jsx7(
                "textarea",
                {
                  ref: textareaRef,
                  className: cn("hsk-cb-textarea", classNames.input),
                  value: input,
                  onChange: handleInput,
                  onKeyDown: handleKeyDown,
                  placeholder,
                  rows: 1,
                  disabled: loading,
                  autoFocus: true
                }
              ),
              /* @__PURE__ */ jsx7(
                "button",
                {
                  className: cn("hsk-cb-send", classNames.sendButton),
                  onClick: () => handleSend(),
                  disabled: !input.trim() || loading,
                  "aria-label": "Send message",
                  children: /* @__PURE__ */ jsx7(ArrowUpIcon3, {})
                }
              )
            ] }),
            /* @__PURE__ */ jsx7("div", { className: "hsk-cb-hint", children: "Huskel AI \xB7 searches the whole catalogue in real time" })
          ] })
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
  const [open, setOpen] = useState9(false);
  const [mounted, setMounted] = useState9(false);
  useEffect8(() => {
    setMounted(true);
    if (typeof window !== "undefined" && !window.__huskel_nav_patched) {
      window.__huskel_nav_patched = true;
      const originalPush = window.history.pushState;
      const originalReplace = window.history.replaceState;
      window.history.pushState = function(...args) {
        originalPush.apply(this, args);
        window.dispatchEvent(new CustomEvent("huskel:navigation"));
      };
      window.history.replaceState = function(...args) {
        originalReplace.apply(this, args);
        window.dispatchEvent(new CustomEvent("huskel:navigation"));
      };
    }
    const handleNavigation = () => {
      setOpen(false);
    };
    window.addEventListener("popstate", handleNavigation);
    window.addEventListener("huskel:navigation", handleNavigation);
    return () => {
      window.removeEventListener("popstate", handleNavigation);
      window.removeEventListener("huskel:navigation", handleNavigation);
    };
  }, []);
  const isStringTheme = typeof theme === "string";
  const hskThemeAttr = isStringTheme ? theme : void 0;
  const customStyles = !isStringTheme && theme ? __spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues({}, (theme == null ? void 0 : theme.primaryColor) && { "--hsk-primary": theme.primaryColor }), (theme == null ? void 0 : theme.backgroundColor) && { "--hsk-bg": theme.backgroundColor }), (theme == null ? void 0 : theme.textColor) && { "--hsk-text": theme.textColor }), (theme == null ? void 0 : theme.fontFamily) && { "--hsk-font": theme.fontFamily }), (theme == null ? void 0 : theme.borderRadius) && { "--hsk-border-radius": theme.borderRadius }) : void 0;
  return /* @__PURE__ */ jsxs5(Fragment4, { children: [
    /* @__PURE__ */ jsxs5(
      "button",
      {
        className: cn("hsk-cb-btn", classNames.button, className),
        onClick: () => setOpen(true),
        style: customStyles,
        "data-hsk-theme": hskThemeAttr,
        "aria-label": "Open AI chat",
        children: [
          /* @__PURE__ */ jsx7("span", { className: "hsk-cb-btn-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsx7(SparkleIcon3, {}) }),
          label !== void 0 ? label : null
        ]
      }
    ),
    open && mounted && createPortal2(
      /* @__PURE__ */ jsx7(
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
import { jsx as jsx8 } from "react/jsx-runtime";
function CartBadge({ className }) {
  const { cart } = useCart();
  if (!cart || cart.item_count === 0) return null;
  return /* @__PURE__ */ jsx8("span", { className: cn("hsk-cart-badge", className), children: cart.item_count });
}

// src/components/CartDrawer.tsx
import { useState as useState11, useEffect as useEffect10 } from "react";
import { createPortal as createPortal4 } from "react-dom";

// src/components/CheckoutModal.tsx
import { useState as useState10, useEffect as useEffect9 } from "react";
import { createPortal as createPortal3 } from "react-dom";
import { jsx as jsx9, jsxs as jsxs6 } from "react/jsx-runtime";
function CheckoutModal({
  onClose,
  theme,
  customStyles,
  hskThemeAttr
}) {
  const { cart, loading: cartLoading } = useCart();
  const client = useHuskelContext();
  const [config, setConfig] = useState10(null);
  const [loadingConfig, setLoadingConfig] = useState10(true);
  const [phone, setPhone] = useState10(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("huskel_user_phone") || "";
    }
    return "";
  });
  const [email, setEmail] = useState10(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("huskel_user_email") || "";
    }
    return "";
  });
  const [firstName, setFirstName] = useState10(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("huskel_user_firstname") || "";
    }
    return "";
  });
  const [lastName, setLastName] = useState10(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("huskel_user_lastname") || "";
    }
    return "";
  });
  const [phase, setPhase] = useState10("idle");
  const [merchantRef, setMerchantRef] = useState10(null);
  const [payError, setPayError] = useState10(null);
  const {} = usePaymentPolling({
    client: client.api,
    merchantReference: merchantRef,
    onSuccess: () => {
      setPhase("done");
      setMerchantRef(null);
    },
    onFailure: () => {
      setPhase("failed");
      setPayError("Payment failed or timed out. Please try again.");
      setMerchantRef(null);
    }
  });
  useEffect9(() => {
    client.api.getCheckoutConfig().then((res) => setConfig(res.payment_methods)).catch(() => {
    }).finally(() => setLoadingConfig(false));
  }, [client]);
  const hasPaymentMethods = config && Object.values(config).some((m) => m.enabled);
  const handlePay = async (e) => {
    e.preventDefault();
    if (!phone.trim()) {
      setPayError("Phone number is required.");
      return;
    }
    setPayError(null);
    setPhase("awaiting");
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("huskel_user_phone", phone.trim());
        localStorage.setItem("huskel_user_email", email.trim());
        localStorage.setItem("huskel_user_firstname", firstName.trim());
        localStorage.setItem("huskel_user_lastname", lastName.trim());
      }
      const res = await client.api.initiatePayment(phone.trim(), email, firstName, lastName);
      if (res == null ? void 0 : res.merchantReference) {
        setMerchantRef(res.merchantReference);
      } else {
        throw new Error("No merchant reference returned.");
      }
    } catch (err) {
      setPhase("failed");
      setPayError(err.message || "Could not connect to payment processor.");
    }
  };
  const currency = (cart == null ? void 0 : cart.currency) || "KES";
  const total = (cart == null ? void 0 : cart.total) || 0;
  const backdropStyle = __spreadProps(__spreadValues({}, customStyles), { fontSize: "15px", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', zIndex: 999999 });
  return createPortal3(
    /* @__PURE__ */ jsx9(
      "div",
      {
        className: "hsk-checkout-backdrop-full",
        style: backdropStyle,
        "data-hsk-theme": hskThemeAttr,
        children: /* @__PURE__ */ jsxs6(
          "div",
          {
            className: "hsk-checkout-modal-full",
            style: customStyles,
            "data-hsk-theme": hskThemeAttr,
            children: [
              /* @__PURE__ */ jsx9(
                "button",
                {
                  onClick: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClose();
                  },
                  className: "hsk-checkout-close-x",
                  "aria-label": "Close checkout",
                  children: /* @__PURE__ */ jsxs6("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
                    /* @__PURE__ */ jsx9("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
                    /* @__PURE__ */ jsx9("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
                  ] })
                }
              ),
              /* @__PURE__ */ jsx9("div", { className: "hsk-checkout-panel-left", children: /* @__PURE__ */ jsxs6("div", { className: "hsk-checkout-left-content", children: [
                /* @__PURE__ */ jsxs6("button", { onClick: (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                }, className: "hsk-checkout-back-btn", children: [
                  /* @__PURE__ */ jsxs6("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
                    /* @__PURE__ */ jsx9("line", { x1: "19", y1: "12", x2: "5", y2: "12" }),
                    /* @__PURE__ */ jsx9("polyline", { points: "12 19 5 12 12 5" })
                  ] }),
                  "Back to store"
                ] }),
                /* @__PURE__ */ jsx9("div", { className: "hsk-checkout-store-info", children: /* @__PURE__ */ jsx9("h2", { children: "Secure Checkout" }) }),
                /* @__PURE__ */ jsxs6("div", { className: "hsk-checkout-amount-due", children: [
                  /* @__PURE__ */ jsx9("span", { className: "hsk-checkout-label-muted", children: "Pay total" }),
                  /* @__PURE__ */ jsxs6("div", { className: "hsk-checkout-grand-total", children: [
                    currency,
                    " ",
                    total.toLocaleString(void 0, { minimumFractionDigits: 2 })
                  ] })
                ] }),
                cartLoading || !cart ? /* @__PURE__ */ jsx9("p", { className: "hsk-cart-loading", children: "Loading order..." }) : /* @__PURE__ */ jsx9("div", { className: "hsk-checkout-items-list-wrap", children: /* @__PURE__ */ jsx9("ul", { className: "hsk-checkout-items-list", children: cart.items.map((item) => /* @__PURE__ */ jsxs6("li", { className: "hsk-checkout-item-row", children: [
                  /* @__PURE__ */ jsxs6("div", { className: "hsk-checkout-item-img-container", children: [
                    item.image ? /* @__PURE__ */ jsx9("img", { src: item.image, alt: item.name, className: "hsk-checkout-item-img" }) : /* @__PURE__ */ jsx9("div", { className: "hsk-checkout-item-img-placeholder", children: "\u{1F6D2}" }),
                    /* @__PURE__ */ jsx9("span", { className: "hsk-checkout-item-qty-badge", children: item.quantity })
                  ] }),
                  /* @__PURE__ */ jsx9("div", { className: "hsk-checkout-item-details", children: /* @__PURE__ */ jsx9("span", { className: "hsk-checkout-item-name", children: item.name }) }),
                  /* @__PURE__ */ jsxs6("span", { className: "hsk-checkout-item-price", children: [
                    item.currency,
                    " ",
                    (item.price_numeric * item.quantity).toLocaleString(void 0, { minimumFractionDigits: 2 })
                  ] })
                ] }, item.id)) }) })
              ] }) }),
              /* @__PURE__ */ jsx9("div", { className: "hsk-checkout-panel-right", children: /* @__PURE__ */ jsx9("div", { className: "hsk-checkout-right-content", children: phase === "done" ? /* @__PURE__ */ jsxs6("div", { className: "hsk-checkout-status-card success", children: [
                /* @__PURE__ */ jsx9("div", { className: "hsk-status-icon-wrap success", children: /* @__PURE__ */ jsxs6("svg", { width: "32", height: "32", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
                  /* @__PURE__ */ jsx9("path", { d: "M22 11.08V12a10 10 0 1 1-5.93-9.14" }),
                  /* @__PURE__ */ jsx9("polyline", { points: "22 4 12 14.01 9 11.01" })
                ] }) }),
                /* @__PURE__ */ jsx9("h3", { children: "Payment Successful!" }),
                /* @__PURE__ */ jsx9("p", { children: "Your transaction has been confirmed. Thank you for your order!" }),
                /* @__PURE__ */ jsx9("button", { onClick: onClose, className: "hsk-pay-btn hsk-btn-primary", style: { marginTop: "1.5rem" }, children: "Continue Shopping" })
              ] }) : phase === "awaiting" ? /* @__PURE__ */ jsxs6("div", { className: "hsk-checkout-status-card awaiting", children: [
                /* @__PURE__ */ jsx9("div", { className: "hsk-status-spinner-wrap", children: /* @__PURE__ */ jsx9("div", { className: "hsk-status-spinner" }) }),
                /* @__PURE__ */ jsx9("h3", { children: "Confirm payment on your phone" }),
                /* @__PURE__ */ jsxs6("p", { children: [
                  "We've sent an M-Pesa STK push prompt to ",
                  /* @__PURE__ */ jsxs6("strong", { children: [
                    "254",
                    phone
                  ] }),
                  "."
                ] }),
                /* @__PURE__ */ jsxs6("div", { className: "hsk-checkout-stk-instructions", children: [
                  /* @__PURE__ */ jsx9("p", { children: "1. Check your phone lockscreen for the M-Pesa prompt." }),
                  /* @__PURE__ */ jsx9("p", { children: "2. Enter your M-Pesa PIN and press OK." }),
                  /* @__PURE__ */ jsx9("p", { children: "3. Wait here \u2014 this page auto-updates once confirmed." })
                ] }),
                /* @__PURE__ */ jsx9(
                  "button",
                  {
                    onClick: () => {
                      setPhase("cancelled");
                      setMerchantRef(null);
                    },
                    className: "hsk-checkout-cancel-btn",
                    children: "Cancel payment"
                  }
                )
              ] }) : phase === "cancelled" ? /* @__PURE__ */ jsxs6("div", { className: "hsk-checkout-status-card cancelled", children: [
                /* @__PURE__ */ jsx9("div", { className: "hsk-status-icon-wrap cancelled", children: /* @__PURE__ */ jsxs6("svg", { width: "32", height: "32", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
                  /* @__PURE__ */ jsx9("path", { d: "m15 9-6 6M9 9l6 6" }),
                  /* @__PURE__ */ jsx9("circle", { cx: "12", cy: "12", r: "10" })
                ] }) }),
                /* @__PURE__ */ jsx9("h3", { children: "Payment Cancelled" }),
                /* @__PURE__ */ jsx9("p", { children: "No charge was made. You can update your phone number and try again whenever you're ready." }),
                /* @__PURE__ */ jsxs6("div", { className: "hsk-checkout-status-actions", children: [
                  /* @__PURE__ */ jsx9("button", { onClick: () => {
                    setPhase("idle");
                    setPayError(null);
                  }, className: "hsk-pay-btn hsk-btn-primary", children: "Try again" }),
                  /* @__PURE__ */ jsx9("button", { onClick: onClose, className: "hsk-checkout-cancel-btn", children: "Back to cart" })
                ] })
              ] }) : phase === "failed" ? /* @__PURE__ */ jsxs6("div", { className: "hsk-checkout-status-card failed", children: [
                /* @__PURE__ */ jsx9("div", { className: "hsk-status-icon-wrap failed", children: /* @__PURE__ */ jsxs6("svg", { width: "32", height: "32", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
                  /* @__PURE__ */ jsx9("circle", { cx: "12", cy: "12", r: "10" }),
                  /* @__PURE__ */ jsx9("line", { x1: "12", y1: "8", x2: "12", y2: "12" }),
                  /* @__PURE__ */ jsx9("line", { x1: "12", y1: "16", x2: "12.01", y2: "16" })
                ] }) }),
                /* @__PURE__ */ jsx9("h3", { children: "Payment Failed" }),
                /* @__PURE__ */ jsx9("p", { className: "hsk-checkout-error-text", children: payError || "Could not verify M-Pesa transaction. Please check your phone and try again." }),
                /* @__PURE__ */ jsxs6("div", { className: "hsk-checkout-status-actions", children: [
                  /* @__PURE__ */ jsx9("button", { onClick: () => {
                    setPhase("idle");
                    setPayError(null);
                  }, className: "hsk-pay-btn hsk-btn-primary", children: "Try again" }),
                  /* @__PURE__ */ jsx9("button", { onClick: onClose, className: "hsk-checkout-cancel-btn", children: "Back to cart" })
                ] })
              ] }) : /* @__PURE__ */ jsxs6("div", { className: "hsk-checkout-payment-form-wrap", children: [
                /* @__PURE__ */ jsx9("h3", { className: "hsk-checkout-section-title", children: "Payment details" }),
                loadingConfig ? /* @__PURE__ */ jsx9("p", { className: "hsk-cart-loading", children: "Loading payment configuration..." }) : !hasPaymentMethods ? /* @__PURE__ */ jsx9("p", { className: "hsk-checkout-error", children: "No payment methods configured for this store." }) : /* @__PURE__ */ jsxs6("form", { onSubmit: handlePay, className: "hsk-stripe-checkout-form", children: [
                  /* @__PURE__ */ jsxs6("div", { className: "hsk-form-group", children: [
                    /* @__PURE__ */ jsx9("label", { className: "hsk-form-label", children: "M-Pesa Mobile Number" }),
                    /* @__PURE__ */ jsxs6("div", { className: "hsk-phone-input-container", children: [
                      /* @__PURE__ */ jsx9("span", { className: "hsk-phone-prefix", children: "254" }),
                      /* @__PURE__ */ jsx9(
                        "input",
                        {
                          type: "tel",
                          required: true,
                          placeholder: "712345678",
                          pattern: "[0-9]{9}",
                          maxLength: 9,
                          value: phone,
                          onChange: (e) => setPhone(e.target.value.replace(/\D/g, "")),
                          className: "hsk-phone-input-field"
                        }
                      )
                    ] }),
                    /* @__PURE__ */ jsx9("span", { className: "hsk-form-hint", children: "Enter your 9-digit number (e.g. 712345678)" })
                  ] }),
                  /* @__PURE__ */ jsxs6("div", { className: "hsk-form-group", children: [
                    /* @__PURE__ */ jsx9("label", { className: "hsk-form-label", children: "Email address" }),
                    /* @__PURE__ */ jsx9(
                      "input",
                      {
                        type: "email",
                        placeholder: "john.doe@example.com",
                        value: email,
                        onChange: (e) => setEmail(e.target.value),
                        className: "hsk-form-input"
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsxs6("div", { className: "hsk-form-row", children: [
                    /* @__PURE__ */ jsxs6("div", { className: "hsk-form-group", children: [
                      /* @__PURE__ */ jsx9("label", { className: "hsk-form-label", children: "First Name" }),
                      /* @__PURE__ */ jsx9(
                        "input",
                        {
                          type: "text",
                          placeholder: "John",
                          value: firstName,
                          onChange: (e) => setFirstName(e.target.value),
                          className: "hsk-form-input"
                        }
                      )
                    ] }),
                    /* @__PURE__ */ jsxs6("div", { className: "hsk-form-group", children: [
                      /* @__PURE__ */ jsx9("label", { className: "hsk-form-label", children: "Last Name" }),
                      /* @__PURE__ */ jsx9(
                        "input",
                        {
                          type: "text",
                          placeholder: "Doe",
                          value: lastName,
                          onChange: (e) => setLastName(e.target.value),
                          className: "hsk-form-input"
                        }
                      )
                    ] })
                  ] }),
                  payError && /* @__PURE__ */ jsx9("div", { className: "hsk-form-error-banner", children: payError }),
                  /* @__PURE__ */ jsxs6("button", { type: "submit", className: "hsk-checkout-submit-btn", children: [
                    "Pay ",
                    currency,
                    " ",
                    total.toLocaleString()
                  ] }),
                  /* @__PURE__ */ jsx9("div", { className: "hsk-checkout-footer-brand", children: /* @__PURE__ */ jsx9("span", { children: "Powered by Akropolys" }) })
                ] })
              ] }) }) })
            ]
          }
        )
      }
    ),
    document.body
  );
}

// src/components/CartDrawer.tsx
import { Fragment as Fragment5, jsx as jsx10, jsxs as jsxs7 } from "react/jsx-runtime";
function CartDrawer({
  trigger,
  className,
  theme
}) {
  const { cart, loading } = useCart();
  const [open, setOpen] = useState11(false);
  const [showCheckout, setShowCheckout] = useState11(false);
  const [mounted, setMounted] = useState11(false);
  const client = useHuskelContext();
  useEffect10(() => {
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
  useEffect10(() => {
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
    const event = new CustomEvent("huskel:trigger_checkout", { cancelable: true });
    window.dispatchEvent(event);
    if (event.defaultPrevented) {
      setOpen(false);
      return;
    }
    setShowCheckout(true);
  };
  const isStringTheme = typeof theme === "string";
  const hskThemeAttr = isStringTheme ? theme : void 0;
  const customStyles = !isStringTheme && theme ? __spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues({}, (theme == null ? void 0 : theme.primaryColor) && { "--hsk-primary": theme.primaryColor, "--hsk-primary-color": theme.primaryColor }), (theme == null ? void 0 : theme.backgroundColor) && { "--hsk-bg": theme.backgroundColor }), (theme == null ? void 0 : theme.textColor) && { "--hsk-text": theme.textColor }), (theme == null ? void 0 : theme.fontFamily) && { "--hsk-font": theme.fontFamily }), (theme == null ? void 0 : theme.borderRadius) && { "--hsk-border-radius": theme.borderRadius }) : void 0;
  return /* @__PURE__ */ jsxs7(Fragment5, { children: [
    trigger ? /* @__PURE__ */ jsx10("div", { onClick: () => setOpen(true), style: { display: "inline-block" }, children: trigger }) : /* @__PURE__ */ jsxs7(
      "button",
      {
        onClick: () => setOpen(true),
        className: cn("hsk-cart-trigger", className),
        style: customStyles,
        "data-hsk-theme": hskThemeAttr,
        "aria-label": "Open cart",
        children: [
          /* @__PURE__ */ jsxs7("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
            /* @__PURE__ */ jsx10("circle", { cx: "9", cy: "21", r: "1" }),
            /* @__PURE__ */ jsx10("circle", { cx: "20", cy: "21", r: "1" }),
            /* @__PURE__ */ jsx10("path", { d: "M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" })
          ] }),
          cart && cart.item_count > 0 ? /* @__PURE__ */ jsx10("span", { className: "hsk-cart-trigger-badge", children: cart.item_count }) : null
        ]
      }
    ),
    open && mounted && createPortal4(
      /* @__PURE__ */ jsx10(
        "div",
        {
          className: "hsk-cart-backdrop",
          style: customStyles,
          "data-hsk-theme": hskThemeAttr,
          onClick: () => setOpen(false),
          children: /* @__PURE__ */ jsxs7(
            "div",
            {
              className: "hsk-cart-bottom-sheet",
              style: customStyles,
              "data-hsk-theme": hskThemeAttr,
              onClick: (e) => e.stopPropagation(),
              children: [
                /* @__PURE__ */ jsx10("div", { className: "hsk-cart-sheet-handle" }),
                /* @__PURE__ */ jsxs7("div", { className: "hsk-cart-sheet-header", children: [
                  /* @__PURE__ */ jsx10("h2", { children: "Your Cart" }),
                  /* @__PURE__ */ jsx10("button", { onClick: () => setOpen(false), className: "hsk-close-btn", children: "\xD7" })
                ] }),
                /* @__PURE__ */ jsx10("div", { className: "hsk-cart-sheet-content", children: loading && !cart ? /* @__PURE__ */ jsx10("div", { className: "hsk-cart-loading", children: "Loading cart..." }) : !cart || cart.items.length === 0 ? /* @__PURE__ */ jsx10("div", { className: "hsk-cart-empty", children: "Your cart is empty." }) : /* @__PURE__ */ jsx10("ul", { className: "hsk-cart-items", children: cart.items.map((item) => /* @__PURE__ */ jsxs7("li", { className: "hsk-cart-item", children: [
                  item.image && /* @__PURE__ */ jsx10("img", { src: item.image, alt: item.name, className: "hsk-cart-item-img" }),
                  /* @__PURE__ */ jsxs7("div", { className: "hsk-cart-item-info", children: [
                    /* @__PURE__ */ jsx10("span", { className: "hsk-cart-item-name", children: item.name }),
                    /* @__PURE__ */ jsxs7("span", { className: "hsk-cart-item-price", children: [
                      item.currency,
                      " ",
                      item.price_numeric.toLocaleString(void 0, { minimumFractionDigits: 2 })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs7("div", { className: "hsk-cart-item-qty", children: [
                    "x",
                    item.quantity
                  ] })
                ] }, item.id)) }) }),
                cart && cart.items.length > 0 && /* @__PURE__ */ jsxs7("div", { className: "hsk-cart-sheet-footer", children: [
                  /* @__PURE__ */ jsxs7("div", { className: "hsk-cart-total", children: [
                    /* @__PURE__ */ jsx10("span", { children: "Total" }),
                    /* @__PURE__ */ jsxs7("span", { children: [
                      cart.currency,
                      " ",
                      cart.total.toLocaleString(void 0, { minimumFractionDigits: 2 })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsx10("button", { onClick: handleCheckout, className: "hsk-checkout-btn", children: "Checkout securely" })
                ] })
              ]
            }
          )
        }
      ),
      document.body
    ),
    showCheckout && mounted && /* @__PURE__ */ jsx10(
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

export {
  HuskelAPI,
  HuskelClient,
  initHuskel,
  getHuskelClient,
  useHuskel,
  HuskelProvider,
  useHuskelContext,
  useSearch,
  useIngest,
  usePageIngest,
  useChat,
  useCart,
  usePaymentPolling,
  SearchBar,
  Sparkle,
  ChatWidget,
  AIChatButton,
  CartBadge,
  CartDrawer
};
//# sourceMappingURL=chunk-W4GQS5JF.mjs.map