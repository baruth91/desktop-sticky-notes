import { build } from "esbuild";
import { spawnSync } from "node:child_process";
await build({
  entryPoints: ["tests/notes.test.ts"],
  outfile: "dist/checks.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
});
const result = spawnSync(process.execPath, ["--test", "dist/checks.cjs"], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
