// ENG-09: every requirement ID in the spec has a row in the README's requirement table, and every
// file the README links to exists.
import { existsSync, readFileSync } from "node:fs";

const SPEC = "3. Product-specification-v3-mvp.md";
const README = "README.md";

const spec = readFileSync(SPEC, "utf8");
const readme = readFileSync(README, "utf8");

const idsIn = (text) => new Set([...text.matchAll(/^\| ((?:EM|AI|UX|ENG)-\d+) \|/gm)].map((m) => m[1]));
const specIds = idsIn(spec);
const readmeIds = idsIn(readme);

const missing = [...specIds].filter((id) => !readmeIds.has(id));
const unknown = [...readmeIds].filter((id) => !specIds.has(id));

const brokenLinks = [...readme.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)]
  .map((m) => m[1])
  .filter((target) => !/^[a-z]+:/i.test(target))
  .map((target) => decodeURIComponent(target))
  .filter((target) => !existsSync(target));

console.log(`Spec requirements: ${specIds.size}, README rows: ${readmeIds.size}`);
for (const id of missing) console.error(`  Missing from the README table: ${id}`);
for (const id of unknown) console.error(`  In the README but not in the spec: ${id}`);
for (const target of new Set(brokenLinks)) console.error(`  Broken link: ${target}`);

if (missing.length || unknown.length || brokenLinks.length) process.exit(1);
