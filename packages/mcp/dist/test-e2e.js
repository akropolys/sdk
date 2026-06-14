#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/vault.ts
var import_crypto, LocalAESVault;
var init_vault = __esm({
  "src/vault.ts"() {
    "use strict";
    import_crypto = __toESM(require("crypto"));
    LocalAESVault = class {
      masterKey;
      constructor(masterKeyEnvVar = "AKROPOLYS_KMS_MASTER_KEY") {
        const keyStr = process.env[masterKeyEnvVar];
        if (!keyStr) {
          throw new Error(`Master key environment variable ${masterKeyEnvVar} is not defined`);
        }
        this.masterKey = import_crypto.default.createHash("sha256").update(keyStr).digest();
      }
      async encrypt(plaintext) {
        const iv = import_crypto.default.randomBytes(12);
        const cipher = import_crypto.default.createCipheriv("aes-256-gcm", this.masterKey, iv);
        let encrypted = cipher.update(plaintext, "utf8", "hex");
        encrypted += cipher.final("hex");
        const authTag = cipher.getAuthTag().toString("hex");
        return `${iv.toString("hex")}:${authTag}:${encrypted}`;
      }
      async decrypt(ciphertext) {
        const parts = ciphertext.split(":");
        if (parts.length !== 3) {
          throw new Error("Invalid ciphertext format");
        }
        const iv = Buffer.from(parts[0], "hex");
        const authTag = Buffer.from(parts[1], "hex");
        const encryptedData = parts[2];
        const decipher = import_crypto.default.createDecipheriv("aes-256-gcm", this.masterKey, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedData, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
      }
    };
  }
});

// src/db.ts
function getPool() {
  if (_pool) return _pool;
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL environment variable is not defined");
  }
  _pool = new Pool({
    connectionString: dbUrl,
    max: 5,
    idleTimeoutMillis: 3e4,
    connectionTimeoutMillis: 5e3,
    ssl: {
      // Enforce TLS certificate validation.
      // Set PGSSLROOTCERT or NODE_EXTRA_CA_CERTS if using a self-signed cert.
      rejectUnauthorized: true
    }
  });
  _pool.on("error", (err) => {
    console.error("[db] idle client error:", err.message);
  });
  return _pool;
}
async function fetchPropertyAndTools(propertyId) {
  const pool = getPool();
  const propRes = await pool.query(
    "SELECT id, site_id, name, api_base, auth_type, auth_token, allow_agent_access FROM developer_properties WHERE id = $1",
    [propertyId]
  );
  if (propRes.rows.length === 0) {
    throw new Error(`Property config with ID "${propertyId}" not found in database`);
  }
  const toolsRes = await pool.query(
    "SELECT id, property_id, name, description, method, path, parameters, response_schema, response_mapping FROM developer_tools WHERE property_id = $1",
    [propertyId]
  );
  return {
    property: propRes.rows[0],
    tools: toolsRes.rows
  };
}
async function closePool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
var import_pg, Pool, _pool;
var init_db = __esm({
  "src/db.ts"() {
    "use strict";
    import_pg = __toESM(require("pg"));
    ({ Pool } = import_pg.default);
    _pool = null;
  }
});

// src/cache.ts
async function getCachedConfig(propertyId) {
  if (!redisClient) {
    return null;
  }
  try {
    const cached = await redisClient.get(`mcp:config:${propertyId}`);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.error("Redis cache get error:", err);
  }
  return null;
}
async function setCachedConfig(propertyId, config) {
  if (!redisClient) {
    return;
  }
  try {
    await redisClient.set(`mcp:config:${propertyId}`, JSON.stringify(config), {
      EX: 3600
      // 1 hour TTL
    });
  } catch (err) {
    console.error("Redis cache set error:", err);
  }
}
var import_redis, redisUrl, redisClient;
var init_cache = __esm({
  "src/cache.ts"() {
    "use strict";
    import_redis = require("redis");
    redisUrl = process.env.UPSTASH_REDIS_URL;
    redisClient = redisUrl ? (0, import_redis.createClient)({ url: redisUrl }) : null;
    if (redisClient) {
      redisClient.connect().catch((err) => {
        console.error("Redis connection error:", err);
      });
    }
  }
});

// src/ssrfValidator.ts
function isPrivateIp(ip) {
  const ipv4MappedMatch = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const normalizedIp = ipv4MappedMatch ? ipv4MappedMatch[1] : ip;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalizedIp)) {
    const parts = normalizedIp.split(".").map(Number);
    if (parts.some(isNaN) || parts.length !== 4) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 0) return true;
    return false;
  }
  if (normalizedIp === "::1" || normalizedIp === "::") return true;
  if (/^fe[89ab]/i.test(normalizedIp)) return true;
  if (/^f[cd]/i.test(normalizedIp)) return true;
  return false;
}
async function assertSafeUrl(urlStr) {
  const url = new URL(urlStr);
  const hostname = url.hostname;
  const res = await lookup(hostname);
  if (isPrivateIp(res.address)) {
    throw new Error(`SSRF Prevention: outbound requests to private IP address ${res.address} (resolved from "${hostname}") are prohibited`);
  }
  const safeUrl = new URL(urlStr);
  safeUrl.hostname = res.address;
  return {
    safeUrl: safeUrl.toString(),
    hostHeader: hostname
    // caller must forward this as the Host header
  };
}
var import_dns, import_util, lookup;
var init_ssrfValidator = __esm({
  "src/ssrfValidator.ts"() {
    "use strict";
    import_dns = __toESM(require("dns"));
    import_util = require("util");
    lookup = (0, import_util.promisify)(import_dns.default.lookup);
  }
});

// src/rateLimiter.ts
var McpRateLimiter;
var init_rateLimiter = __esm({
  "src/rateLimiter.ts"() {
    "use strict";
    McpRateLimiter = class {
      client;
      limit;
      windowSeconds;
      constructor(redisClient2, limit = 100, windowSeconds = 60) {
        this.client = redisClient2;
        this.limit = limit;
        this.windowSeconds = windowSeconds;
      }
      async assertAllowed(propertyId) {
        if (!this.client) {
          throw new Error("Rate limiting is not configured (Redis unavailable). Request denied.");
        }
        const key = `mcp:ratelimit:${propertyId}`;
        const current = await this.client.incr(key);
        if (current === 1) {
          await this.client.expire(key, this.windowSeconds);
        }
        if (current > this.limit) {
          throw new Error(
            `Rate limit exceeded: property "${propertyId}" has exceeded the limit of ${this.limit} requests per ${this.windowSeconds} seconds.`
          );
        }
      }
    };
  }
});

// src/index.ts
var index_exports = {};
__export(index_exports, {
  applyResponseMapping: () => applyResponseMapping,
  cleanParameterSchema: () => cleanParameterSchema,
  getNestedValue: () => getNestedValue,
  isPrivateIp: () => isPrivateIp,
  server: () => server,
  validateUrlForSSRF: () => assertSafeUrl
});
async function getConfig() {
  const propertyId = process.env.AKROPOLYS_PROPERTY_ID;
  if (!propertyId) {
    throw new Error("AKROPOLYS_PROPERTY_ID environment variable is required");
  }
  const cached = await getCachedConfig(propertyId);
  if (cached) {
    return cached;
  }
  const config = await fetchPropertyAndTools(propertyId);
  await setCachedConfig(propertyId, config);
  return config;
}
async function getDecryptedToken(token) {
  if (!token) return null;
  if (!vault) return token;
  try {
    return await vault.decrypt(token);
  } catch (err) {
    return token;
  }
}
function getNestedValue(obj, path) {
  if (!obj) return void 0;
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === void 0) return void 0;
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const key = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);
      current = current[key];
      if (Array.isArray(current)) {
        current = current[index];
      } else {
        return void 0;
      }
    } else {
      if (Array.isArray(current)) {
        current = current.map((item) => item ? item[part] : void 0);
      } else {
        current = current[part];
      }
    }
  }
  return current;
}
function applyResponseMapping(payload, mapping) {
  if (!payload) return payload;
  if (Array.isArray(payload)) {
    return payload.map((item) => applyResponseMapping(item, mapping));
  }
  const mappedResult = {};
  let hasMappedAny = false;
  for (const [targetKey, sourcePath] of Object.entries(mapping)) {
    if (typeof sourcePath === "string") {
      const val = getNestedValue(payload, sourcePath);
      if (val !== void 0) {
        mappedResult[targetKey] = val;
        hasMappedAny = true;
      }
    }
  }
  return hasMappedAny ? mappedResult : payload;
}
function cleanParameterSchema(params) {
  if (!params || typeof params !== "object") {
    return { type: "object", properties: {} };
  }
  const cleaned = JSON.parse(JSON.stringify(params));
  if (cleaned.properties && typeof cleaned.properties === "object") {
    for (const key of Object.keys(cleaned.properties)) {
      const prop = cleaned.properties[key];
      if (prop && typeof prop === "object") {
        delete prop.location;
      }
    }
  }
  return cleaned;
}
async function main() {
  const propertyId = process.env.AKROPOLYS_PROPERTY_ID;
  if (!propertyId) {
    console.error("\u274C ERROR: AKROPOLYS_PROPERTY_ID environment variable is required");
    process.exit(1);
  }
  const transport = new import_stdio.StdioServerTransport();
  await server.connect(transport);
  console.error(`\u2713 Akropolys MCP Proxy Server running for property: ${propertyId}`);
}
var import_dotenv, import_server, import_stdio, import_types, rateLimiter, vault, server;
var init_index = __esm({
  "src/index.ts"() {
    "use strict";
    import_dotenv = __toESM(require("dotenv"));
    import_server = require("@modelcontextprotocol/sdk/server/index.js");
    import_stdio = require("@modelcontextprotocol/sdk/server/stdio.js");
    import_types = require("@modelcontextprotocol/sdk/types.js");
    init_db();
    init_cache();
    init_vault();
    init_ssrfValidator();
    init_rateLimiter();
    init_ssrfValidator();
    rateLimiter = new McpRateLimiter(redisClient);
    import_dotenv.default.config();
    vault = null;
    try {
      vault = new LocalAESVault();
    } catch (err) {
      console.warn(`\u26A0\uFE0F WARNING: KMS Vault failed to initialize: ${err.message}. Raw tokens will be used.`);
    }
    server = new import_server.Server(
      {
        name: "akropolys-mcp",
        version: "1.2.3"
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );
    server.setRequestHandler(import_types.ListToolsRequestSchema, async () => {
      try {
        const { tools } = await getConfig();
        return {
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: cleanParameterSchema(t.parameters)
          }))
        };
      } catch (err) {
        console.error("Error listing tools:", err);
        return {
          tools: []
        };
      }
    });
    server.setRequestHandler(import_types.CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const argumentsObj = args || {};
      try {
        const { property, tools } = await getConfig();
        if (!property.allow_agent_access) {
          throw new Error(`Agent access is not enabled for property "${property.id}"`);
        }
        const tool = tools.find((t) => t.name === name);
        if (!tool) {
          throw new Error(`Tool "${name}" not found`);
        }
        const decryptedAuthToken = await getDecryptedToken(property.auth_token);
        let resolvedPath = tool.path;
        const queryParams = {};
        const headers = {};
        const bodyParams = {};
        if (property.auth_type === "bearer" && decryptedAuthToken) {
          headers["Authorization"] = `Bearer ${decryptedAuthToken}`;
        } else if (property.auth_type === "api_key" && decryptedAuthToken) {
          headers["X-API-Key"] = decryptedAuthToken;
          headers["X-Akropolys-Token"] = decryptedAuthToken;
          headers["Authorization"] = decryptedAuthToken;
        }
        const paramDefs = tool.parameters?.properties || {};
        const requiredParams = tool.parameters?.required || [];
        for (const reqField of requiredParams) {
          if (argumentsObj[reqField] === void 0) {
            throw new Error(`Missing required parameter: "${reqField}"`);
          }
        }
        for (const [key, val] of Object.entries(argumentsObj)) {
          const def = paramDefs[key] || {};
          const location = def.location || "body";
          if (location === "path") {
            resolvedPath = resolvedPath.replace(new RegExp(`:${key}`, "g"), String(val)).replace(new RegExp(`{${key}}`, "g"), String(val));
          } else if (location === "query") {
            queryParams[key] = String(val);
          } else if (location === "header") {
            headers[key] = String(val);
          } else if (location === "body") {
            bodyParams[key] = val;
          }
        }
        const baseUrl = property.api_base.replace(/\/+$/, "");
        const urlPath = resolvedPath.replace(/^\/+/, "");
        let fullUrl = `${baseUrl}/${urlPath}`;
        if (Object.keys(queryParams).length > 0) {
          const qs = new URLSearchParams(queryParams).toString();
          fullUrl += `?${qs}`;
        }
        const requestOptions = {
          method: tool.method.toUpperCase(),
          headers
        };
        if (["POST", "PUT", "PATCH"].includes(tool.method.toUpperCase())) {
          if (!headers["Content-Type"]) {
            headers["Content-Type"] = "application/json";
          }
          requestOptions.body = JSON.stringify(bodyParams);
        }
        await rateLimiter.assertAllowed(property.id);
        const { safeUrl, hostHeader } = await assertSafeUrl(fullUrl);
        headers["Host"] = hostHeader;
        const response = await fetch(safeUrl, requestOptions);
        const text = await response.text();
        let jsonPayload;
        try {
          jsonPayload = JSON.parse(text);
        } catch {
          jsonPayload = { responseText: text };
        }
        if (!response.ok) {
          return {
            content: [
              {
                type: "text",
                text: `API request failed with status ${response.status}: ${JSON.stringify(jsonPayload)}`
              }
            ],
            isError: true
          };
        }
        let normalized = jsonPayload;
        if (tool.response_mapping && typeof tool.response_mapping === "object" && Object.keys(tool.response_mapping).length > 0) {
          normalized = applyResponseMapping(jsonPayload, tool.response_mapping);
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(normalized, null, 2)
            }
          ]
        };
      } catch (err) {
        console.error(`Error executing tool "${name}":`, err);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${err.message}`
            }
          ],
          isError: true
        };
      }
    });
    if (process.env.NODE_ENV !== "test") {
      const shutdown = async (signal) => {
        console.error(`[mcp] ${signal} received \u2014 shutting down`);
        await closePool();
        process.exit(0);
      };
      process.on("SIGINT", () => shutdown("SIGINT"));
      process.on("SIGTERM", () => shutdown("SIGTERM"));
      main().catch((err) => {
        console.error("Fatal error in MCP server:", err);
        process.exit(1);
      });
    }
  }
});

// src/test-e2e.ts
var import_dotenv2 = __toESM(require("dotenv"));
var import_assert = __toESM(require("assert"));
var import_pg2 = require("pg");
init_vault();
process.env.NODE_ENV = "test";
import_dotenv2.default.config();
async function runE2E() {
  console.log("\u{1F9EA} Starting E2E Integration Test...");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("\u26A0\uFE0F Skipping E2E test: DATABASE_URL not set");
    return;
  }
  const kmsKey = "e2e-kms-secret-master-key";
  process.env.AKROPOLYS_KMS_MASTER_KEY = kmsKey;
  process.env.AKROPOLYS_PROPERTY_ID = "prop_e2e_test";
  const client = new import_pg2.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  try {
    const vault2 = new LocalAESVault();
    const mockPlaintextToken = "my-super-secret-token-value";
    const encryptedToken = await vault2.encrypt(mockPlaintextToken);
    await client.query("DELETE FROM developer_tools WHERE property_id = $1", ["prop_e2e_test"]);
    await client.query("DELETE FROM developer_properties WHERE id = $1", ["prop_e2e_test"]);
    const redisUrl2 = process.env.UPSTASH_REDIS_URL;
    if (redisUrl2) {
      const { createClient: createClient2 } = await import("redis");
      const redisClient2 = createClient2({ url: redisUrl2 });
      await redisClient2.connect();
      await redisClient2.del("mcp:config:prop_e2e_test");
      await redisClient2.disconnect();
      console.log('Cleared Redis cache for "prop_e2e_test"');
    }
    const siteRes = await client.query("SELECT id FROM sites LIMIT 1");
    if (siteRes.rows.length === 0) {
      throw new Error("No sites found in the database. Cannot link property.");
    }
    const siteId = siteRes.rows[0].id;
    console.log(`Inserting mock property "prop_e2e_test" linked to site: ${siteId}`);
    await client.query(`
      INSERT INTO developer_properties (id, site_id, name, api_base, auth_type, auth_token)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, ["prop_e2e_test", siteId, "E2E Test Store", "https://httpbin.org", "bearer", encryptedToken]);
    const parameters = {
      type: "object",
      properties: {
        sku: { type: "string", location: "path", description: "Product SKU" },
        qty: { type: "integer", location: "query", description: "Quantity" },
        "x-test-header": { type: "string", location: "header", description: "Custom Header" },
        note: { type: "string", location: "body", description: "Body note" }
      },
      required: ["sku"]
    };
    const responseMapping = {
      url_echoed: "url",
      header_echoed: "headers.X-Test-Header",
      method_echoed: "method",
      token_echoed: "headers.Authorization",
      note_echoed: "json.note"
    };
    console.log('Inserting mock tool "get_product_e2e"');
    await client.query(`
      INSERT INTO developer_tools (property_id, name, description, method, path, parameters, response_mapping)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      "prop_e2e_test",
      "get_product_e2e",
      "Mock tool for testing E2E proxy parameters mapping",
      "POST",
      "/anything/products/:sku",
      JSON.stringify(parameters),
      JSON.stringify(responseMapping)
    ]);
    const rawResp = await fetch("https://httpbin.org/anything/products/SKU-777-XYZ", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "test" })
    });
    const rawJson = await rawResp.json();
    console.log("Raw httpbin keys:", Object.keys(rawJson));
    console.log("Raw httpbin url field is:", rawJson.url);
    const { server: server2 } = await Promise.resolve().then(() => (init_index(), index_exports));
    const handlersMap = server2._requestHandlers;
    const callHandlerInfo = handlersMap.get("tools/call");
    if (!callHandlerInfo) {
      throw new Error("CallToolRequestSchema handler not registered on server");
    }
    const callHandler = callHandlerInfo;
    console.log("Executing mock tool call with arguments...");
    const result = await callHandler({
      method: "tools/call",
      params: {
        name: "get_product_e2e",
        arguments: {
          sku: "SKU-777-XYZ",
          qty: 5,
          "x-test-header": "Akropolys-Integration-Test",
          note: "E2E Integration logic runs successfully!"
        }
      }
    });
    console.log("Call result received:", JSON.stringify(result, null, 2));
    import_assert.default.ok(!result.isError, "Call must succeed");
    import_assert.default.ok(result.content && result.content[0] && result.content[0].type === "text", "Result content format incorrect");
    const parsedPayload = JSON.parse(result.content[0].text);
    import_assert.default.ok(parsedPayload.url_echoed.includes("/products/SKU-777-XYZ"), "Path parameters mapping failed: " + parsedPayload.url_echoed);
    import_assert.default.strictEqual(parsedPayload.header_echoed, "Akropolys-Integration-Test", "Header mapping failed");
    import_assert.default.strictEqual(parsedPayload.method_echoed, "POST", "HTTP method mapping failed");
    import_assert.default.strictEqual(parsedPayload.token_echoed, `Bearer ${mockPlaintextToken}`, "Encrypted Auth Token decryption or insertion failed");
    import_assert.default.strictEqual(parsedPayload.note_echoed, "E2E Integration logic runs successfully!", "Body mapping failed");
    console.log("\u2705 E2E Integration Test passed perfectly!");
  } finally {
    console.log("Cleaning up mock database entities...");
    await client.query("DELETE FROM developer_tools WHERE property_id = $1", ["prop_e2e_test"]);
    await client.query("DELETE FROM developer_properties WHERE id = $1", ["prop_e2e_test"]);
    await client.end();
  }
}
runE2E().catch((err) => {
  console.error("\u274C E2E Integration Test failed:", err);
  process.exit(1);
});
