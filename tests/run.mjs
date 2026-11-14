// Test runner: bundles each tests/*.test.ts with esbuild (the app's TS imports have no file extensions,
// so Node can't run them directly) and executes it; then runs the server's node:test suite.
import { build } from "esbuild";
import { readdirSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// Inside the project, so bundled tests can still import packages (happy-dom) from node_modules.
const out = join("node_modules", ".cache", "plzen-hex-tests");
mkdirSync(out, { recursive: true });
let failed = false;
try {
  for (const file of readdirSync("tests").filter((f) => f.endsWith(".test.ts"))) {
    const bundle = join(out, file.replace(/\.ts$/, ".mjs"));
    await build({
      entryPoints: [join("tests", file)],
      bundle: true,
      platform: "node",
      format: "esm",
      outfile: bundle,
      logLevel: "warning",
      define: { "import.meta.env": '{"DEV":false}' },
      // happy-dom stays a normal import so it resolves from node_modules.
      external: ["happy-dom"],
    });
    console.log(`\n▶ ${file}`);
    const run = spawnSync(process.execPath, [bundle], { stdio: "inherit" });
    if (run.status !== 0) failed = true;
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

console.log("\n▶ server (node --test)");
const server = spawnSync(process.execPath, ["--test"], { cwd: "server", stdio: "inherit" });
if (server.status !== 0) failed = true;

process.exit(failed ? 1 : 0);
