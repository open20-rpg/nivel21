#!/usr/bin/env node

// Sets the extension version where it's shown: manifest.json and the popup
// footer. The release workflow runs it before committing the release.
// Usage: node scripts/bump_version.mjs <version>
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: bump_version.mjs <version>");
  process.exit(1);
}

// Targeted replaces (not parse + stringify) keep the files' formatting.
const edits = [
  ["manifest.json", /^(\s*"version":\s*")[^"]*(")/m],
  ["popup/popup.html", /(<div class="version">Nivel21 v)[^<]*(<\/div>)/],
];

for (const [path, pattern] of edits) {
  const text = readFileSync(path, "utf8");
  if (!pattern.test(text)) {
    console.error(`No version found in ${path}`);
    process.exit(1);
  }
  writeFileSync(path, text.replace(pattern, `$1${version}$2`));
}

console.log(`Version set to ${version}`);
