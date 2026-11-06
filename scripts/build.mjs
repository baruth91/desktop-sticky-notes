import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await Promise.all([
  ...["main", "preload"].map((name) =>
    build({
      entryPoints: [`src/${name}.ts`],
      outfile: `dist/${name}.cjs`,
      bundle: true,
      platform: "node",
      format: "cjs",
      external: ["electron"],
    }),
  ),
  build({
    entryPoints: ["src/renderer.ts"],
    outfile: "dist/renderer.js",
    bundle: true,
    platform: "browser",
    format: "iife",
  }),
  ...["index.html", "styles.css"].map((name) =>
    copyFile(`src/${name}`, `dist/${name}`),
  ),
]);
console.log("Built Desk notes.");
