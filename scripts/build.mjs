// Bundle renovate-config-validator into a single self-contained file.
//
// The input is renovate's own CLI entrypoint (dist/config-validator.js),
// so the behaviour is the same as `npx --package renovate renovate-config-validator`.
import { build } from "esbuild";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const renovateDir = path.dirname(require.resolve("renovate/package.json"));
const renovatePkg = JSON.parse(await readFile(path.join(renovateDir, "package.json"), "utf8"));
const outDir = "dist";

// renovate's dist loads some modules at runtime via createRequire(import.meta.url),
// which esbuild can't follow. Replace those modules with static imports.
const shims = {
  // https://github.com/renovatebot/renovate/issues/32395
  // The workaround overrides the deprecated punycode built-in with the userland package.
  // In the bundle, `punycode` is aliased to the userland package instead.
  "punycode.js": `export function require_punycode() {}\nexport default undefined;`,
  "expose.js": `
import pkg from "renovate/package.json" with { type: "json" };
import bunyanModule from "bunyan";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
function re2() {
  // re2 is a native module, so it isn't bundled but installed as an optional dependency.
  // renovate falls back to RegExp if it's unavailable.
  return require("re2");
}
function prettier() {
  // Not reachable from the validator.
  throw new Error("prettier is not bundled");
}
async function openpgp() {
  // Only used to decrypt encrypted config with a private key, which the validator doesn't do.
  return await import("openpgp");
}
function bunyan() {
  return bunyanModule;
}
export { bunyan, openpgp, pkg, prettier, re2 };
`,
};

const shimPlugin = {
  name: "renovate-shims",
  setup(b) {
    const filter = new RegExp(
      `[\\\\/]renovate[\\\\/]dist[\\\\/](${Object.keys(shims).map((s) => s.replace(".", "\\.")).join("|")})$`,
    );
    b.onLoad({ filter }, (args) => ({
      contents: shims[path.basename(args.path)],
      loader: "js",
      resolveDir: renovateDir,
    }));
  },
};

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const result = await build({
  entryPoints: [path.join(renovateDir, "dist", "config-validator.js")],
  outfile: path.join(outDir, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  minify: true,
  metafile: true,
  legalComments: "none", // collected into THIRD_PARTY_LICENSES instead
  alias: { punycode: "punycode/punycode.js" },
  // These are required in try/catch and not needed for validation.
  // - @aws-sdk/signature-v4-crt: optional dependency of @aws-sdk
  // - dtrace-provider: optional native dependency of bunyan
  // - performance: only required when globalThis.performance is undefined
  // - re2: native module, installed as an optional dependency
  // - openpgp: optional dependency of renovate, see the shim of expose.js
  external: ["@aws-sdk/signature-v4-crt", "dtrace-provider", "performance", "re2", "openpgp"],
  banner: {
    // The entrypoint's shebang is preserved by esbuild and placed before the banner.
    js: [
      "import { createRequire as __bundleCreateRequire } from 'node:module';",
      "const require = __bundleCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  plugins: [shimPlugin],
  logLevel: "warning",
});

// Collect the licenses of all bundled packages.
const pkgDirs = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const m = input.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//);
  if (m) pkgDirs.add(m[1]);
}
const sections = [];
for (const dir of [...pkgDirs].sort()) {
  const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
  const files = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (!/^(licen[cs]e|copying|notice)/i.test(e.name)) continue;
    if (e.isFile()) {
      files.push(e.name);
    } else if (e.isDirectory()) {
      // e.g. LICENSES/
      for (const f of await readdir(path.join(dir, e.name), { recursive: true, withFileTypes: true })) {
        if (f.isFile()) files.push(path.relative(dir, path.join(f.parentPath, f.name)));
      }
    }
  }
  files.sort();
  const texts = await Promise.all(files.map((f) => readFile(path.join(dir, f), "utf8")));
  const license = typeof pkg.license === "string" ? pkg.license : JSON.stringify(pkg.license ?? pkg.licenses ?? "UNKNOWN");
  sections.push(
    [`${pkg.name}@${pkg.version}`, `License: ${license}`, ...(pkg.repository ? [`Repository: ${pkg.repository.url ?? pkg.repository}`] : []), "", ...texts]
      .join("\n")
      .trimEnd(),
  );
}
await writeFile(
  path.join(outDir, "THIRD_PARTY_LICENSES"),
  `This bundle contains the following packages.\n\n${sections.join(`\n\n${"-".repeat(80)}\n\n`)}\n`,
);

// Record the exact dependency tree used for the build, as part of the corresponding source.
await copyFile("package-lock.json", path.join(outDir, "package-lock.json"));
await writeFile(path.join(outDir, "renovate-version.txt"), `${renovatePkg.version}\n`);

// Keep the optional native dependency in sync with renovate.
const pkg = JSON.parse(await readFile("package.json", "utf8"));
pkg.optionalDependencies = { re2: renovatePkg.optionalDependencies.re2 };
pkg.engines = { node: renovatePkg.engines.node };
await writeFile("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`Bundled renovate ${renovatePkg.version} (${pkgDirs.size} packages)`);
