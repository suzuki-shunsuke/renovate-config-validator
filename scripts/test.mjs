// Install the packed package outside of this repository, the same way as npx,
// so that the bundle can't resolve modules from this repository's node_modules.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "renovate-config-validator-"));
const tgz = execFileSync("npm", ["pack", "--pack-destination", dir], { encoding: "utf8" }).trim().split("\n").at(-1);
execFileSync("npm", ["init", "-y"], { cwd: dir, stdio: "ignore" });
execFileSync("npm", ["install", "--no-audit", "--no-fund", path.join(dir, tgz)], { cwd: dir, stdio: "inherit" });
cpSync("tests", path.join(dir, "tests"), { recursive: true });

const bin = path.join(dir, "node_modules", ".bin", "renovate-config-validator");
const cases = [
  { args: ["tests/valid.json"], code: 0 },
  { args: ["--strict", "tests/valid.json", "tests/valid.json5"], code: 0 },
  { args: ["tests/invalid.json"], code: 1 },
  { args: ["tests/migration.json"], code: 0 },
  { args: ["--strict", "tests/migration.json"], code: 1 },
  { args: ["tests/not-found.json"], code: 1 },
  // Lookahead is valid in RegExp but invalid in re2, so this fails only if re2 is available.
  { args: ["tests/re2.json"], code: 1 },
];

let failed = false;
for (const c of cases) {
  const r = spawnSync(bin, c.args, { cwd: dir, encoding: "utf8" });
  const ok = r.status === c.code;
  console.log(`${ok ? "ok" : "FAIL"}: renovate-config-validator ${c.args.join(" ")} (exit ${r.status}, want ${c.code})`);
  if (!ok) {
    failed = true;
    console.log(r.stdout, r.stderr);
  }
}
rmSync(dir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
