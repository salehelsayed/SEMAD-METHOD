const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { parseXmlFile } = require('./xml-normalizer');

function ensureStoryExists(storyPath) {
  if (!storyPath) {
    throw new Error('Story path is required');
  }
  const abs = path.resolve(storyPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Story not found at ${abs}`);
  }
  return abs;
}

function readStoryFile(storyPath) {
  const abs = ensureStoryExists(storyPath);
  const raw = fs.readFileSync(abs, 'utf8');
  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter = frontmatterMatch ? yaml.load(frontmatterMatch[1]) : null;
  const bodyStart = frontmatterMatch ? frontmatterMatch[0].length : 0;
  const body = raw.slice(bodyStart);
  return { absPath: abs, frontmatter, body, raw };
}

function loadStoryContract(storyPath) {
  const { absPath, frontmatter } = readStoryFile(storyPath);
  const fm = frontmatter || {};
  // Prefer external XML pointer if present
  let xmlKey = null;
  for (const k of Object.keys(fm)) {
    if (/^StoryContractXml$/i.test(k)) { xmlKey = k; break; }
  }

  if (xmlKey && typeof fm[xmlKey] === 'string') {
    const p = fm[xmlKey];
    const xmlPath = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
    if (!fs.existsSync(xmlPath)) {
      throw new Error(`StoryContractXml path not found: ${p} (resolved: ${xmlPath})`);
    }
    const contract = parseXmlFile(xmlPath);
    return { storyPath: absPath, contract, frontmatter };
  }

  if (!fm || !fm.StoryContract) {
    throw new Error(`StoryContract frontmatter missing in ${absPath}`);
  }
  return {
    storyPath: absPath,
    contract: fm.StoryContract,
    frontmatter
  };
}

function normalizeStoryId(contract, storyPath) {
  if (contract?.story?.storyId) {
    return String(contract.story.storyId);
  }
  if (contract?.story_id) {
    return String(contract.story_id);
  }
  return path.basename(storyPath).replace(/\.md$/i, '');
}

function deriveAcceptanceCriteria(storyPath, contract, body) {
  const results = [];
  const storyId = normalizeStoryId(contract, storyPath);

  const matrixItems = contract?.acceptanceTestMatrix?.items;
  if (Array.isArray(matrixItems) && matrixItems.length) {
    matrixItems.forEach((item, index) => {
      const id = item?.id || `AC-${index + 1}`;
      results.push({
        id,
        description: item?.description || `Acceptance criteria ${index + 1}`,
        tests: Array.isArray(item?.test_files)
          ? item.test_files.map(entry => typeof entry === 'string' ? entry : entry?.path).filter(Boolean)
          : [],
        source: 'StoryContract.acceptanceTestMatrix'
      });
    });
  }

  // Acceptance Criteria section in markdown
  const bodyContent = body ?? readStoryFile(storyPath).body;
  const sectionIdx = bodyContent.indexOf('\n## Acceptance Criteria');
  if (sectionIdx !== -1) {
    const sectionBody = bodyContent.slice(sectionIdx + 1);
    const nextHeading = sectionBody.search(/\n##\s+/);
    const acSection = nextHeading !== -1 ? sectionBody.slice(0, nextHeading) : sectionBody;
    const lines = acSection.split('\n').map(line => line.trim());
    const bullets = lines.filter(line => /^(-|\d+\.|\*)\s+/.test(line));
    bullets.forEach((line, index) => {
      const cleaned = line.replace(/^(-|\d+\.|\*)\s+/, '').trim();
      const id = `AC-${index + 1}`;
      if (!results.find(item => item.id === id)) {
        results.push({
          id,
          description: cleaned || `Acceptance criteria ${index + 1}`,
          tests: [],
          source: 'markdown'
        });
      }
    });
  }

  // acceptanceCriteriaLinks fallback
  const links = Array.isArray(contract?.acceptanceCriteriaLinks) ? contract.acceptanceCriteriaLinks : [];
  if (links.length) {
    links.forEach((entry, index) => {
      const [linkId, ...rest] = String(entry).split(':');
      const id = linkId?.trim() || `AC-${index + 1}`;
      const existing = results.find(item => item.id === id);
      if (existing) {
        if (rest.length && !existing.description) {
          existing.description = rest.join(':').trim();
        }
        return;
      }
      results.push({
        id,
        description: rest.join(':').trim() || `Acceptance criteria ${index + 1}`,
        tests: [],
        source: 'StoryContract.acceptanceCriteriaLinks'
      });
    });
  }

  if (results.length === 0) {
    results.push({
      id: `${storyId}-AC-1`,
      description: 'Acceptance criteria not specified; placeholder generated',
      tests: [],
      source: 'generated'
    });
  }

  return results;
}

function deriveTestFiles(storyPath, contract, acceptanceCriteria = []) {
  const storyDir = path.dirname(storyPath);
  const projectRoot = process.cwd();

  const tests = new Set();
  const addTest = (candidate) => {
    if (!candidate) return;
    const normalized = candidate.replace(/\s+/g, '');
    if (!normalized) return;
    const abs = path.isAbsolute(candidate)
      ? candidate
      : path.join(projectRoot, candidate);
    tests.add(path.normalize(abs));
  };

  (acceptanceCriteria || []).forEach(item => {
    if (Array.isArray(item.tests)) {
      item.tests.forEach(entry => {
        if (typeof entry === 'string') {
          addTest(entry);
        } else if (entry && entry.path) {
          addTest(entry.path);
        }
      });
    }
  });

  const matrixItems = contract?.acceptanceTestMatrix?.items;
  if (Array.isArray(matrixItems)) {
    matrixItems.forEach(item => {
      const files = Array.isArray(item?.test_files) ? item.test_files : [];
      files.forEach(entry => {
        if (typeof entry === 'string') {
          addTest(entry);
        } else if (entry && entry.path) {
          addTest(entry.path);
        }
      });
    });
  }

  if (tests.size === 0) {
    const storyId = normalizeStoryId(contract, storyPath);
    const fallbackDir = path.join('tests', 'acceptance', storyId);
    const fallbackFiles = acceptanceCriteria.length
      ? acceptanceCriteria.map(item => path.join(fallbackDir, `${item.id}.test.js`))
      : [path.join(fallbackDir, 'AC-1.test.js')];
    fallbackFiles.forEach(addTest);
  }

  // Filter to existing files only
  return [...tests].filter(candidate => fs.existsSync(candidate));
}

function buildRequirementLookup(contract = {}) {
  const lookup = new Map();
  if (!contract || !Array.isArray(contract.requirements)) {
    return lookup;
  }

  contract.requirements.forEach((req = {}) => {
    const id = req.id || req.requirement_id || req.key;
    if (!id) return;

    const entry = {
      id,
      title: req.title || req.summary || null,
      description: req.description || req.details || null,
      files: Array.isArray(req.files)
        ? req.files.filter(Boolean)
        : Array.isArray(req.filePaths)
          ? req.filePaths.filter(Boolean)
          : [],
      acceptanceIds: Array.isArray(req.acceptanceIds)
        ? req.acceptanceIds.filter(Boolean)
        : Array.isArray(req.acceptanceCriteria)
          ? req.acceptanceCriteria.filter(Boolean)
          : []
    };

    lookup.set(String(id), entry);
  });

  return lookup;
}

function deriveWorkItems(contract) {
  const files = Array.isArray(contract?.filesToModify)
    ? contract.filesToModify.map(entry => ({
        path: entry?.path,
        reason: entry?.reason || null,
        type: entry?.type || 'modify'
      })).filter(item => item.path)
    : [];

  const additionalFiles = Array.isArray(contract?.filesToCreate)
    ? contract.filesToCreate.map(entry => ({
        path: entry?.path,
        reason: entry?.reason || null,
        type: 'create'
      }))
    : [];

  return [...files, ...additionalFiles];
}

function deriveAcceptanceChecklist(storyPath, contract, acceptanceCriteria = []) {
  const acceptance = acceptanceCriteria.length
    ? acceptanceCriteria
    : deriveAcceptanceCriteria(storyPath, contract);

  const requirementLookup = buildRequirementLookup(contract);
  const defaultFiles = deriveWorkItems(contract).map(item => item.path).filter(Boolean);

  return acceptance.map(item => {
    const requirementId = Array.isArray(item.requirements)?.[0]
      || requirementLookup.has(item.id) ? item.id : null;

    const matchedRequirement = requirementId ? requirementLookup.get(requirementId) : null;

    const relatedFiles = new Set();
    if (matchedRequirement && Array.isArray(matchedRequirement.files)) {
      matchedRequirement.files.forEach(f => f && relatedFiles.add(f));
    }

    if (Array.isArray(item.tests)) {
      item.tests.forEach(test => {
        if (!test) return;
        const candidate = typeof test === 'string' ? test : test.path;
        if (candidate) {
          const derivedFile = candidate
            .replace(/\.test\.[jt]s$/i, '.js')
            .replace(/\.spec\.[jt]s$/i, '.js');
          relatedFiles.add(derivedFile);
        }
      });
    }

    if (!relatedFiles.size) {
      defaultFiles.forEach(f => relatedFiles.add(f));
    }

    return {
      id: item.id,
      description: item.description,
      tests: item.tests || [],
      requirementRef: matchedRequirement ? {
        id: matchedRequirement.id,
        title: matchedRequirement.title,
        description: matchedRequirement.description
      } : null,
      relatedFiles: Array.from(relatedFiles).filter(Boolean),
      evidence: [],
      status: 'pending'
    };
  });
}

module.exports = {
  readStoryFile,
  loadStoryContract,
  deriveAcceptanceCriteria,
  deriveTestFiles,
  deriveWorkItems,
  normalizeStoryId,
  deriveAcceptanceChecklist
};
