#!/usr/bin/env node

// Which stores already serve a version (or a newer one), as JSON:
// {"chrome":true,"firefox":false}. A store that can't be checked right now
// counts as not published yet.
// Usage: node scripts/store_status.mjs <version>
import { fileURLToPath } from "node:url";

const CHROME_EXTENSION_ID = "jadlpdmjlfghndcehdhjhgndfmigbdoe";
const FIREFOX_ADDON_SLUG = "nivel21";

// Each store returns the version it's serving to users right now.
const PUBLISHED_VERSION = {
  async chrome() {
    // The same update check Chrome runs for installed extensions.
    const url = new URL("https://clients2.google.com/service/update2/crx");
    url.searchParams.set("response", "updatecheck");
    url.searchParams.set("acceptformat", "crx3");
    url.searchParams.set("prodversion", "150.0");
    url.searchParams.set("x", `id=${CHROME_EXTENSION_ID}&uc`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Chrome: ${response.status}`);
    const xml = await response.text();
    return xml.match(/<updatecheck[^>]*\sversion="([^"]+)"/)?.[1];
  },

  async firefox() {
    const response = await fetch(
      `https://addons.mozilla.org/api/v5/addons/addon/${FIREFOX_ADDON_SLUG}/`,
    );
    if (!response.ok) throw new Error(`Firefox: ${response.status}`);
    return (await response.json()).current_version.version;
  },
};

export function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = (process.argv[2] ?? "").replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error("Usage: store_status.mjs <version>");
    process.exit(1);
  }
  const status = {};
  for (const [store, published] of Object.entries(PUBLISHED_VERSION)) {
    try {
      const serving = await published();
      status[store] =
        Boolean(serving) && compareVersions(serving, version) >= 0;
      console.error(`${store}: serving ${serving}`);
    } catch (error) {
      console.error(error.message);
      status[store] = false;
    }
  }
  console.log(JSON.stringify(status));
}
