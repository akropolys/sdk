process.env.NODE_ENV = 'test';
import assert from 'assert';
import { LocalAESVault } from './vault';

// Test 1: KMS local vault AES-256-GCM cycle
async function testKMSVault() {
  console.log('🧪 Testing KMS Vault...');
  const key = 'test-kms-secret-master-key-longer-value';
  process.env.AKROPOLYS_KMS_MASTER_KEY = key;

  const vault = new LocalAESVault();
  const plaintext = 'super-secret-api-token-12345';
  
  const ciphertext = await vault.encrypt(plaintext);
  assert.ok(ciphertext.includes(':'), 'Ciphertext must contain colon delimiters');
  
  const decrypted = await vault.decrypt(ciphertext);
  assert.strictEqual(decrypted, plaintext, 'Decrypted text must match plaintext');
  console.log('✅ KMS Vault passed.');
}

// Test 2: Nested response mapping resolver
function testResponseMapping(getNestedValue: Function, applyResponseMapping: Function) {
  console.log('🧪 Testing Response Mapping...');
  
  const payload = {
    data: {
      product: {
        id: '123',
        title: 'Vivo X300',
        pricing: { amount: 169999.00 },
        tags: ['smartphone', 'android']
      },
      items: [
        { name: 'Item A', value: 10 },
        { name: 'Item B', value: 20 }
      ]
    }
  };

  // Test getNestedValue
  assert.strictEqual(getNestedValue(payload, 'data.product.id'), '123');
  assert.strictEqual(getNestedValue(payload, 'data.product.pricing.amount'), 169999.00);
  assert.strictEqual(getNestedValue(payload, 'data.product.nonexistent'), undefined);
  
  // Test array mapping inside getNestedValue
  const itemNames = getNestedValue(payload, 'data.items.name');
  assert.deepStrictEqual(itemNames, ['Item A', 'Item B']);

  // Test applyResponseMapping
  const mapping = {
    productId: 'data.product.id',
    name: 'data.product.title',
    price: 'data.product.pricing.amount',
    tagsList: 'data.product.tags',
    itemNames: 'data.items.name'
  };

  const normalized = applyResponseMapping(payload, mapping);
  
  assert.deepStrictEqual(normalized, {
    productId: '123',
    name: 'Vivo X300',
    price: 169999.00,
    tagsList: ['smartphone', 'android'],
    itemNames: ['Item A', 'Item B']
  });

  console.log('✅ Response Mapping passed.');
}

// Test 3: Parameter cleaning schema
function testParameterCleaning(cleanParameterSchema: Function) {
  console.log('🧪 Testing Parameter Cleaning...');

  const devParams = {
    type: 'object',
    properties: {
      sku: {
        type: 'string',
        location: 'path',
        description: 'Stock keeping unit identifier'
      },
      quantity: {
        type: 'integer',
        location: 'query',
        description: 'Quantity to purchase'
      }
    },
    required: ['sku']
  };

  const cleaned = cleanParameterSchema(devParams);

  assert.deepStrictEqual(cleaned, {
    type: 'object',
    properties: {
      sku: {
        type: 'string',
        description: 'Stock keeping unit identifier'
      },
      quantity: {
        type: 'integer',
        description: 'Quantity to purchase'
      }
    },
    required: ['sku']
  });

  console.log('✅ Parameter Cleaning passed.');
}

// Test 4: SSRF prevention check
async function testSSRFProtection(isPrivateIp: Function, validateUrlForSSRF: Function) {
  console.log('🧪 Testing SSRF Protection...');
  
  // Private IPs should be blocked
  assert.ok(isPrivateIp('127.0.0.1'), 'Localhost should be classified as private');
  assert.ok(isPrivateIp('10.0.0.1'), 'RFC 1918 10.x should be classified as private');
  assert.ok(isPrivateIp('172.16.0.1'), 'RFC 1918 172.16.x should be classified as private');
  assert.ok(isPrivateIp('192.168.1.100'), 'RFC 1918 192.168.x should be classified as private');
  assert.ok(isPrivateIp('169.254.169.254'), 'AWS Metadata service IP should be classified as private');
  assert.ok(isPrivateIp('::1'), 'IPv6 loopback should be classified as private');
  assert.ok(isPrivateIp('::'), 'IPv6 unspecified should be classified as private');
  
  // Public IPs should be allowed
  assert.ok(!isPrivateIp('8.8.8.8'), 'Google DNS IP should be public');
  assert.ok(!isPrivateIp('1.1.1.1'), 'Cloudflare DNS IP should be public');
  
  // URL check throws on loopback/private
  try {
    await validateUrlForSSRF('http://127.0.0.1:8080/admin');
    assert.fail('Should block loopback URLs');
  } catch (err: any) {
    assert.ok(err.message.includes('SSRF Prevention'), 'Error message must mention SSRF Prevention');
  }

  try {
    await validateUrlForSSRF('http://169.254.169.254/latest/meta-data');
    assert.fail('Should block AWS metadata service URLs');
  } catch (err: any) {
    assert.ok(err.message.includes('SSRF Prevention'), 'Error message must mention SSRF Prevention');
  }

  // URL check succeeds on public sites
  await validateUrlForSSRF('https://httpbin.org/anything');
  await validateUrlForSSRF('https://api.github.com');

  console.log('✅ SSRF Protection passed.');
}

async function runAll() {
  try {
    await testKMSVault();
    
    // Dynamically import helpers to prevent ESM/TS hoisting execution issues
    const { getNestedValue, applyResponseMapping, cleanParameterSchema, isPrivateIp, validateUrlForSSRF } = await import('./index');
    
    testResponseMapping(getNestedValue, applyResponseMapping);
    testParameterCleaning(cleanParameterSchema);
    await testSSRFProtection(isPrivateIp, validateUrlForSSRF);
    
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
  } catch (err: any) {
    console.error('❌ TEST FAILURE:', err);
    process.exit(1);
  }
}

runAll();
