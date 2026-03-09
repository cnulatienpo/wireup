import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const IPLD_DIR = path.join(projectRoot, 'ipld');
const OUTPUT_DIR = path.join(IPLD_DIR, 'published');
const CONFIG_PATH = path.join(IPLD_DIR, 'publish-config.json');

async function loadConfig() {
  const raw = await fs.readFile(CONFIG_PATH, 'utf8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed.resources)) {
    throw new Error('publish-config.json must contain a resources array.');
  }

  return parsed.resources;
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

async function copyResources(resourceMap) {
  const published = [];

  for (const item of resourceMap) {
    if (!item?.source || !item?.target || !item?.purpose) {
      console.warn('Skipping invalid publish entry (requires source, target, purpose).');
      continue;
    }

    const src = path.join(IPLD_DIR, item.source);
    const dst = path.join(OUTPUT_DIR, item.target);

    try {
      const content = await fs.readFile(src, 'utf8');
      await fs.writeFile(dst, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
      published.push({
        file: item.target,
        source: item.source,
        purpose: item.purpose,
        url: `/machines/files/${item.target}`,
      });
    } catch (error) {
      console.warn(`Skipping missing resource: ${item.source}`);
    }
  }

  return published;
}

async function writeIndex(resources) {
  const indexDoc = {
    node_type: 'wireup.machine_publish_index',
    generated_at: new Date().toISOString(),
    count: resources.length,
    resources,
  };

  await fs.writeFile(
    path.join(OUTPUT_DIR, 'index.json'),
    `${JSON.stringify(indexDoc, null, 2)}\n`,
    'utf8',
  );
}

async function main() {
  await ensureOutputDir();
  const resourceMap = await loadConfig();
  const resources = await copyResources(resourceMap);
  await writeIndex(resources);

  console.log(`Published ${resources.length} machine-facing IPLD resources.`);
  for (const resource of resources) {
    console.log(`- ${resource.file} -> ${resource.url}`);
  }
}

main().catch((error) => {
  console.error('Failed to build machine publish bundle:', error.message);
  process.exitCode = 1;
});
