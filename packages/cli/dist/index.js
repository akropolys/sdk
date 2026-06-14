#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// src/index.ts
var import_commander = require("commander");

// src/commands/init.ts
var import_readline = __toESM(require("readline"));
var import_fs = __toESM(require("fs"));
var import_picocolors = __toESM(require("picocolors"));
var question = (rl, query) => {
  return new Promise((resolve) => rl.question(query, resolve));
};
async function runInit() {
  console.log(import_picocolors.default.bold(import_picocolors.default.cyan("\nConfiguring Akropolys Workspace...")));
  console.log(import_picocolors.default.dim("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  const rl = import_readline.default.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  try {
    const siteId = await question(rl, import_picocolors.default.cyan("? Enter your Akropolys Site ID: "));
    const apiToken = await question(rl, import_picocolors.default.cyan("? Enter your Akropolys API Token: "));
    const apiUrlInput = await question(rl, import_picocolors.default.cyan("? Enter your Akropolys API URL (default: https://api.akropolys.io): "));
    const apiUrl = apiUrlInput.trim() || "https://api.akropolys.io";
    console.log(import_picocolors.default.cyan("? Select your vertical:"));
    console.log("  1. commerce");
    console.log("  2. property");
    console.log("  3. motor");
    const verticalIndex = await question(rl, import_picocolors.default.cyan("  Select (1-3, default: 1): "));
    let vertical = "commerce";
    if (verticalIndex === "2") vertical = "property";
    else if (verticalIndex === "3") vertical = "motor";
    const envContent = `NEXT_PUBLIC_AKROPOLYS_SITE_ID=${siteId.trim()}
NEXT_PUBLIC_AKROPOLYS_API_TOKEN=${apiToken.trim()}
NEXT_PUBLIC_AKROPOLYS_API_URL=${apiUrl.trim()}
NEXT_PUBLIC_AKROPOLYS_VERTICAL=${vertical}
`;
    import_fs.default.writeFileSync(".env", envContent, "utf-8");
    console.log(import_picocolors.default.dim("\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
    console.log(import_picocolors.default.green("\u2713 Generated .env with configuration parameters."));
    console.log(import_picocolors.default.green("\u2713 Saved config template."));
  } catch (err) {
    console.error(import_picocolors.default.red(`
\u274C Error generating configuration: ${err.message}`));
    process.exit(1);
  } finally {
    rl.close();
  }
}

// src/commands/doctor.ts
var import_fs2 = __toESM(require("fs"));
var import_picocolors2 = __toESM(require("picocolors"));
function loadEnv() {
  const envPaths = [".env", ".env.local"];
  for (const envPath of envPaths) {
    if (import_fs2.default.existsSync(envPath)) {
      const content = import_fs2.default.readFileSync(envPath, "utf-8");
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.substring(0, eqIdx).trim();
          const value = trimmed.substring(eqIdx + 1).trim().replace(/^['"]|['"]$/g, "");
          if (key) {
            process.env[key] = value;
          }
        }
      }
    }
  }
}
async function runDoctor(options) {
  console.log(import_picocolors2.default.bold("\nAkropolys Doctor"));
  console.log(import_picocolors2.default.dim("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  loadEnv();
  const siteId = process.env.NEXT_PUBLIC_AKROPOLYS_SITE_ID || process.env.VITE_AKROPOLYS_SITE_ID || "";
  const apiToken = process.env.NEXT_PUBLIC_AKROPOLYS_API_TOKEN || process.env.VITE_AKROPOLYS_API_TOKEN || "";
  const apiUrl = process.env.NEXT_PUBLIC_AKROPOLYS_API_URL || process.env.VITE_AKROPOLYS_API_URL || "https://api.akropolys.io";
  const vertical = process.env.NEXT_PUBLIC_AKROPOLYS_VERTICAL || process.env.VITE_AKROPOLYS_VERTICAL || "commerce";
  if (options.verbose) {
    console.log(import_picocolors2.default.dim(`[Verbose] Site ID: ${siteId || "<not set>"}`));
    console.log(import_picocolors2.default.dim(`[Verbose] API Token: ${apiToken ? "********" : "<not set>"}`));
    console.log(import_picocolors2.default.dim(`[Verbose] API URL: ${apiUrl}`));
    console.log(import_picocolors2.default.dim(`[Verbose] Vertical: ${vertical}`));
  }
  if (!siteId) {
    console.log(import_picocolors2.default.red("\u274C Configuration: Site ID is missing. Set NEXT_PUBLIC_AKROPOLYS_SITE_ID in your env."));
    process.exit(1);
  }
  console.log(import_picocolors2.default.green(`\u2713 Configuration: Site ID detected (${siteId})`));
  if (!apiToken) {
    console.log(import_picocolors2.default.red("\u274C Environment: API Token is missing. Set NEXT_PUBLIC_AKROPOLYS_API_TOKEN in your env."));
    process.exit(1);
  }
  console.log(import_picocolors2.default.green("\u2713 Environment: API Token detected"));
  const start = Date.now();
  try {
    const res = await fetch(`${apiUrl}/health`, {
      method: "GET",
      headers: {
        "X-Akropolys-Token": apiToken,
        "X-Akropolys-Site": siteId
      }
    }).catch((err) => {
      throw new Error(`Fetch failed: ${err.message}`);
    });
    const duration = Date.now() - start;
    if (!res.ok) {
      console.log(import_picocolors2.default.red(`\u274C Connection: API responded with status ${res.status} (Ping: ${duration}ms)`));
      process.exit(2);
    }
    console.log(import_picocolors2.default.green(`\u2713 Connection: Successfully connected to ${apiUrl} (ping: ${duration}ms)`));
    console.log(import_picocolors2.default.green(`\u2713 Integration: Site vertical configured as "${vertical}"`));
    console.log(import_picocolors2.default.bold(import_picocolors2.default.green("\nStatus: Healthy (All configuration and connectivity checks passed)")));
    process.exit(0);
  } catch (err) {
    console.log(import_picocolors2.default.red(`\u274C Connection: Unreachable API at ${apiUrl}. Error: ${err.message}`));
    process.exit(2);
  }
}

// src/commands/inspect.ts
var import_fs3 = __toESM(require("fs"));
var import_picocolors3 = __toESM(require("picocolors"));
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("readable", () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk;
      }
    });
    process.stdin.on("end", () => {
      resolve(data);
    });
    process.stdin.on("error", (err) => {
      reject(err);
    });
  });
}
async function runInspect(filePath, options) {
  console.log(import_picocolors3.default.bold("\nAkropolys Inspect"));
  console.log(import_picocolors3.default.dim("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  let rawData = "";
  try {
    if (options.stdin || !filePath && !process.stdin.isTTY) {
      rawData = await readStdin();
    } else if (filePath) {
      if (!import_fs3.default.existsSync(filePath)) {
        console.error(import_picocolors3.default.red(`\u274C Error: File not found at "${filePath}"`));
        process.exit(1);
      }
      rawData = import_fs3.default.readFileSync(filePath, "utf-8");
    } else {
      console.error(import_picocolors3.default.red("\u274C Error: Provide a file path or pipe via standard input using --stdin"));
      process.exit(1);
    }
  } catch (err) {
    console.error(import_picocolors3.default.red(`\u274C Error reading input: ${err.message}`));
    process.exit(1);
  }
  let items = [];
  try {
    const parsed = JSON.parse(rawData.trim());
    items = Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    console.error(import_picocolors3.default.red(`\u274C Error parsing JSON: Invalid JSON structure. ${err.message}`));
    process.exit(1);
  }
  console.log(import_picocolors3.default.cyan(`Parsed ${items.length} catalog items.`));
  console.log(import_picocolors3.default.dim("\nIngestion Quality Diagnostics:"));
  let warningsCount = 0;
  items.forEach((item, index) => {
    const identifier = item.id || item.productId || item.slug || item.url || item.name || `item at index ${index}`;
    const hasId = item.id !== void 0 && item.id !== null && item.id !== "";
    const hasProductId = item.productId !== void 0 && item.productId !== null && item.productId !== "";
    const hasSlug = item.slug !== void 0 && item.slug !== null && item.slug !== "";
    const hasUrl = item.url !== void 0 && item.url !== null && item.url !== "";
    const hasName = item.name !== void 0 && item.name !== null && item.name !== "";
    if (!hasId && !hasProductId && !hasSlug && !hasUrl && !hasName) {
      console.log(`  ${import_picocolors3.default.yellow("\u26A0")} [AP001] Missing Stable Identifier: "${identifier}" \u2794 Deduplication & correlation unavailable`);
      warningsCount++;
    }
    const keysCount = Object.keys(item).length;
    if (keysCount < 2) {
      console.log(`  ${import_picocolors3.default.yellow("\u26A0")} [AP002] Low-Signal Payload: "${identifier}" has sparse attributes \u2794 Search vector quality reduced`);
      warningsCount++;
    }
  });
  console.log(import_picocolors3.default.dim("\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log(import_picocolors3.default.bold(`Inspect complete: ${items.length} items checked, ${warningsCount} warnings flagged.`));
  if (warningsCount > 0 && options.strict) {
    console.log(import_picocolors3.default.red("Exit code 3: strict mode failed due to warnings."));
    process.exit(3);
  }
  process.exit(0);
}

// src/index.ts
var program = new import_commander.Command();
program.name("akropolys").description("Akropolys Command Line Tool \u2014 Developer diagnostics, setup helper, and structural inspector.").version("1.0.0");
program.command("init").description("Configure the local workspace by generating a default .env file template.").action(async () => {
  await runInit();
});
program.command("doctor").description("Perform a health check consolidating local configuration values and backend API reachability.").option("-v, --verbose", "Include verbose logs and configuration dumps.").action(async (options) => {
  await runDoctor(options);
});
program.command("inspect").description("Statically inspect a catalog payload file or stream against the Akropolys Anti-Pattern Registry.").argument("[file]", "Path to the local catalog JSON file.").option("--stdin", "Force reading data from standard input.").option("--strict", "Fail the process (exit code 3) if any structural registry warnings are triggered.").action(async (file, options) => {
  await runInspect(file, options);
});
program.parse(process.argv);
