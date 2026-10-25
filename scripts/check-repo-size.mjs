// ENG-10: fail if the files tracked by git exceed 9 MB (the contest limit is 10 MB).
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";

const LIMIT_BYTES = 9 * 1024 * 1024;

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const sized = files.map((file) => ({ file, bytes: statSync(file).size }));
const total = sized.reduce((sum, entry) => sum + entry.bytes, 0);

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);
console.log(`Tracked files: ${files.length}, total ${mb(total)} MB (limit ${mb(LIMIT_BYTES)} MB)`);

if (total > LIMIT_BYTES) {
  const largest = sized.sort((a, b) => b.bytes - a.bytes).slice(0, 10);
  for (const { file, bytes } of largest) console.error(`  ${mb(bytes)} MB  ${file}`);
  process.exit(1);
}
