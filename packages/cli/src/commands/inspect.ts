import fs from 'fs';
import pc from 'picocolors';

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk;
      }
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
    process.stdin.on('error', (err) => {
      reject(err);
    });
  });
}

export async function runInspect(
  filePath: string | undefined,
  options: { stdin?: boolean; strict?: boolean }
) {
  console.log(pc.bold('\nAkropolys Inspect'));
  console.log(pc.dim('─────────────────────────'));

  let rawData = '';

  try {
    if (options.stdin || (!filePath && !process.stdin.isTTY)) {
      rawData = await readStdin();
    } else if (filePath) {
      if (!fs.existsSync(filePath)) {
        console.error(pc.red(`❌ Error: File not found at "${filePath}"`));
        process.exit(1);
      }
      rawData = fs.readFileSync(filePath, 'utf-8');
    } else {
      console.error(pc.red('❌ Error: Provide a file path or pipe via standard input using --stdin'));
      process.exit(1);
    }
  } catch (err: any) {
    console.error(pc.red(`❌ Error reading input: ${err.message}`));
    process.exit(1);
  }

  let items: any[] = [];
  try {
    const parsed = JSON.parse(rawData.trim());
    items = Array.isArray(parsed) ? parsed : [parsed];
  } catch (err: any) {
    console.error(pc.red(`❌ Error parsing JSON: Invalid JSON structure. ${err.message}`));
    process.exit(1);
  }

  console.log(pc.cyan(`Parsed ${items.length} catalog items.`));
  console.log(pc.dim('\nIngestion Quality Diagnostics:'));

  let warningsCount = 0;

  items.forEach((item, index) => {
    const record = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
    const identifier = record.id ?? `item at index ${index}`;
    
    // AP001: Missing Stable Identifier
    const id = record.id;
    const hasId = (typeof id === 'number' && Number.isSafeInteger(id)) ||
      (typeof id === 'string' && id.length > 0 && id.trim() === id &&
        !/[\u0000-\u001f\u007f-\u009f]/.test(id) && Buffer.byteLength(id, 'utf8') <= 512);

    if (!hasId) {
      console.log(`  ${pc.yellow('⚠')} [AP001] Missing or Invalid Required ID: "${identifier}" ➔ Supply a top-level id (non-empty string or safe integer); URL, name and slug cannot replace it`);
      warningsCount++;
    }

    // AP002: Low-Signal Payload (sparse payload: fewer than 2 keys, or only identifier is defined)
    const keysCount = Object.keys(record).length;
    if (keysCount < 2) {
      console.log(`  ${pc.yellow('⚠')} [AP002] Low-Signal Payload: "${identifier}" has sparse attributes ➔ Search vector quality reduced`);
      warningsCount++;
    }
  });

  console.log(pc.dim('\n─────────────────────────'));
  console.log(pc.bold(`Inspect complete: ${items.length} items checked, ${warningsCount} warnings flagged.`));

  if (warningsCount > 0 && options.strict) {
    console.log(pc.red('Exit code 3: strict mode failed due to warnings.'));
    process.exit(3);
  }

  process.exit(0);
}
