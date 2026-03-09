// jsonStore.js

const JSON_PATHS = {
  tops: ["/data/tops.json", "/touch designer tops.json", "/tops.json"],
  chops: ["/data/chops.json", "/chops.json"],
  sops: ["/data/sops.json", "/sops.json"],
  glossary: [
    "/data/glossary.json",
    "/td simple glossery.json",
    "/td simple glossery part 1.json",
    "/touch designer glossery part 2.json",
    "/touch designer glossery part 3.json"
  ]
};

export const store = {
  tops: {},
  chops: {},
  sops: {},
  glossary: {}
};

async function fetchFirstAvailable(paths) {
  for (const path of paths) {
    const res = await fetch(path);
    if (!res.ok) {
      continue;
    }

    return res.json();
  }

  throw new Error(`No available JSON file for candidates: ${paths.join(", ")}`);
}

export async function loadAllJSON() {
  for (const [key, paths] of Object.entries(JSON_PATHS)) {
    store[key] = await fetchFirstAvailable(paths);
  }

  return store;
}
