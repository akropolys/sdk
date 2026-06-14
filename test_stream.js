const http = require('http');

const body = JSON.stringify({
  query: "Cheapest smartphone",
  siteId: "shoppy-site",
  history: []
});

const req = http.request('http://localhost:8081/chat/stream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Akropolys-Site': 'shoppy-site',
    'X-Akropolys-Token': 'YOUR_AKROPOLYS_TOKEN'
  }
}, (res) => {
  console.log('STATUS:', res.statusCode);
  console.log('HEADERS:', JSON.stringify(res.headers));
  res.setEncoding('utf8');
  
  let chunkCount = 0;
  res.on('data', (chunk) => {
    chunkCount++;
    console.log(`\n--- CHUNK ${chunkCount} (${new Date().toLocaleTimeString()}) ---`);
    console.log(chunk);
  });
  
  res.on('end', () => {
    console.log('\n--- STREAM END ---');
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(body);
req.end();
