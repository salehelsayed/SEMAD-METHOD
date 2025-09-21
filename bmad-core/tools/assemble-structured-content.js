#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function usage() {
  console.error('Usage: node tools/assemble-structured-content.js <type> <index.yaml> [output]');
  console.error('Supported types: template, checklist, task, concat');
  process.exit(1);
}

function readYaml(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return yaml.load(content);
}

function assembleTemplate(indexData, baseDir) {
  const sections = (indexData.sections || []).map(entry => {
    const filePath = typeof entry === 'string' ? entry : entry.file;
    if (!filePath) {
      throw new Error('Template index entry missing file path.');
    }
    const sectionPath = path.resolve(baseDir, filePath);
    return readYaml(sectionPath);
  });

  return {
    template: indexData.template,
    workflow: indexData.workflow,
    sections
  };
}

function assembleChecklist(indexData, baseDir) {
  const categories = (indexData.categories || []).map(entry => {
    const filePath = entry.file || entry;
    if (!filePath) {
      throw new Error('Checklist index entry missing file path.');
    }
    return readYaml(path.resolve(baseDir, filePath));
  });

  return {
    id: indexData.id,
    name: indexData.name,
    result: indexData.result,
    metadata: indexData.metadata,
    categories
  };
}

function assembleTask(indexData, baseDir) {
  const steps = (indexData.steps || []).map(entry => {
    const filePath = entry.file || entry;
    if (!filePath) {
      throw new Error('Task index entry missing file path.');
    }
    return readYaml(path.resolve(baseDir, filePath));
  });

  return {
    id: indexData.id,
    name: indexData.name,
    purpose: indexData.purpose,
    requirements: indexData.requirements,
    steps,
    outputs: indexData.outputs,
    metadata: indexData.metadata
  };
}

function assembleConcat(indexData, baseDir) {
  const parts = indexData.parts || [];
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error('Concat index must define a non-empty parts array.');
  }

  const separator = indexData.separator === undefined ? '' : indexData.separator;
  return parts
    .map(entry => {
      const filePath = entry.file || entry;
      if (!filePath) {
        throw new Error('Concat index entry missing file path.');
      }
      return fs.readFileSync(path.resolve(baseDir, filePath), 'utf8');
    })
    .join(separator);
}

function main() {
  const [type, indexPath, outputPath] = process.argv.slice(2);
  if (!type || !indexPath) {
    usage();
  }

  const supported = new Set(['template', 'checklist', 'task', 'concat']);
  if (!supported.has(type)) {
    console.error(`Unsupported type: ${type}`);
    usage();
  }

  const indexAbsPath = path.resolve(process.cwd(), indexPath);
  const baseDir = path.dirname(indexAbsPath);

  if (!fs.existsSync(indexAbsPath)) {
    console.error(`Index file not found: ${indexAbsPath}`);
    process.exit(1);
  }

  const indexData = readYaml(indexAbsPath);
  let assembled;

  switch (type) {
    case 'template':
      assembled = assembleTemplate(indexData, baseDir);
      break;
    case 'checklist':
      assembled = assembleChecklist(indexData, baseDir);
      break;
    case 'task':
      assembled = assembleTask(indexData, baseDir);
      break;
    case 'concat':
      assembled = assembleConcat(indexData, baseDir);
      break;
    default:
      usage();
  }

  if (typeof assembled === 'string') {
    if (outputPath) {
      const outAbsPath = path.resolve(process.cwd(), outputPath);
      fs.mkdirSync(path.dirname(outAbsPath), { recursive: true });
      fs.writeFileSync(outAbsPath, assembled);
    } else {
      process.stdout.write(assembled);
    }
  } else {
    const serialized = `${yaml.dump(assembled, { lineWidth: -1 })}`;
    if (outputPath) {
      const outAbsPath = path.resolve(process.cwd(), outputPath);
      fs.mkdirSync(path.dirname(outAbsPath), { recursive: true });
      fs.writeFileSync(outAbsPath, serialized);
    } else {
      process.stdout.write(serialized);
    }
  }
}

main();
