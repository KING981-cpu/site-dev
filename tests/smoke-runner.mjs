import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { startStaticServer } from "../scripts/server.mjs";

const execFileAsync = promisify(execFile);

const BROWSER_CANDIDATES = process.platform === "win32"
  ? [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    ]
  : [
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
      "/snap/bin/chromium",
    ];

async function resolveBrowserPath() {
  if (process.env.BROWSER_BIN) {
    return process.env.BROWSER_BIN;
  }

  for (const candidate of BROWSER_CANDIDATES) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch (_error) {
      continue;
    }
  }

  throw new Error("Nenhum navegador headless compativel foi encontrado para o smoke test.");
}

async function run() {
  const browserPath = await resolveBrowserPath();
  const server = await startStaticServer(0);
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=12000",
    "--dump-dom",
    `http://127.0.0.1:${server.port}/tests/browser-smoke.html`,
  ];

  if (process.platform !== "win32") {
    args.unshift("--no-sandbox");
  }

  try {
    const { stdout, stderr } = await execFileAsync(browserPath, args, {
      maxBuffer: 8 * 1024 * 1024,
      timeout: 30000,
    });

    if (!stdout.includes('data-status="pass"') || !stdout.includes("SMOKE_RESULT:PASS")) {
      if (stderr && stderr.trim()) {
        process.stderr.write(stderr);
      }
      process.stdout.write(stdout);
      throw new Error("Smoke browser retornou status diferente de PASS.");
    }

    console.log("Smoke test browser: PASS");
  } finally {
    await server.close();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
