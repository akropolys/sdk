import dotenv from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { fetchPropertyAndTools, closePool } from './db.js';
import { getCachedConfig, setCachedConfig, redisClient } from './cache.js';
import { LocalAESVault } from './vault.js';
import { assertSafeUrl } from './ssrfValidator.js';
import { McpRateLimiter } from './rateLimiter.js';

export { isPrivateIp, assertSafeUrl as validateUrlForSSRF } from './ssrfValidator.js';

const rateLimiter = new McpRateLimiter(redisClient);

dotenv.config();

// Property ID resolved dynamically

// Instantiate vault
let vault: LocalAESVault | null = null;
try {
  vault = new LocalAESVault();
} catch (err: any) {
  console.warn(`⚠️ WARNING: KMS Vault failed to initialize: ${err.message}. Raw tokens will be used.`);
}

async function getConfig() {
  const propertyId = process.env.AKROPOLYS_PROPERTY_ID;
  if (!propertyId) {
    throw new Error('AKROPOLYS_PROPERTY_ID environment variable is required');
  }

  // Try Redis cache first
  const cached = await getCachedConfig(propertyId);
  if (cached) {
    return cached;
  }

  // Fallback to database
  const config = await fetchPropertyAndTools(propertyId);
  
  // Save to cache
  await setCachedConfig(propertyId, config);
  
  return config;
}

async function getDecryptedToken(token: string | null): Promise<string | null> {
  if (!token) return null;
  if (!vault) return token;

  try {
    return await vault.decrypt(token);
  } catch (err) {
    // Fallback to raw string if it's not encrypted
    return token;
  }
}

export function getNestedValue(obj: any, path: string): any {
  if (!obj) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;

    // Array notation support: items[0]
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const key = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);
      current = current[key];
      if (Array.isArray(current)) {
        current = current[index];
      } else {
        return undefined;
      }
    } else {
      if (Array.isArray(current)) {
        // Traverses the array and extracts the field from each element
        current = current.map(item => (item ? item[part] : undefined));
      } else {
        current = current[part];
      }
    }
  }
  return current;
}

export function applyResponseMapping(payload: any, mapping: Record<string, string>): any {
  if (!payload) return payload;

  if (Array.isArray(payload)) {
    return payload.map(item => applyResponseMapping(item, mapping));
  }

  const mappedResult: Record<string, any> = {};
  let hasMappedAny = false;
  for (const [targetKey, sourcePath] of Object.entries(mapping)) {
    if (typeof sourcePath === 'string') {
      const val = getNestedValue(payload, sourcePath);
      if (val !== undefined) {
        mappedResult[targetKey] = val;
        hasMappedAny = true;
      }
    }
  }
  return hasMappedAny ? mappedResult : payload;
}

export function cleanParameterSchema(params: any): any {
  if (!params || typeof params !== 'object') {
    return { type: 'object', properties: {} };
  }
  const cleaned = JSON.parse(JSON.stringify(params));
  if (cleaned.properties && typeof cleaned.properties === 'object') {
    for (const key of Object.keys(cleaned.properties)) {
      const prop = cleaned.properties[key];
      if (prop && typeof prop === 'object') {
        delete prop.location;
      }
    }
  }
  return cleaned;
}

export const server = new Server(
  {
    name: 'akropolys-mcp',
    version: '1.2.3',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register list tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  try {
    const { tools } = await getConfig();
    return {
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: cleanParameterSchema(t.parameters),
      })),
    };
  } catch (err: any) {
    console.error('Error listing tools:', err);
    return {
      tools: [],
    };
  }
});

// Register call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const argumentsObj = args || {};

  try {
    const { property, tools } = await getConfig();
    if (!property.allow_agent_access) {
      throw new Error(`Agent access is not enabled for property "${property.id}"`);
    }
    const tool = tools.find(t => t.name === name);
    if (!tool) {
      throw new Error(`Tool "${name}" not found`);
    }

    // Resolve credentials
    const decryptedAuthToken = await getDecryptedToken(property.auth_token);

    // Validate parameters & map to locations
    let resolvedPath = tool.path;
    const queryParams: Record<string, string> = {};
    const headers: Record<string, string> = {};
    const bodyParams: Record<string, any> = {};

    // Apply authorization headers
    if (property.auth_type === 'bearer' && decryptedAuthToken) {
      headers['Authorization'] = `Bearer ${decryptedAuthToken}`;
    } else if (property.auth_type === 'api_key' && decryptedAuthToken) {
      headers['X-API-Key'] = decryptedAuthToken;
      headers['X-Akropolys-Token'] = decryptedAuthToken;
      headers['Authorization'] = decryptedAuthToken;
    }

    const paramDefs = tool.parameters?.properties || {};
    const requiredParams = tool.parameters?.required || [];

    // Check required parameters
    for (const reqField of requiredParams) {
      if (argumentsObj[reqField] === undefined) {
        throw new Error(`Missing required parameter: "${reqField}"`);
      }
    }

    // Distribute parameters to their locations
    for (const [key, val] of Object.entries(argumentsObj)) {
      const def = paramDefs[key] || {};
      const location = def.location || 'body';

      if (location === 'path') {
        resolvedPath = resolvedPath
          .replace(new RegExp(`:${key}`, 'g'), String(val))
          .replace(new RegExp(`{${key}}`, 'g'), String(val));
      } else if (location === 'query') {
        queryParams[key] = String(val);
      } else if (location === 'header') {
        headers[key] = String(val);
      } else if (location === 'body') {
        bodyParams[key] = val;
      }
    }

    // Build URL
    const baseUrl = property.api_base.replace(/\/+$/, '');
    const urlPath = resolvedPath.replace(/^\/+/, '');
    let fullUrl = `${baseUrl}/${urlPath}`;

    if (Object.keys(queryParams).length > 0) {
      const qs = new URLSearchParams(queryParams).toString();
      fullUrl += `?${qs}`;
    }

    const requestOptions: RequestInit = {
      method: tool.method.toUpperCase(),
      headers,
    };

    if (['POST', 'PUT', 'PATCH'].includes(tool.method.toUpperCase())) {
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      requestOptions.body = JSON.stringify(bodyParams);
    }

    // Assert rate limits
    await rateLimiter.assertAllowed(property.id);

    // Validate target URL for SSRF protection.
    // assertSafeUrl returns the IP-substituted URL to use for the actual fetch,
    // closing the DNS-rebinding window between validation and connection.
    const { safeUrl, hostHeader } = await assertSafeUrl(fullUrl);
    headers['Host'] = hostHeader;

    // Execute request using the pre-validated IP URL
    const response = await fetch(safeUrl, requestOptions);
    const text = await response.text();
    let jsonPayload: any;
    try {
      jsonPayload = JSON.parse(text);
    } catch {
      jsonPayload = { responseText: text };
    }

    if (!response.ok) {
      return {
        content: [
          {
            type: 'text',
            text: `API request failed with status ${response.status}: ${JSON.stringify(jsonPayload)}`,
          },
        ],
        isError: true,
      };
    }

    // Normalize response using mapping
    let normalized = jsonPayload;
    if (
      tool.response_mapping &&
      typeof tool.response_mapping === 'object' &&
      Object.keys(tool.response_mapping).length > 0
    ) {
      normalized = applyResponseMapping(jsonPayload, tool.response_mapping);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(normalized, null, 2),
        },
      ],
    };
  } catch (err: any) {
    console.error(`Error executing tool "${name}":`, err);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${err.message}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const propertyId = process.env.AKROPOLYS_PROPERTY_ID;
  if (!propertyId) {
    console.error('❌ ERROR: AKROPOLYS_PROPERTY_ID environment variable is required');
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`✓ Akropolys MCP Proxy Server running for property: ${propertyId}`);
}

if (process.env.NODE_ENV !== 'test') {
  // Gracefully drain the DB pool on exit signals
  const shutdown = async (signal: string) => {
    console.error(`[mcp] ${signal} received — shutting down`);
    await closePool();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  main().catch(err => {
    console.error('Fatal error in MCP server:', err);
    process.exit(1);
  });
}
