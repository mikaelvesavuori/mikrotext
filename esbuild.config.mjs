import { mkdirSync, readFileSync } from "node:fs";
import { build } from "esbuild";

const outputFileName = "mikrotext";
const packageVersion = JSON.parse(readFileSync("./package.json", "utf-8")).version;

console.log(`Building MikroText API (${packageVersion})...`);

mkdirSync("lib", { recursive: true });

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: true,
  treeShaking: true,
  platform: "node",
  target: "node24",
  mainFields: ["module", "main"],
  format: "esm",
  outfile: `lib/${outputFileName}.mjs`,
  banner: {
    js: "// MikroText - See LICENSE file for copyright and license details."
  }
});
