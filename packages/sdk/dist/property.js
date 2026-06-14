'use client';
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

// src/property.ts
var property_exports = {};
__export(property_exports, {
  AkropolysAPI: () => AkropolysAPI,
  AkropolysClient: () => AkropolysClient,
  AkropolysProvider: () => AkropolysProvider,
  KikuStream: () => KikuStream,
  getAkropolysClient: () => getAkropolysClient,
  initAkropolys: () => initAkropolys,
  resolveDisplayFields: () => resolveDisplayFields,
  setSDKDefaultVertical: () => setSDKDefaultVertical,
  useAkropolys: () => useAkropolys,
  useAkropolysContext: () => useAkropolysContext,
  useCart: () => useCart,
  useIngest: () => useIngest,
  useKiku: () => useKiku,
  useListIngest: () => useListIngest,
  usePageIngest: () => usePageIngest,
  usePaymentPolling: () => usePaymentPolling,
  useSearch: () => useSearch
});
module.exports = __toCommonJS(property_exports);

// src/api.ts
var MAX_RETRIES = 3;
var RETRY_DELAYS = [500, 1e3, 2e3];
function log(level, msg, data) {
  const prefix = "[Akropolys]";
  if (level === "error") console.error(prefix, msg, data ?? "");
  else if (level === "warn") console.warn(prefix, msg, data ?? "");
  else console.log(prefix, msg, data ?? "");
}
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
var AkropolysAPI = class {
  constructor(apiUrl, siteId, apiToken, getShopperId, getSessionId, vertical, getDeviceId) {
    this.apiUrl = apiUrl;
    this.siteId = siteId;
    this.apiToken = apiToken;
    this.getShopperId = getShopperId;
    this.getSessionId = getSessionId;
    this.vertical = vertical;
    this.getDeviceId = getDeviceId;
  }
  async post(path, body, attempt = 0) {
    const url = `${this.apiUrl}${path}`;
    try {
      const headers = {
        "Content-Type": "application/json",
        "X-Akropolys-Token": this.apiToken,
        "X-Akropolys-Site": this.siteId
      };
      const shopperId = this.getShopperId?.();
      if (shopperId) {
        headers["X-Akropolys-Shopper-Id"] = shopperId;
      }
      const sessionId = this.getSessionId?.();
      if (sessionId) {
        headers["X-Akropolys-Session-Id"] = sessionId;
      }
      const deviceId = this.getDeviceId?.();
      if (deviceId) {
        headers["X-Akropolys-Device-Id"] = deviceId;
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
        } catch {
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
    log("info", "ingesting product", product.name || product.id || "");
    const url = product.url || "";
    const fields = {};
    for (const [k, v] of Object.entries(product)) {
      if (k !== "url") {
        fields[k] = v;
      }
    }
    if (!fields.image && Array.isArray(fields.images) && fields.images.length > 0) {
      fields.image = fields.images[0];
    }
    const formattedEntity = { url, fields };
    return this.post("/ingest", {
      siteId: this.siteId,
      entity: formattedEntity,
      product: formattedEntity
    });
  }
  async ingestBatch(products) {
    log("info", `ingesting batch of ${products.length} products`);
    const formattedEntities = products.map((product) => {
      const url = product.url || "";
      const fields = {};
      for (const [k, v] of Object.entries(product)) {
        if (k !== "url") {
          fields[k] = v;
        }
      }
      if (!fields.image && Array.isArray(fields.images) && fields.images.length > 0) {
        fields.image = fields.images[0];
      }
      return { url, fields };
    });
    return this.post("/ingest/batch", {
      siteId: this.siteId,
      entities: formattedEntities,
      products: formattedEntities
    });
  }
  async ingestContentBatch(contents) {
    log("info", `ingesting batch of ${contents.length} pages`);
    return this.post("/content/ingest", { siteId: this.siteId, contents });
  }
  async search(query, limit = 10) {
    log("info", "search query", query);
    return this.post("/search", { query, siteId: this.siteId, limit });
  }
  // Pure vector search — no LLM, instant results.
  async searchVector(query, limit = 10) {
    return this.post("/search/vector", { query, siteId: this.siteId, limit });
  }
  // Autocomplete — pure in-memory Trie, <1ms, no Upstash call. Only true prefix matches.
  async searchAutocomplete(query, limit = 8) {
    return this.post("/search/autocomplete", { query, siteId: this.siteId, limit });
  }
  // LLM chat — conversational search with history context.
  async chat(query, history2 = [], currentContext) {
    log("info", "chat query", query);
    const path = !this.vertical || this.vertical === "commerce" ? "/chat" : `/chat/${this.vertical}`;
    return this.post(path, { query, siteId: this.siteId, history: history2, currentContext });
  }
  // Streaming variant — returns the raw fetch Response.
  // The caller reads body as a ReadableStream of SSE frames.
  async chatStream(query, history2 = [], signal, currentContext, attachments) {
    log("info", "chatStream query", query);
    const headers = {
      "Content-Type": "application/json",
      "X-Akropolys-Token": this.apiToken,
      "X-Akropolys-Site": this.siteId
    };
    const shopperId = this.getShopperId?.();
    if (shopperId) headers["X-Akropolys-Shopper-Id"] = shopperId;
    const sessionId = this.getSessionId?.();
    if (sessionId) headers["X-Akropolys-Session-Id"] = sessionId;
    const deviceId = this.getDeviceId?.();
    if (deviceId) headers["X-Akropolys-Device-Id"] = deviceId;
    const path = !this.vertical || this.vertical === "commerce" ? "/chat/stream" : `/chat/stream/${this.vertical}`;
    const body = { query, siteId: this.siteId, history: history2, currentContext };
    if (attachments && attachments.length > 0) body.attachments = attachments;
    const res = await fetch(`${this.apiUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal
    });
    if (!res.ok || !res.body) {
      throw new Error(`Stream request failed: ${res.status}`);
    }
    return res;
  }
  // Visual style-match search — "find a dress that matches my shoes"
  // image: base64 data URI ("data:image/jpeg;base64,...") or public image URL
  // categoryHint: optional target category e.g. "dress", "curtains"
  async searchByImage(image, categoryHint, limit = 8) {
    log("info", "searchByImage", categoryHint ?? "no hint");
    return this.post("/search/visual", {
      siteId: this.siteId,
      image,
      category_hint: categoryHint,
      limit
    });
  }
  // Free-form visual Q&A — "what is this product?"
  async analyzeImage(image, query) {
    log("info", "analyzeImage query", query ?? "(describe)");
    return this.post("/chat/vision", { siteId: this.siteId, image, query });
  }
  // --- Cart System ---
  buildHeaders() {
    const headers = {
      "Content-Type": "application/json",
      "X-Akropolys-Token": this.apiToken,
      "X-Akropolys-Site": this.siteId
    };
    const shopperId = this.getShopperId?.();
    if (shopperId) headers["X-Akropolys-Shopper-Id"] = shopperId;
    const sessionId = this.getSessionId?.();
    if (sessionId) headers["X-Akropolys-Session-Id"] = sessionId;
    const deviceId = this.getDeviceId?.();
    if (deviceId) headers["X-Akropolys-Device-Id"] = deviceId;
    if (typeof window !== "undefined") {
      const phone = localStorage.getItem("akropolys_user_phone");
      if (phone) {
        headers["X-Akropolys-Shopper-Phone"] = phone;
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

// src/stream.ts
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
var KikuStream = class {
  constructor(responsePromise, abortController) {
    this.listeners = {};
    this.aborted = false;
    this.responsePromise = responsePromise;
    this.abortController = abortController;
    this.startReading();
  }
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return this;
  }
  off(event, callback) {
    if (!this.listeners[event]) return this;
    this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
    return this;
  }
  destroy() {
    this.aborted = true;
    this.abortController.abort();
  }
  emit(event, ...args) {
    const list = this.listeners[event];
    if (!list) return;
    for (const cb of list) {
      try {
        cb(...args);
      } catch (err) {
        console.error(`[Akropolys] Error in KikuStream event listener for "${event}":`, err);
      }
    }
  }
  async startReading() {
    try {
      const response = await this.responsePromise;
      if (this.aborted) return;
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Response body is not readable");
      }
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedMessage = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done || this.aborted) break;
        buffer += decoder.decode(value, { stream: true });
        const lastBoundary = buffer.lastIndexOf("\n\n");
        if (lastBoundary === -1) continue;
        const complete = buffer.slice(0, lastBoundary + 2);
        buffer = buffer.slice(lastBoundary + 2);
        const frames = parseSSEChunk(complete);
        for (const { event, data } of frames) {
          if (this.aborted) return;
          if (event === "meta") {
            try {
              const meta = JSON.parse(data);
              this.emit("meta", meta);
            } catch {
            }
            continue;
          }
          if (event === "entity_ref") {
            try {
              const ref = JSON.parse(data);
              this.emit("entity_ref", ref);
            } catch {
            }
            continue;
          }
          if (event === "done") {
            break;
          }
          if (event === "error") {
            let msg = "Stream error";
            try {
              msg = JSON.parse(data).error ?? msg;
            } catch {
              msg = data;
            }
            throw new Error(msg);
          }
          const token = data.replace(/\\n/g, "\n");
          accumulatedMessage += token;
          this.emit("token", token);
        }
      }
      if (!this.aborted) {
        this.emit("done", accumulatedMessage);
      }
    } catch (err) {
      if (!this.aborted) {
        this.emit("error", err);
      }
    }
  }
};

// src/content/contentIndexer.ts
var indexedUrls = /* @__PURE__ */ new Set();
function initContentIndexer(client) {
  let debounceTimer;
  let maxWaitTimer;
  let lastUrl = typeof location !== "undefined" ? location.href : "";
  const originalPushState = typeof history !== "undefined" ? history.pushState.bind(history) : null;
  const originalReplaceState = typeof history !== "undefined" ? history.replaceState.bind(history) : null;
  const extractAndIngest = () => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const url = location.href;
    if (indexedUrls.has(url)) return;
    indexedUrls.add(url);
    const target = document.querySelector("main") ?? document.querySelector("article") ?? document.querySelector('[role="main"]') ?? document.querySelector("#content") ?? document.querySelector(".entry-content") ?? document.querySelector("#main") ?? document.body;
    if (!target) return;
    const clone = target.cloneNode(true);
    const noiseSelectors = [
      "nav",
      "header",
      "footer",
      "script",
      "style",
      "noscript",
      "iframe",
      '[role="navigation"]',
      '[role="banner"]',
      '[role="contentinfo"]',
      '[aria-hidden="true"]',
      "template",
      ".hidden",
      '[style*="display:none"]',
      '[style*="display: none"]'
    ];
    noiseSelectors.forEach((selector) => {
      clone.querySelectorAll(selector).forEach((el) => el.remove());
    });
    const text = clone.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!text || text.length < 50) return;
    client.queueContentIngest({
      url,
      title: document.title,
      text,
      capturedAt: Date.now()
    });
  };
  const scheduleExtraction = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      clearTimeout(maxWaitTimer);
      extractAndIngest();
    }, 1e3);
  };
  const startMaxWait = () => {
    clearTimeout(maxWaitTimer);
    maxWaitTimer = setTimeout(() => {
      clearTimeout(debounceTimer);
      extractAndIngest();
    }, 4e3);
  };
  let observer = null;
  const startObserving = () => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (typeof MutationObserver === "undefined") return;
    observer = new MutationObserver(() => {
      scheduleExtraction();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  };
  const onRouteChange = () => {
    if (typeof location === "undefined") return;
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    scheduleExtraction();
    startMaxWait();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("popstate", onRouteChange);
    if (history && originalPushState) {
      history.pushState = (...args) => {
        originalPushState(...args);
        onRouteChange();
      };
    }
    if (history && originalReplaceState) {
      history.replaceState = (...args) => {
        originalReplaceState(...args);
        onRouteChange();
      };
    }
    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => {
        extractAndIngest();
        startObserving();
      }, { timeout: 3e3 });
    } else {
      setTimeout(() => {
        extractAndIngest();
        startObserving();
      }, 1e3);
    }
  }
  const cleanup = () => {
    if (observer) {
      observer.disconnect();
    }
    clearTimeout(debounceTimer);
    clearTimeout(maxWaitTimer);
    if (typeof window !== "undefined") {
      window.removeEventListener("popstate", onRouteChange);
      if (history && originalPushState) {
        history.pushState = originalPushState;
      }
      if (history && originalReplaceState) {
        history.replaceState = originalReplaceState;
      }
    }
  };
  client.contentIndexerCleanup = cleanup;
  return cleanup;
}

// src/utils/stableStringify.ts
function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return "{" + parts.join(",") + "}";
}

// src/client.ts
var import_meta = {};
var defaultVertical = "commerce";
function setSDKDefaultVertical(v) {
  defaultVertical = v;
}
function getEnvVar(key) {
  if (key === "NEXT_PUBLIC_AKROPOLYS_SITE_ID") {
    try {
      return process.env.NEXT_PUBLIC_AKROPOLYS_SITE_ID || process.env.NEXT_PUBLIC_HUSKEL_SITE_ID;
    } catch {
    }
  }
  if (key === "NEXT_PUBLIC_AKROPOLYS_API_URL") {
    try {
      return process.env.NEXT_PUBLIC_AKROPOLYS_API_URL || process.env.NEXT_PUBLIC_HUSKEL_API_URL;
    } catch {
    }
  }
  if (key === "NEXT_PUBLIC_AKROPOLYS_API_TOKEN") {
    try {
      return process.env.NEXT_PUBLIC_AKROPOLYS_API_TOKEN || process.env.NEXT_PUBLIC_HUSKEL_API_TOKEN;
    } catch {
    }
  }
  try {
    const metaEnv = import_meta.env;
    if (metaEnv) {
      if (key === "NEXT_PUBLIC_AKROPOLYS_SITE_ID") return metaEnv.NEXT_PUBLIC_AKROPOLYS_SITE_ID || metaEnv.VITE_AKROPOLYS_SITE_ID || metaEnv.NEXT_PUBLIC_HUSKEL_SITE_ID;
      if (key === "NEXT_PUBLIC_AKROPOLYS_API_URL") return metaEnv.NEXT_PUBLIC_AKROPOLYS_API_URL || metaEnv.VITE_AKROPOLYS_API_URL || metaEnv.NEXT_PUBLIC_HUSKEL_API_URL;
      if (key === "NEXT_PUBLIC_AKROPOLYS_API_TOKEN") return metaEnv.NEXT_PUBLIC_AKROPOLYS_API_TOKEN || metaEnv.VITE_AKROPOLYS_API_TOKEN || metaEnv.NEXT_PUBLIC_HUSKEL_API_TOKEN;
    }
  } catch {
  }
  if (typeof globalThis !== "undefined") {
    const g = globalThis;
    if (g.process && g.process.env) {
      const val = g.process.env[key];
      if (val !== void 0) return val;
      if (key === "NEXT_PUBLIC_AKROPOLYS_SITE_ID") return g.process.env.NEXT_PUBLIC_HUSKEL_SITE_ID;
      if (key === "NEXT_PUBLIC_AKROPOLYS_API_URL") return g.process.env.NEXT_PUBLIC_HUSKEL_API_URL;
      if (key === "NEXT_PUBLIC_AKROPOLYS_API_TOKEN") return g.process.env.NEXT_PUBLIC_HUSKEL_API_TOKEN;
    }
  }
  return void 0;
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
function resolveDisplayFields(fields, display) {
  const titleKey = display?.cardTitle || "";
  const imageKey = display?.cardImage || "";
  const subtitleKey = display?.cardSubtitle || "";
  const priceKey = display?.cardPrice || "";
  const commonTitleKeys = ["title", "name", "label", "headline", "subject", "job_title", "listing_title", "common_name"];
  let title = fields[titleKey] || "";
  if (!title) {
    for (const k of commonTitleKeys) {
      if (typeof fields[k] === "string" && fields[k].trim() !== "") {
        title = fields[k];
        break;
      }
    }
  }
  if (!title) {
    const fallbackStr = Object.values(fields).find(
      (v) => typeof v === "string" && v.length >= 2 && v.length <= 80 && !v.startsWith("http://") && !v.startsWith("https://")
    );
    title = fallbackStr || "Untitled";
  }
  const commonImageKeys = ["image", "images", "thumbnail", "photo", "cover", "featured_image"];
  let image = fields[imageKey] || void 0;
  if (!image) {
    for (const k of commonImageKeys) {
      const v = fields[k];
      if (typeof v === "string" && v.startsWith("http")) {
        image = v;
        break;
      } else if (Array.isArray(v) && typeof v[0] === "string" && v[0].startsWith("http")) {
        image = v[0];
        break;
      }
    }
  }
  return {
    title,
    image,
    price: fields[priceKey] ?? fields.price ?? fields.cost ?? fields.listingPrice,
    subtitle: fields[subtitleKey] ?? fields.brand ?? fields.category
  };
}
var _AkropolysClient = class _AkropolysClient {
  constructor(config) {
    this.ingestQueue = [];
    this.ingestTimer = null;
    this.ingestedUrls = /* @__PURE__ */ new Map();
    this.onlineHandler = null;
    this.sessionId = "";
    this.deviceId = "";
    this.isFlushing = false;
    this.retryCount = 0;
    this.contentQueue = [];
    this.contentIngestTimer = null;
    this.isContentFlushing = false;
    this.contentRetryCount = 0;
    this.contentIndexerCleanup = null;
    this.lastIngestedItem = null;
    const siteId = config.siteId || getEnvVar("NEXT_PUBLIC_AKROPOLYS_SITE_ID") || "";
    const apiUrl = config.apiUrl || getEnvVar("NEXT_PUBLIC_AKROPOLYS_API_URL") || "";
    const apiToken = config.apiToken || getEnvVar("NEXT_PUBLIC_AKROPOLYS_API_TOKEN") || "";
    if (!siteId) console.error('[Akropolys] Missing siteId. Set it via <AkropolysProvider siteId="..."> or NEXT_PUBLIC_AKROPOLYS_SITE_ID.');
    if (!apiUrl) console.error('[Akropolys] Missing apiUrl. Set it via <AkropolysProvider apiUrl="..."> or NEXT_PUBLIC_AKROPOLYS_API_URL.');
    if (!apiToken) console.error('[Akropolys] Missing apiToken. Set it via <AkropolysProvider apiToken="..."> or NEXT_PUBLIC_AKROPOLYS_API_TOKEN.');
    this.shopperId = config.shopperId;
    this.authLoading = config.authLoading;
    this.onCheckout = config.onCheckout;
    this.onError = config.onError;
    this.vertical = config.vertical || defaultVertical;
    this.display = config.display;
    this.initSession();
    this.initDevice();
    this.loadIngestedCache();
    this.api = new AkropolysAPI(
      apiUrl,
      siteId,
      apiToken,
      () => this.getShopperId(),
      () => this.sessionId,
      this.vertical,
      () => this.deviceId
    );
    instance = this;
    if (typeof window !== "undefined") {
      this.onlineHandler = () => {
        console.log("[Akropolys] Connectivity restored, flushing queued ingestions.");
        this.flushQueue();
        this.flushContentQueue();
      };
      window.addEventListener("online", this.onlineHandler);
    }
    if (config.indexContent) {
      initContentIndexer(this);
    }
  }
  // 24h
  loadIngestedCache() {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(_AkropolysClient.INGEST_CACHE_KEY);
      if (!raw) return;
      const { ts, urlFingerprints } = JSON.parse(raw);
      if (Date.now() - ts > _AkropolysClient.INGEST_CACHE_TTL) {
        localStorage.removeItem(_AkropolysClient.INGEST_CACHE_KEY);
        return;
      }
      this.ingestedUrls = new Map(urlFingerprints);
    } catch {
    }
  }
  saveIngestedCache() {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        _AkropolysClient.INGEST_CACHE_KEY,
        JSON.stringify({ ts: Date.now(), urlFingerprints: Array.from(this.ingestedUrls.entries()) })
      );
    } catch {
    }
  }
  getCurrentContext() {
    if (typeof window === "undefined") return null;
    const ctx = {
      url: window.location.href,
      title: document.title,
      raw: {}
    };
    if (this.lastIngestedItem) {
      const itemUrl = this.lastIngestedItem.url;
      if (itemUrl) {
        try {
          const parsedUrl = new URL(itemUrl, window.location.origin);
          if (parsedUrl.pathname === window.location.pathname) {
            ctx.raw = this.lastIngestedItem;
            ctx.url = parsedUrl.href;
            if (this.lastIngestedItem.name || this.lastIngestedItem.title) {
              ctx.title = this.lastIngestedItem.name || this.lastIngestedItem.title;
            }
          }
        } catch {
          if (window.location.href.endsWith(itemUrl) || itemUrl.endsWith(window.location.pathname)) {
            ctx.raw = this.lastIngestedItem;
            try {
              ctx.url = new URL(itemUrl, window.location.origin).href;
            } catch {
              ctx.url = itemUrl;
            }
            if (this.lastIngestedItem.name || this.lastIngestedItem.title) {
              ctx.title = this.lastIngestedItem.name || this.lastIngestedItem.title;
            }
          }
        }
      }
    }
    return ctx;
  }
  chat(query, history2 = [], attachments) {
    const abortController = new AbortController();
    const currentContext = this.getCurrentContext();
    const responsePromise = this.api.chatStream(query, history2, abortController.signal, currentContext, attachments);
    return new KikuStream(responsePromise, abortController);
  }
  reRegister() {
    instance = this;
    if (typeof window !== "undefined" && !this.onlineHandler) {
      this.onlineHandler = () => this.flushQueue();
      window.addEventListener("online", this.onlineHandler);
    }
  }
  setShopperId(id) {
    this.shopperId = id;
    if (!this.authLoading) {
      this.flushQueue();
    }
  }
  setAuthLoading(loading) {
    const wasLoading = this.authLoading;
    this.authLoading = loading;
    if (wasLoading && !loading) {
      this.flushQueue();
    }
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
        let sid = window.sessionStorage.getItem("akropolys_session_id");
        if (!sid) {
          sid = generateUUID();
          window.sessionStorage.setItem("akropolys_session_id", sid);
        }
        this.sessionId = sid;
        return;
      } catch (e) {
      }
    }
    this.sessionId = generateUUID();
  }
  /**
   * Persistent device identity — survives page reloads and is shared across
   * all Akropolys-powered sites on the same browser. This is the key for
   * Kiku cross-site capture/memory without requiring a login or phone number.
   *
   * To transfer identity to another device, the user exports/imports this ID
   * via a "link device" flow (future feature).
   */
  initDevice() {
    if (typeof window === "undefined") {
      this.deviceId = generateUUID();
      return;
    }
    try {
      let did = localStorage.getItem("akropolys_device_id");
      if (!did) {
        did = generateUUID();
        localStorage.setItem("akropolys_device_id", did);
      }
      this.deviceId = did;
    } catch {
      this.deviceId = generateUUID();
    }
  }
  getDeviceId() {
    return this.deviceId;
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
    if (this.contentIngestTimer) {
      clearTimeout(this.contentIngestTimer);
      this.contentIngestTimer = null;
    }
    if (this.contentIndexerCleanup) {
      this.contentIndexerCleanup();
      this.contentIndexerCleanup = null;
    }
    if (instance === this) instance = null;
  }
  async queueIngest(rawItem) {
    this.lastIngestedItem = rawItem;
    const id = rawItem.id ?? rawItem.productId ?? rawItem.slug ?? rawItem.url ?? rawItem.name ?? "";
    const url = rawItem.url || (typeof window !== "undefined" ? window.location.href : "");
    if (!id && !url) {
      console.warn("[Akropolys] Ingestion warning: Item is missing both a stable identifier and a URL. Skipping.");
      return;
    }
    const fingerprint = stableStringify(rawItem);
    if (url) {
      if (this.ingestedUrls.get(url) === fingerprint) {
        return;
      }
      this.ingestedUrls.set(url, fingerprint);
      this.saveIngestedCache();
    }
    this.ingestQueue.push(rawItem);
    this.scheduleFlush();
  }
  async queueIngestBatch(rawItems) {
    if (rawItems.length > 0) {
      this.lastIngestedItem = rawItems[rawItems.length - 1];
    }
    let hasNew = false;
    rawItems.forEach((rawItem) => {
      const id = rawItem.id ?? rawItem.productId ?? rawItem.slug ?? rawItem.url ?? rawItem.name ?? "";
      const url = rawItem.url || (typeof window !== "undefined" ? window.location.href : "");
      if (!id && !url) {
        console.warn("[Akropolys] Ingestion warning: Item is missing both a stable identifier and a URL. Skipping.");
        return;
      }
      const fingerprint = stableStringify(rawItem);
      if (url) {
        if (this.ingestedUrls.get(url) === fingerprint) {
          return;
        }
        this.ingestedUrls.set(url, fingerprint);
        hasNew = true;
      }
      this.ingestQueue.push(rawItem);
    });
    if (hasNew) {
      this.saveIngestedCache();
    }
    if (this.ingestQueue.length > 0) {
      this.scheduleFlush();
    }
  }
  scheduleFlush() {
    if (this.ingestTimer || this.isFlushing) return;
    this.ingestTimer = setTimeout(() => {
      this.flushQueue();
    }, 300);
  }
  async flushQueue() {
    if (this.isFlushing) return;
    this.isFlushing = true;
    if (this.ingestTimer) {
      clearTimeout(this.ingestTimer);
      this.ingestTimer = null;
    }
    if (this.authLoading) {
      console.log("[Akropolys] Authentication is loading. Deferring ingestion flush.");
      this.isFlushing = false;
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      console.warn("[Akropolys] Browser offline. Postponing ingestion.");
      this.isFlushing = false;
      return;
    }
    const maxBatchSize = 50;
    try {
      while (this.ingestQueue.length > 0) {
        const batch = this.ingestQueue.slice(0, maxBatchSize);
        try {
          await this.api.ingestBatch(batch);
          this.ingestQueue.splice(0, batch.length);
          this.retryCount = 0;
        } catch (e) {
          const status = e.status || 500;
          const message = e.message || "Unknown network error";
          if (this.onError) {
            try {
              this.onError({ status, message });
            } catch (err) {
              console.error("[Akropolys] Error inside onError callback:", err);
            }
          }
          if (status >= 400 && status < 500 && status !== 429) {
            console.error("[Akropolys] Ingestion discarded due to client error:", message);
            this.ingestQueue.splice(0, batch.length);
            continue;
          } else {
            console.warn("[Akropolys] Ingestion temporarily failed. Retrying later.", message);
            this.scheduleFlushWithBackoff();
            break;
          }
        }
      }
    } finally {
      this.isFlushing = false;
    }
  }
  scheduleFlushWithBackoff() {
    if (this.ingestTimer) return;
    const baseDelay = 1e3;
    const jitter = Math.random() * 1e3;
    const delay = Math.min(baseDelay * Math.pow(2, this.retryCount), 3e4) + jitter;
    this.retryCount++;
    this.ingestTimer = setTimeout(() => {
      this.flushQueue();
    }, delay);
  }
  async queueContentIngest(payload) {
    this.contentQueue.push(payload);
    this.scheduleContentFlush();
  }
  scheduleContentFlush() {
    if (this.contentIngestTimer || this.isContentFlushing) return;
    this.contentIngestTimer = setTimeout(() => {
      this.flushContentQueue();
    }, 300);
  }
  async flushContentQueue() {
    if (this.isContentFlushing) return;
    this.isContentFlushing = true;
    if (this.contentIngestTimer) {
      clearTimeout(this.contentIngestTimer);
      this.contentIngestTimer = null;
    }
    if (this.authLoading) {
      console.log("[Akropolys] Authentication is loading. Deferring content ingestion flush.");
      this.isContentFlushing = false;
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      console.warn("[Akropolys] Browser offline. Postponing content ingestion.");
      this.isContentFlushing = false;
      return;
    }
    const maxBatchSize = 50;
    try {
      while (this.contentQueue.length > 0) {
        const batch = this.contentQueue.slice(0, maxBatchSize);
        try {
          await this.api.ingestContentBatch(batch);
          this.contentQueue.splice(0, batch.length);
          this.contentRetryCount = 0;
        } catch (e) {
          const status = e.status || 500;
          const message = e.message || "Unknown network error";
          if (this.onError) {
            try {
              this.onError({ status, message });
            } catch (err) {
              console.error("[Akropolys] Error inside onError callback:", err);
            }
          }
          if (status >= 400 && status < 500 && status !== 429) {
            console.error("[Akropolys] Content ingestion discarded due to client error:", message);
            this.contentQueue.splice(0, batch.length);
            continue;
          } else {
            console.warn("[Akropolys] Content ingestion temporarily failed. Retrying later.", message);
            this.scheduleContentFlushWithBackoff();
            break;
          }
        }
      }
    } finally {
      this.isContentFlushing = false;
    }
  }
  scheduleContentFlushWithBackoff() {
    if (this.contentIngestTimer) return;
    const baseDelay = 1e3;
    const jitter = Math.random() * 1e3;
    const delay = Math.min(baseDelay * Math.pow(2, this.contentRetryCount), 3e4) + jitter;
    this.contentRetryCount++;
    this.contentIngestTimer = setTimeout(() => {
      this.flushContentQueue();
    }, delay);
  }
};
_AkropolysClient.INGEST_CACHE_KEY = "akropolys_ingested_v3";
_AkropolysClient.INGEST_CACHE_TTL = 24 * 60 * 60 * 1e3;
var AkropolysClient = _AkropolysClient;
var instance = null;
function initAkropolys(config) {
  instance = new AkropolysClient(config);
  return instance;
}
function getAkropolysClient() {
  if (!instance) {
    const siteId = getEnvVar("NEXT_PUBLIC_AKROPOLYS_SITE_ID");
    const apiUrl = getEnvVar("NEXT_PUBLIC_AKROPOLYS_API_URL");
    const apiToken = getEnvVar("NEXT_PUBLIC_AKROPOLYS_API_TOKEN");
    if (siteId && apiUrl && apiToken) {
      instance = new AkropolysClient({ siteId, apiUrl, apiToken });
    } else {
      throw new Error("[Akropolys] Call initAkropolys() or set NEXT_PUBLIC_AKROPOLYS_* environment variables before using the client.");
    }
  }
  return instance;
}

// src/Provider.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var AkropolysContext = (0, import_react.createContext)(null);
function AkropolysProvider({
  siteId,
  apiUrl,
  apiToken,
  shopperId,
  vertical,
  authLoading,
  onCheckout,
  onError,
  display,
  children
}) {
  const clientRef = (0, import_react.useRef)(null);
  if (!clientRef.current) {
    clientRef.current = new AkropolysClient({
      siteId,
      apiUrl,
      apiToken,
      shopperId,
      vertical,
      authLoading,
      onCheckout,
      onError,
      display
    });
  } else {
    clientRef.current.reRegister();
  }
  (0, import_react.useEffect)(() => {
    clientRef.current?.setShopperId(shopperId);
  }, [shopperId]);
  (0, import_react.useEffect)(() => {
    clientRef.current?.setAuthLoading(!!authLoading);
  }, [authLoading]);
  (0, import_react.useEffect)(() => {
    if (clientRef.current) {
      clientRef.current.onError = onError;
      clientRef.current.onCheckout = onCheckout;
    }
  }, [onError, onCheckout]);
  (0, import_react.useEffect)(() => {
    clientRef.current?.reRegister();
  }, []);
  (0, import_react.useEffect)(() => {
    return () => {
      clientRef.current?.destroy();
    };
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AkropolysContext.Provider, { value: clientRef.current, children });
}
function useAkropolysContext() {
  const context = (0, import_react.useContext)(AkropolysContext);
  if (!context) {
    return getAkropolysClient();
  }
  return context;
}

// src/hooks/useAkropolys.ts
var import_react2 = require("react");
function useAkropolys(config) {
  const clientRef = (0, import_react2.useRef)(null);
  if (!clientRef.current) {
    console.warn("[Akropolys] useAkropolys() is deprecated. Please wrap your application in <AkropolysProvider> instead.");
    clientRef.current = initAkropolys(config);
  }
  return clientRef.current;
}

// src/hooks/useSearch.ts
var import_react3 = require("react");
function useSearch(options) {
  const client = useAkropolysContext();
  const [results, setResults] = (0, import_react3.useState)([]);
  const [loading, setLoading] = (0, import_react3.useState)(false);
  const [error, setError] = (0, import_react3.useState)(null);
  const genRef = (0, import_react3.useRef)(0);
  const searchType = options?.type ?? "autocomplete";
  const search = (0, import_react3.useCallback)(async (query, limit = 8) => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    const gen = ++genRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = searchType === "vector" ? await client.api.searchVector(query, limit) : await client.api.searchAutocomplete(query, limit);
      if (gen === genRef.current) {
        setResults(res.results ?? []);
      }
    } catch (e) {
      if (gen === genRef.current) {
        let msg = e?.message ?? "Search failed";
        try {
          const parsed = JSON.parse(msg);
          if (parsed && parsed.error) {
            msg = parsed.error;
          }
        } catch {
        }
        setError(msg);
      }
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [client, searchType]);
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
var recentlyIngested = /* @__PURE__ */ new Map();
function getProductKey(p) {
  return p.id || p.productId || p.slug || p.url || p.name || p.title || p.productName || null;
}
function useIngest() {
  const client = useAkropolysContext();
  const ingest = (0, import_react4.useCallback)((product) => {
    const key = getProductKey(product);
    const fingerprint = stableStringify(product);
    if (key) {
      const cached = recentlyIngested.get(key);
      if (cached && cached.fingerprint === fingerprint && Date.now() - cached.timestamp < 24 * 60 * 60 * 1e3) {
        return;
      }
      recentlyIngested.set(key, { fingerprint, timestamp: Date.now() });
    }
    client.queueIngest(product).catch(() => {
    });
  }, [client]);
  const ingestBatch = (0, import_react4.useCallback)((products) => {
    const toIngest = products.filter((p) => {
      const key = getProductKey(p);
      const fingerprint = stableStringify(p);
      if (!key) return true;
      const cached = recentlyIngested.get(key);
      if (cached && cached.fingerprint === fingerprint && Date.now() - cached.timestamp < 24 * 60 * 60 * 1e3) {
        return false;
      }
      recentlyIngested.set(key, { fingerprint, timestamp: Date.now() });
      return true;
    });
    if (!toIngest.length) return;
    client.queueIngestBatch(toIngest).catch(() => {
    });
  }, [client]);
  return { ingest, ingestBatch, loading: false, error: null };
}

// src/hooks/useListIngest.ts
var import_react5 = require("react");
function useListIngest(items) {
  const { ingestBatch } = useIngest();
  const processedFingerprintsRef = (0, import_react5.useRef)(/* @__PURE__ */ new Map());
  const listKey = items ? stableStringify(items) : "";
  (0, import_react5.useEffect)(() => {
    if (!items || !items.length) return;
    const newItems = items.filter((item) => {
      const id = item.id ?? item.productId ?? item.slug ?? item.url ?? item.name ?? "";
      if (!id) return true;
      const fingerprint = stableStringify(item);
      const cached = processedFingerprintsRef.current.get(id);
      if (cached === fingerprint) {
        return false;
      }
      processedFingerprintsRef.current.set(id, fingerprint);
      return true;
    });
    if (newItems.length > 0) {
      ingestBatch(newItems);
    }
  }, [listKey, ingestBatch]);
}

// src/hooks/usePageIngest.ts
var import_react6 = require("react");
function usePageIngest(product) {
  const url = product?.url || (typeof window !== "undefined" ? window.location.href : "");
  const fingerprint = product ? stableStringify({ ...product, url }) : "";
  const fingerprintRef = (0, import_react6.useRef)(null);
  (0, import_react6.useEffect)(() => {
    if (!product) return;
    if (fingerprintRef.current === fingerprint) return;
    fingerprintRef.current = fingerprint;
    try {
      getAkropolysClient().queueIngest({ ...product, url });
    } catch (err) {
      if (typeof process !== "undefined" && process.env && process.env.NODE_ENV !== "production") {
        console.warn("[Akropolys] Ingestion failed inside usePageIngest:", err);
      }
    }
  }, [fingerprint, url]);
}

// src/hooks/useKiku.ts
var import_react7 = require("react");
function useKiku(options = {}) {
  const client = useAkropolysContext();
  const [messages, setMessages] = (0, import_react7.useState)(options.initialMessages ?? []);
  const [sources, setSources] = (0, import_react7.useState)([]);
  const [referencedIds, setReferencedIds] = (0, import_react7.useState)([]);
  const [loading, setLoading] = (0, import_react7.useState)(false);
  const [streaming, setStreaming] = (0, import_react7.useState)(false);
  const [error, setError] = (0, import_react7.useState)(null);
  const [lastAction, setLastAction] = (0, import_react7.useState)(null);
  const [lastIntent, setLastIntent] = (0, import_react7.useState)(null);
  const activeStreamRef = (0, import_react7.useRef)(null);
  const onTokenRef = (0, import_react7.useRef)(options.onToken);
  const onMetaRef = (0, import_react7.useRef)(options.onMeta);
  const onDoneRef = (0, import_react7.useRef)(options.onDone);
  const onErrorRef = (0, import_react7.useRef)(options.onError);
  (0, import_react7.useEffect)(() => {
    onTokenRef.current = options.onToken;
    onMetaRef.current = options.onMeta;
    onDoneRef.current = options.onDone;
    onErrorRef.current = options.onError;
  }, [options.onToken, options.onMeta, options.onDone, options.onError]);
  (0, import_react7.useEffect)(() => {
    return () => {
      activeStreamRef.current?.destroy();
    };
  }, []);
  const send = (0, import_react7.useCallback)(async (query, displayQuery, attachments) => {
    if (!query.trim() || loading) return;
    activeStreamRef.current?.destroy();
    const userMsg = {
      role: "user",
      content: displayQuery ?? query,
      images: attachments?.filter((a) => a.type === "image").map((a) => a.data)
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setStreaming(false);
    setError(null);
    setReferencedIds([]);
    try {
      const history2 = messages.map((m) => ({ role: m.role, content: m.content }));
      const stream = client.chat(query, history2, attachments);
      activeStreamRef.current = stream;
      let messageInitialized = false;
      let lastMeta = null;
      stream.on("meta", (meta) => {
        lastMeta = meta;
        setSources(meta.sources ?? []);
        if (meta.intent) setLastIntent(meta.intent);
        if (meta.action) setLastAction(meta.action);
        onMetaRef.current?.(meta);
      });
      stream.on("entity_ref", (ref) => {
        if (ref?.id) {
          setReferencedIds((prev) => prev.includes(ref.id) ? prev : [...prev, ref.id]);
        }
      });
      stream.on("token", (token) => {
        if (!messageInitialized) {
          setLoading(false);
          setStreaming(true);
          setMessages((prev) => [...prev, { role: "assistant", content: token }]);
          messageInitialized = true;
        } else {
          setMessages((prev) => {
            const next = [...prev];
            if (next.length > 0 && next[next.length - 1].role === "assistant") {
              next[next.length - 1] = {
                ...next[next.length - 1],
                content: next[next.length - 1].content + token
              };
            }
            return next;
          });
        }
        onTokenRef.current?.(token);
      });
      stream.on("done", (fullMessage) => {
        setLoading(false);
        setStreaming(false);
        const metaAction = lastMeta?.action;
        const metaCheckout = lastMeta?.checkout;
        const isCartAction = metaAction?.type === "add_to_cart" || metaAction?.type === "remove_from_cart" || metaAction?.type === "clear_cart" || metaAction?.type === "view_cart";
        if (isCartAction || metaCheckout) {
          setMessages((prev) => {
            const next = [...prev];
            if (next.length > 0 && next[next.length - 1].role === "assistant") {
              next[next.length - 1] = {
                ...next[next.length - 1],
                cartSnapshot: metaCheckout,
                actionType: metaAction?.type
              };
            }
            return next;
          });
          window.dispatchEvent(new CustomEvent("akropolys:cart_updated", { detail: metaCheckout }));
        }
        if (metaAction?.type === "checkout") {
          window.dispatchEvent(new CustomEvent("akropolys:trigger_checkout", { detail: metaCheckout }));
        }
        if (metaAction?.type === "awaiting_payment") {
          window.dispatchEvent(new CustomEvent("akropolys:awaiting_payment", { detail: metaAction }));
        }
        if (metaCheckout && client.onCheckout) {
          client.onCheckout(metaCheckout);
        }
        onDoneRef.current?.(fullMessage);
      });
      stream.on("error", (err) => {
        setLoading(false);
        setStreaming(false);
        setError(err.message);
        setMessages((prev) => prev.slice(0, -1));
        onErrorRef.current?.(err);
      });
    } catch (err) {
      setLoading(false);
      setStreaming(false);
      setError(err?.message ?? "Chat request failed");
      setMessages((prev) => prev.slice(0, -1));
      onErrorRef.current?.(err);
    }
  }, [client, messages, loading]);
  const reset = (0, import_react7.useCallback)(() => {
    activeStreamRef.current?.destroy();
    setMessages([]);
    setSources([]);
    setReferencedIds([]);
    setStreaming(false);
    setError(null);
    setLoading(false);
    setLastAction(null);
    setLastIntent(null);
  }, []);
  const resolvedSources = (0, import_react7.useMemo)(() => {
    return sources.map((s) => {
      const display = resolveDisplayFields(s.fields || s, client?.display);
      return {
        ...s,
        name: s.name || display.title,
        price: s.price || display.price,
        image: s.image || display.image,
        brand: s.brand || display.subtitle,
        currency: s.currency || typeof display.price === "string" && display.price.match(/[A-Za-z]{3}/)?.[0] || "KES"
      };
    });
  }, [sources, client?.display]);
  return { messages, sources: resolvedSources, referencedIds, loading, streaming, error, lastAction, lastIntent, send, reset };
}

// src/hooks/useCart.ts
var import_react8 = require("react");
function useCart() {
  const client = useAkropolysContext();
  const [cart, setCart] = (0, import_react8.useState)(null);
  const [loading, setLoading] = (0, import_react8.useState)(false);
  const shopperId = client.getShopperId();
  const fetchCart = (0, import_react8.useCallback)(async () => {
    if (!shopperId) return;
    setLoading(true);
    try {
      const res = await client.api.getCart();
      setCart(res);
    } catch (e) {
      console.error("[Akropolys] Failed to fetch cart", e);
    } finally {
      setLoading(false);
    }
  }, [client, shopperId]);
  (0, import_react8.useEffect)(() => {
    fetchCart();
    const handleCartUpdate = (e) => {
      if (e.detail) {
        setCart(e.detail);
      } else {
        fetchCart();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("akropolys:cart_updated", handleCartUpdate);
      return () => window.removeEventListener("akropolys:cart_updated", handleCartUpdate);
    }
  }, [fetchCart, shopperId]);
  return { cart, loading, fetchCart };
}

// src/hooks/usePaymentPolling.ts
var import_react9 = require("react");
function usePaymentPolling({
  client,
  merchantReference,
  onSuccess,
  onFailure,
  intervalMs = 3e3,
  timeoutMs = 3e5
  // 5 minutes default
}) {
  const [status, setStatus] = (0, import_react9.useState)("IDLE");
  const [error, setError] = (0, import_react9.useState)(null);
  const onSuccessRef = (0, import_react9.useRef)(onSuccess);
  const onFailureRef = (0, import_react9.useRef)(onFailure);
  (0, import_react9.useEffect)(() => {
    onSuccessRef.current = onSuccess;
    onFailureRef.current = onFailure;
  }, [onSuccess, onFailure]);
  (0, import_react9.useEffect)(() => {
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
        console.error("[Akropolys Polling Error]", err);
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

// src/property.ts
setSDKDefaultVertical("property");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AkropolysAPI,
  AkropolysClient,
  AkropolysProvider,
  KikuStream,
  getAkropolysClient,
  initAkropolys,
  resolveDisplayFields,
  setSDKDefaultVertical,
  useAkropolys,
  useAkropolysContext,
  useCart,
  useIngest,
  useKiku,
  useListIngest,
  usePageIngest,
  usePaymentPolling,
  useSearch
});
//# sourceMappingURL=property.js.map