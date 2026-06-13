import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { minify } from "html-minifier-terser";
import { transform } from "lightningcss";

const DIST_DIR = "./dist";
const hostedApiBaseUrl = "https://text-api.mikrosuite.com";

rmSync(DIST_DIR, { recursive: true, force: true });
mkdirSync(DIST_DIR, { recursive: true });

const getPackageVersion = () => JSON.parse(readFileSync("./package.json", "utf-8")).version;

async function bundle(isMinified = true) {
  const packageVersion = getPackageVersion();
  const fileName = isMinified ? "mikrotext.min.js" : "mikrotext.js";

  console.log(`Bundling version ${packageVersion} of MikroText web app to "${fileName}"...`);

  await build({
    entryPoints: ["./app/scripts/main.mjs"],
    outfile: `dist/${fileName}`,
    target: ["chrome139", "safari18", "edge143"],
    format: "iife",
    minify: isMinified,
    treeShaking: true,
    bundle: true,
    sourcemap: false,
    banner: {
      js: `/*\n * MikroText version ${packageVersion}\n * Bundle generated on ${new Date().toISOString()}\n */`
    }
  }).catch(() => process.exit(1));
}

await bundle();

const cssInput = readFileSync("./app/styles.css");

const { code } = transform({
  filename: "./app/styles.css",
  code: cssInput,
  minify: true,
  sourceMap: false
});

writeFileSync("./dist/styles.css", code);

const html = readFileSync("./app/index.html", "utf8");
const minified = await minify(html, {
  collapseWhitespace: true,
  removeComments: true,
  minifyCSS: true,
  minifyJS: true
});

writeFileSync("./dist/index.html", minified);

const staticFiles = [
  "_headers",
  "app-icon.svg",
  "app-icon-192.png",
  "app-icon-512.png",
  "apple-touch-icon.png",
  "config.json",
  "favicon.svg",
  "favicon-16.png",
  "favicon-32.png",
  "favicon.ico",
  "manifest.webmanifest",
  "offline.html",
  "pwa.js"
];

for (const fileName of staticFiles) {
  cpSync(`./app/${fileName}`, `./dist/${fileName}`);
}

const hostedRuntimeApiBaseUrl = writeHostedRuntimeConfig();
writeHostedSecurityPolicy(hostedRuntimeApiBaseUrl);

console.log("MikroText web app written to dist");

function writeHostedRuntimeConfig() {
  const apiBaseUrl = getHostedApiBaseUrl();
  if (!apiBaseUrl) return "";

  try {
    new URL(apiBaseUrl);
  } catch {
    throw new Error(`Invalid MikroText public API base URL: ${apiBaseUrl}`);
  }

  const config = JSON.parse(readFileSync("./app/config.json", "utf8"));
  writeFileSync(
    "./dist/config.json",
    `${JSON.stringify(
      {
        ...config,
        apiBaseUrl
      },
      null,
      2
    )}\n`
  );

  return apiBaseUrl;
}

function writeHostedSecurityPolicy(apiBaseUrl) {
  if (!apiBaseUrl) return;

  const apiOrigin = new URL(apiBaseUrl).origin;
  addApiOriginToConnectSrc("./dist/_headers", apiOrigin);
  addApiOriginToConnectSrc("./dist/index.html", apiOrigin);
}

function addApiOriginToConnectSrc(filePath, apiOrigin) {
  const contents = readFileSync(filePath, "utf8");
  if (contents.includes(apiOrigin)) return;

  const updatedContents = contents.replace(/connect-src ([^;]+);/, (_match, sources) => {
    return `connect-src ${sources} ${apiOrigin};`;
  });

  if (updatedContents === contents) {
    throw new Error(`Could not find connect-src directive in ${filePath}`);
  }

  writeFileSync(filePath, updatedContents);
}

function getHostedApiBaseUrl() {
  const configuredApiBaseUrl = process.env.MIKROTEXT_PUBLIC_API_BASE_URL?.trim();
  if (configuredApiBaseUrl) return configuredApiBaseUrl;

  return process.env.CF_PAGES === "1" ? hostedApiBaseUrl : "";
}
