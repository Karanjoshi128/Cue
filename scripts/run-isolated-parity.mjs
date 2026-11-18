/* A local verification entry point. Does not create/reset a database itself.
 * Usage: CUE_TEST_DATABASE_URL=<local URL with test in database name> node scripts/run-isolated-parity.mjs <mode>
 * Modes: dev, build, automations, early-access, reply-desk, connector, parity.
 * The older E2E modes reset the selected test database; parity replaces only its named fixture workspace.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
const modes = ["dev", "build", "automations", "early-access", "reply-desk", "connector", "parity"];
if (!modes.includes(mode)) throw new Error(`Choose a mode: ${modes.join(", ")}`);
const database = process.env.CUE_TEST_DATABASE_URL;
let valid = false;
try {
  const url = new URL(database);
  valid = ["postgres:", "postgresql:"].includes(url.protocol) && ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.includes("test");
} catch {}
if (!valid) throw new Error("Set CUE_TEST_DATABASE_URL to a local throwaway Postgres database with 'test' in its name.");

const env = { ...process.env };
// Explicit empty child env entries prevent Next/Prisma loading real values from .env.
for (const file of fs.readdirSync(root).filter((name) => /^\.env(?:\.|$)/.test(name))) {
  const name = path.join(root, file);
  if (!fs.statSync(name).isFile()) continue;
  for (const line of fs.readFileSync(name, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) env[match[1]] = "";
  }
}
for (const key of Object.keys(env)) {
  if (/TOKEN|SECRET|PASSWORD|API_KEY|SUPABASE|^R2_|^AWS_/.test(key)) env[key] = "";
}
Object.assign(env, {
  DATABASE_URL: database, DIRECT_URL: database,
  TOKEN_ENC_KEY: "1".repeat(64), META_APP_SECRET: "test-secret",
  APP_URL: "http://localhost:3219", NEXT_PUBLIC_APP_URL: "http://localhost:3219",
  NEXT_PUBLIC_IG_AUTOMATIONS: "1", NEXT_PUBLIC_REPLY_DESK: "1", NEXT_TELEMETRY_DISABLED: "1",
  CUE_NEXT_DIST_DIR: mode === "dev" ? ".next-parity-dev" : ".next-parity-build",
  NODE_ENV: mode === "build" ? "production" : "development",
});
const next = mode === "dev" || mode === "build";
const script = mode === "parity" ? "e2e-publishing-automation-parity.ts" : `e2e-${mode}.ts`;
const args = next
  ? [path.join(root, "node_modules/next/dist/bin/next"), mode, ...(mode === "dev" ? ["--port", "3219", "--hostname", "127.0.0.1"] : [])]
  : [path.join(root, "node_modules/tsx/dist/cli.mjs"), path.join(root, "scripts", script)];
const child = spawn(process.execPath, args, { cwd: root, env, windowsHide: true, stdio: "inherit" });
console.log(`Isolated ${mode} PID: ${child.pid}`);
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code || 0; });
