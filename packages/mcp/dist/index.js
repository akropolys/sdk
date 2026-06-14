#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

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
module.exports = __toCommonJS(index_exports);
var import_dotenv = __toESM(require("dotenv"));
var import_server = require("@modelcontextprotocol/sdk/server/index.js");
var import_stdio = require("@modelcontextprotocol/sdk/server/stdio.js");
var import_types = require("@modelcontextprotocol/sdk/types.js");

// src/db.ts
var import_pg = __toESM(require("pg"));
var { Pool } = import_pg.default;
var _pool = null;
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

// src/cache.ts
var import_redis = require("redis");
var redisUrl = process.env.UPSTASH_REDIS_URL;
var redisClient = redisUrl ? (0, import_redis.createClient)({ url: redisUrl }) : null;
if (redisClient) {
  redisClient.connect().catch((err) => {
    console.error("Redis connection error:", err);
  });
}
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

// src/vault.ts
var import_crypto = __toESM(require("crypto"));
var LocalAESVault = class {
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

// src/ssrfValidator.ts
var import_dns = __toESM(require("dns"));
var import_util = require("util");
var lookup = (0, import_util.promisify)(import_dns.default.lookup);
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

// src/rateLimiter.ts
var McpRateLimiter = class {
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

// src/index.ts
var rateLimiter = new McpRateLimiter(redisClient);
import_dotenv.default.config();
var vault = null;
try {
  vault = new LocalAESVault();
} catch (err) {
  console.warn(`\u26A0\uFE0F WARNING: KMS Vault failed to initialize: ${err.message}. Raw tokens will be used.`);
}
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
var server = new import_server.Server(
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  applyResponseMapping,
  cleanParameterSchema,
  getNestedValue,
  isPrivateIp,
  server,
  validateUrlForSSRF
});
