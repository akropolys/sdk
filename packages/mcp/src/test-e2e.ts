process.env.NODE_ENV = 'test';
import dotenv from 'dotenv';
dotenv.config();
import assert from 'assert';
import { Client } from 'pg';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { LocalAESVault } from './vault';
import { fetchPropertyAndTools } from './db';

// We use httpbin.org to echo back our request and verify mapping
async function runE2E() {
  console.log('🧪 Starting E2E Integration Test...');
  
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('⚠️ Skipping E2E test: DATABASE_URL not set');
    return;
  }

  const kmsKey = 'e2e-kms-secret-master-key';
  process.env.AKROPOLYS_KMS_MASTER_KEY = kmsKey;
  process.env.AKROPOLYS_PROPERTY_ID = 'prop_e2e_test';

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  try {
    // 1. Setup - encrypt a mock token
    const vault = new LocalAESVault();
    const mockPlaintextToken = 'my-super-secret-token-value';
    const encryptedToken = await vault.encrypt(mockPlaintextToken);

    // Clean any residue first
    await client.query('DELETE FROM developer_tools WHERE property_id = $1', ['prop_e2e_test']);
    await client.query('DELETE FROM developer_properties WHERE id = $1', ['prop_e2e_test']);

    // Clean Redis cache key
    const redisUrl = process.env.UPSTASH_REDIS_URL;
    if (redisUrl) {
      const { createClient } = await import('redis');
      const redisClient = createClient({ url: redisUrl });
      await redisClient.connect();
      await redisClient.del('mcp:config:prop_e2e_test');
      await redisClient.disconnect();
      console.log('Cleared Redis cache for "prop_e2e_test"');
    }

    // 2. Insert mock developer property (using the real sites table to link if needed)
    // Let's get an existing site ID to avoid foreign key failure.
    const siteRes = await client.query('SELECT id FROM sites LIMIT 1');
    if (siteRes.rows.length === 0) {
      throw new Error('No sites found in the database. Cannot link property.');
    }
    const siteId = siteRes.rows[0].id;

    console.log(`Inserting mock property "prop_e2e_test" linked to site: ${siteId}`);
    await client.query(`
      INSERT INTO developer_properties (id, site_id, name, api_base, auth_type, auth_token)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, ['prop_e2e_test', siteId, 'E2E Test Store', 'https://httpbin.org', 'bearer', encryptedToken]);

    // 3. Insert mock tool config
    // path: /anything/products/:sku
    // response_mapping: { "sku_echoed": "json.sku", "header_echoed": "headers.X-Test-Header", "method_echoed": "method", "token_echoed": "headers.Authorization" }
    const parameters = {
      type: 'object',
      properties: {
        sku: { type: 'string', location: 'path', description: 'Product SKU' },
        qty: { type: 'integer', location: 'query', description: 'Quantity' },
        'x-test-header': { type: 'string', location: 'header', description: 'Custom Header' },
        note: { type: 'string', location: 'body', description: 'Body note' }
      },
      required: ['sku']
    };

    const responseMapping = {
      url_echoed: 'url',
      header_echoed: 'headers.X-Test-Header',
      method_echoed: 'method',
      token_echoed: 'headers.Authorization',
      note_echoed: 'json.note'
    };

    console.log('Inserting mock tool "get_product_e2e"');
    await client.query(`
      INSERT INTO developer_tools (property_id, name, description, method, path, parameters, response_mapping)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      'prop_e2e_test',
      'get_product_e2e',
      'Mock tool for testing E2E proxy parameters mapping',
      'POST',
      '/anything/products/:sku',
      JSON.stringify(parameters),
      JSON.stringify(responseMapping)
    ]);

    const rawResp = await fetch('https://httpbin.org/anything/products/SKU-777-XYZ', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'test' })
    });
    const rawJson = await rawResp.json();
    console.log('Raw httpbin keys:', Object.keys(rawJson));
    console.log('Raw httpbin url field is:', rawJson.url);

    // 4. Import index dynamically and invoke call tool logic manually
    const { server } = await import('./index');
    
    // We can directly call the registered handler
    // Find the handler for CallToolRequestSchema
    const handlersMap: Map<any, any> = (server as any)._requestHandlers;
    const callHandlerInfo = handlersMap.get('tools/call');
    
    if (!callHandlerInfo) {
      throw new Error('CallToolRequestSchema handler not registered on server');
    }
    
    const callHandler = callHandlerInfo;

    console.log('Executing mock tool call with arguments...');
    const result = await callHandler({
      method: 'tools/call',
      params: {
        name: 'get_product_e2e',
        arguments: {
          sku: 'SKU-777-XYZ',
          qty: 5,
          'x-test-header': 'Akropolys-Integration-Test',
          note: 'E2E Integration logic runs successfully!'
        }
      }
    });

    console.log('Call result received:', JSON.stringify(result, null, 2));

    assert.ok(!result.isError, 'Call must succeed');
    assert.ok(result.content && result.content[0] && result.content[0].type === 'text', 'Result content format incorrect');
    
    const parsedPayload = JSON.parse(result.content[0].text);
    
    // Verify mapped elements
    assert.ok(parsedPayload.url_echoed.includes('/products/SKU-777-XYZ'), 'Path parameters mapping failed: ' + parsedPayload.url_echoed);
    assert.strictEqual(parsedPayload.header_echoed, 'Akropolys-Integration-Test', 'Header mapping failed');
    assert.strictEqual(parsedPayload.method_echoed, 'POST', 'HTTP method mapping failed');
    assert.strictEqual(parsedPayload.token_echoed, `Bearer ${mockPlaintextToken}`, 'Encrypted Auth Token decryption or insertion failed');
    assert.strictEqual(parsedPayload.note_echoed, 'E2E Integration logic runs successfully!', 'Body mapping failed');

    console.log('✅ E2E Integration Test passed perfectly!');

  } finally {
    // 5. Cleanup database
    console.log('Cleaning up mock database entities...');
    await client.query('DELETE FROM developer_tools WHERE property_id = $1', ['prop_e2e_test']);
    await client.query('DELETE FROM developer_properties WHERE id = $1', ['prop_e2e_test']);
    await client.end();
  }
}

runE2E().catch(err => {
  console.error('❌ E2E Integration Test failed:', err);
  process.exit(1);
});
