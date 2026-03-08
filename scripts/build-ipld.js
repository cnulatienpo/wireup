#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const hasher = require('ipfs-only-hash');

const IPLD_DIR = path.resolve(__dirname, '..', 'ipld');

async function readJson(filename) {
  const filePath = path.join(IPLD_DIR, filename);
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

async function hashDagJson(obj) {
  const normalized = `${JSON.stringify(obj)}\n`;
  const cidString = await hasher.of(normalized, {
    cidVersion: 1,
    rawLeaves: false
  });

  const { CID } = await import('multiformats/cid');
  const { base32 } = await import('multiformats/bases/base32');

  return CID.parse(cidString).toString(base32);
}

async function main() {
  const operators = await readJson('operators.json');
  const signalGraph = await readJson('signal-flow.json');
  const pipeline = await readJson('pipeline.json');
  const rootTemplate = await readJson('system-root.json');

  const operatorsCid = await hashDagJson(operators);
  const signalGraphCid = await hashDagJson(signalGraph);
  const pipelineCid = await hashDagJson(pipeline);

  const root = {
    ...rootTemplate,
    operators: { '/': operatorsCid },
    signal_graph: { '/': signalGraphCid },
    pipeline: { '/': pipelineCid }
  };

  const rootCid = await hashDagJson(root);

  console.log('operators.json CID:', operatorsCid);
  console.log('signal-flow.json CID:', signalGraphCid);
  console.log('pipeline.json CID:', pipelineCid);
  console.log('Wireup IPLD root CID:');
  console.log(rootCid);
}

main().catch((error) => {
  console.error('Failed to build IPLD graph:', error);
  process.exit(1);
});
