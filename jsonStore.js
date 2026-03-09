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

function parseConcatenatedJson(content) {
  const docs = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        const jsonText = content.slice(start, i + 1);
        docs.push(JSON.parse(jsonText));
        start = -1;
      }
    }
  }

  return docs;
}

function normalizeOperatorRecord(record = {}) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const operator = record.operator || record.name;
  if (!operator) {
    return null;
  }

  const identity =
    record.layer_1_identity ||
    record.identity ||
    record.what_it_is ||
    "";

  const signalStory =
    record.layer_2_signal_story ||
    record.signal_story ||
    record.signalStory ||
    [record.mental_model, record.example].filter(Boolean).join(" ");

  const failureModes =
    record.layer_3_failure_modes ||
    record.failure_modes ||
    [];

  const lenses =
    record.layer_5_reasoning_lens ||
    record.reasoning_lens ||
    [];

  return {
    operator,
    layer_1_identity: identity,
    layer_2_signal_story: signalStory,
    layer_3_failure_modes: Array.isArray(failureModes) ? failureModes : [failureModes].filter(Boolean),
    layer_5_reasoning_lens: Array.isArray(lenses) ? lenses : [lenses].filter(Boolean)
  };
}

function normalizeOperatorCollection(docs = []) {
  const normalized = {};

  docs.forEach((doc) => {
    if (!doc || typeof doc !== "object") {
      return;
    }

    if (Array.isArray(doc.operators)) {
      doc.operators
        .map(normalizeOperatorRecord)
        .filter(Boolean)
        .forEach((item) => {
          normalized[item.operator] = item;
        });
      return;
    }

    if (typeof doc.operator === "string") {
      const item = normalizeOperatorRecord(doc);
      if (item) {
        normalized[item.operator] = item;
      }
      return;
    }

    Object.entries(doc).forEach(([name, value]) => {
      if (!value || typeof value !== "object") {
        return;
      }

      const item = normalizeOperatorRecord({ operator: name, ...value });
      if (item) {
        normalized[item.operator] = item;
      }
    });
  });

  return normalized;
}

function normalizeGlossaryCollection(docs = []) {
  const glossary = {};

  docs.forEach((doc) => {
    if (!doc || typeof doc !== "object") {
      return;
    }

    if (Array.isArray(doc.glossary)) {
      doc.glossary.forEach((entry) => {
        if (!entry || !entry.term) {
          return;
        }

        const term = String(entry.term).toLowerCase();
        const definition =
          entry.definition ||
          entry.plain_meaning ||
          entry.mental_model ||
          "";

        if (definition) {
          glossary[term] = definition;
        }
      });
      return;
    }

    Object.entries(doc).forEach(([term, definition]) => {
      if (typeof definition === "string") {
        glossary[String(term).toLowerCase()] = definition;
      }
    });
  });

  return glossary;
}

function normalizeLoadedDocs(key, docs) {
  if (key === "glossary") {
    return normalizeGlossaryCollection(docs);
  }

  return normalizeOperatorCollection(docs);
}

async function fetchFirstAvailable(paths) {
  for (const path of paths) {
    const res = await fetch(path);
    if (!res.ok) {
      continue;
    }

    const text = await res.text();
    const docs = parseConcatenatedJson(text);
    if (docs.length) {
      return docs;
    }

    return [JSON.parse(text)];
  }

  throw new Error(`No available JSON file for candidates: ${paths.join(", ")}`);
}

export async function loadAllJSON() {
  for (const [key, paths] of Object.entries(JSON_PATHS)) {
    const docs = await fetchFirstAvailable(paths);
    store[key] = normalizeLoadedDocs(key, docs);
  }

  return store;
}
