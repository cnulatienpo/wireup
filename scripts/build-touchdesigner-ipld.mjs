/**
 * Generates a content-addressed IPLD DAG representation of a TouchDesigner patch snapshot.
 * This script intentionally works from a normalized JSON export and does not parse .toe files.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import * as dagJson from '@ipld/dag-json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const INPUT_PATH = path.join(projectRoot, 'scripts', 'example-patch-export.json');
const OUTPUT_ROOT = path.join(projectRoot, 'ipld', 'generated');
const OUTPUT_OPERATORS = path.join(OUTPUT_ROOT, 'operators');
const OUTPUT_CONNECTIONS = path.join(OUTPUT_ROOT, 'connections');

function sortKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .reduce((acc, key) => {
        acc[key] = sortKeysDeep(value[key]);
        return acc;
      }, {});
  }

  return value;
}

async function cidForObject(obj) {
  const normalized = sortKeysDeep(obj);
  const encoded = dagJson.encode(normalized);
  const hash = await sha256.digest(encoded);
  const cid = CID.createV1(dagJson.code, hash);
  return { cid: cid.toString(), normalized };
}

async function ensureDirectories() {
  await fs.mkdir(OUTPUT_OPERATORS, { recursive: true });
  await fs.mkdir(OUTPUT_CONNECTIONS, { recursive: true });
}

function safeFileName(input) {
  return input.replace(/^\/+/, '').replace(/\//g, '__');
}

async function main() {
  await ensureDirectories();

  const raw = await fs.readFile(INPUT_PATH, 'utf8');
  const snapshot = JSON.parse(raw);

  if (!snapshot?.patch_name || !snapshot?.root_network) {
    throw new Error('Snapshot must include patch_name and root_network.');
  }

  if (!Array.isArray(snapshot.operators) || !Array.isArray(snapshot.connections)) {
    throw new Error('Snapshot must include operators[] and connections[] arrays.');
  }

  const operatorEntries = [];
  const connectionEntries = [];

  for (const operator of snapshot.operators) {
    const operatorNode = {
      node_type: 'touchdesigner.operator',
      patch_name: snapshot.patch_name,
      network_path: snapshot.root_network,
      ...operator
    };

    const { cid, normalized } = await cidForObject(operatorNode);
    operatorEntries.push({ path: operator.path, cid, obj: normalized });

    const fileName = `${safeFileName(operator.path)}.json`;
    await fs.writeFile(path.join(OUTPUT_OPERATORS, fileName), `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  }

  for (const connection of snapshot.connections) {
    const connectionNode = {
      node_type: 'touchdesigner.connection',
      patch_name: snapshot.patch_name,
      network_path: snapshot.root_network,
      ...connection
    };

    const { cid, normalized } = await cidForObject(connectionNode);
    connectionEntries.push({ from: connection.from, to: connection.to, cid, obj: normalized });

    const fileName = `${safeFileName(connection.from)}--to--${safeFileName(connection.to)}.json`;
    await fs.writeFile(path.join(OUTPUT_CONNECTIONS, fileName), `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  }

  const networkRootNode = {
    node_type: 'touchdesigner.network_root',
    network_path: snapshot.root_network,
    operators: operatorEntries.map(({ path: operatorPath, cid }) => ({
      path: operatorPath,
      cid: { '/': cid }
    })),
    connections: connectionEntries.map(({ from, to, cid }) => ({
      from,
      to,
      cid: { '/': cid }
    }))
  };

  const { cid: networkRootCid, normalized: normalizedNetworkRoot } = await cidForObject(networkRootNode);

  const patchRootNode = {
    node_type: 'touchdesigner.patch_root',
    patch_name: snapshot.patch_name,
    network_root: { '/': networkRootCid }
  };

  const { cid: patchRootCid, normalized: normalizedPatchRoot } = await cidForObject(patchRootNode);

  const manifest = sortKeysDeep({
    patch_name: snapshot.patch_name,
    patch_root_cid: patchRootCid,
    network_root_cid: networkRootCid,
    operator_cids: Object.fromEntries(operatorEntries.map(({ path: operatorPath, cid }) => [operatorPath, cid])),
    connection_cids: connectionEntries.map(({ from, to, cid }) => ({ from, to, cid }))
  });

  await fs.writeFile(path.join(OUTPUT_ROOT, 'network-root.json'), `${JSON.stringify(normalizedNetworkRoot, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(OUTPUT_ROOT, 'patch-root.json'), `${JSON.stringify(normalizedPatchRoot, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(OUTPUT_ROOT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log('TouchDesigner IPLD export complete.\n');
  console.log('Operators:');
  operatorEntries.forEach(({ path: operatorPath, cid }) => {
    console.log(`  ${operatorPath} -> ${cid}`);
  });

  console.log('\nConnections:');
  connectionEntries.forEach(({ from, to, cid }) => {
    console.log(`  ${from} -> ${to} -> ${cid}`);
  });

  console.log(`\nNetwork root CID: ${networkRootCid}`);
  console.log(`Patch root CID:   ${patchRootCid}`);
}

main().catch((error) => {
  console.error('Failed to build TouchDesigner IPLD export:', error.message);
  process.exitCode = 1;
});
