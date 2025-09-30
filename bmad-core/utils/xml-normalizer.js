const fs = require('fs');
const path = require('path');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');

// Keys that should always be arrays when present
const ARRAY_KEYS = new Set([
  // Top-level
  'acceptanceCriteria',
  'acceptanceCriteriaLinks',
  'integrationVerification',
  'telemetryEvents',
  'filesToModify',
  'filesToCreate',
  'apiEndpoints',
  'definitionOfReady',
  'definitionOfDone',
  'assumptions',
  'risks',
  'preConditions',
  'postConditions',
  'linkedArtifacts',
  // traceability nested arrays
  'acceptanceCriteriaCovered',
  'codeTouchpoints',
  'testExpectations',
  'prdReqIds',
  'reqIds',
  'flowIds',
  'integrationPointIds',
  'successCriteriaRefs',
  'archRefs',
  // qa hooks
  'acceptanceTestIds',
  'fixtures',
  // rollout plan
  'steps',
  // acceptanceTestMatrix
  'items',
  // work breakdown
  'tasks',
  'reviewers',
  'acRefs',
  'dependsOn',
  'changes',
  'files',
  'mustAdd',
  'covers',
  'commands',
  'precheck',
  'build',
  'test',
  'run',
  'artifacts',
  'logs',
  'subtasks',
  'acceptance',
  // impact radius
  'components',
  'symbols',
  // cleanup
  'deprecations',
  'notes'
]);

function ensureArrayShape(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(ensureArrayShape);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) { out[k] = v; continue; }
    if (ARRAY_KEYS.has(k)) {
      if (Array.isArray(v)) out[k] = v.map(ensureArrayShape);
      else out[k] = [ensureArrayShape(v)];
    } else if (typeof v === 'object') {
      out[k] = ensureArrayShape(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function getParser() {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    allowBooleanAttributes: true,
    parseAttributeValue: true,
    parseTagValue: true,
    trimValues: true
  });
}

function coerceString(target, path) {
  const parts = path.split('.');
  let obj = target;
  for (let i = 0; i < parts.length - 1; i++) {
    obj = obj?.[parts[i]];
    if (!obj) return;
  }
  const key = parts[parts.length - 1];
  if (obj && Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null) {
    obj[key] = String(obj[key]);
  }
}

function postProcessTypes(contract) {
  if (!contract || typeof contract !== 'object') return contract;
  // Ensure key IDs/versions are strings per JSON Schema
  const stringPaths = [
    'version',
    'schemaVersion',
    'story_id',
    'epic_id',
    'story.storyId',
    'story.title',
    'story.epicId',
    'story.featureId',
    'story.status',
    'story.sliceType',
    'story.owner'
  ];
  stringPaths.forEach(p => coerceString(contract, p));
  return contract;
}

function getBuilder() {
  return new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    format: true,
    suppressEmptyNode: true
  });
}

function normalizeContractObject(obj) {
  if (!obj) return obj;
  // Accept either root.StoryContract or root already the contract
  let contract = obj;
  if (obj.StoryContract && typeof obj.StoryContract === 'object') {
    contract = obj.StoryContract;
  }
  // Normalize arrays consistently
  contract = ensureArrayShape(contract);
  return contract;
}

function parseXmlString(xml) {
  const parser = getParser();
  const raw = parser.parse(xml);
  const normalized = normalizeContractObject(raw);
  return postProcessTypes(normalized);
}

function parseXmlFile(filePath) {
  const abs = path.resolve(filePath);
  const xml = fs.readFileSync(abs, 'utf8');
  return parseXmlString(xml);
}

function toXml(contract) {
  const builder = getBuilder();
  // Wrap under StoryContract root
  const wrapped = { StoryContract: contract };
  return builder.build(wrapped);
}

module.exports = {
  parseXmlString,
  parseXmlFile,
  toXml,
  normalizeContractObject
};
