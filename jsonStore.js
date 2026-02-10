// jsonStore.js

const JSON_PATHS = {
  tops: "/data/tops.json",
  chops: "/data/chops.json",
  sops: "/data/sops.json",
  glossary: "/data/glossary.json"
};

export const store = {
  tops: {},
  chops: {},
  sops: {},
  glossary: {}
};

export async function loadAllJSON() {
  for (const [key, path] of Object.entries(JSON_PATHS)) {
    const res = await fetch(path);
    store[key] = await res.json();
  }
  return store;
}
