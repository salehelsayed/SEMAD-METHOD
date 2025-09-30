const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Resolve a story identifier or path into an absolute file system path.
 * Supports:
 *   - Absolute paths
 *   - Relative paths from the project root
 *   - Story identifiers matching StoryContract.story_id
 *
 * @param {string|undefined|null} storyArg Raw story argument (e.g., path, ID, or @path)
 * @param {string} projectRoot Repository root directory
 * @returns {string|null} Absolute path to story markdown file or null if not found
 */
function resolveStoryPath(storyArg, projectRoot) {
  if (!storyArg || typeof storyArg !== 'string') {
    return null;
  }

  const trimmed = storyArg.startsWith('@') ? storyArg.slice(1) : storyArg;
  const absoluteCandidate = path.isAbsolute(trimmed)
    ? trimmed
    : path.join(projectRoot, trimmed);

  if (fs.existsSync(absoluteCandidate) && fs.statSync(absoluteCandidate).isFile()) {
    return absoluteCandidate;
  }

  // Fall back to story lookup by ID inside docs/stories
  return findStoryById(trimmed, projectRoot);
}

/**
 * Locate a story markdown file by searching for StoryContract.story_id.
 *
 * @param {string} storyId Story identifier (e.g., "99-1")
 * @param {string} projectRoot Repository root directory
 * @returns {string|null} Absolute path if a match is found, otherwise null
 */
function findStoryById(storyId, projectRoot) {
  if (!storyId) return null;

  const storiesDir = path.join(projectRoot, 'docs', 'stories');
  if (!fs.existsSync(storiesDir)) {
    return null;
  }

  const stack = [storiesDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        continue;
      }

      const content = fs.readFileSync(fullPath, 'utf8');
      const match = content.match(/story_id:\s*"?([\w-]+)"?/i);
      if (match && match[1] === storyId) {
        return fullPath;
      }
    }
  }

  return null;
}

/**
 * Parse the YAML front matter (StoryContract) from a story markdown file.
 * Returns null if no front matter is present or parsing fails.
 *
 * @param {string} storyContent Raw markdown content
 * @returns {object|null} Parsed front matter object
 */
function parseStoryFrontMatter(storyContent) {
  if (!storyContent || typeof storyContent !== 'string') {
    return null;
  }

  const frontmatterMatch = storyContent.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return null;
  }

  try {
    return yaml.load(frontmatterMatch[1]) || null;
  } catch (error) {
    console.warn('Failed to parse story front matter:', error.message);
    return null;
  }
}

/**
 * Overwrite or insert a simple markdown section in a story file.
 * Only supports flat sections of the form:
 *   ## Section Title
 *   ...content...
 *
 * @param {string} storyContent Input markdown content
 * @param {string} sectionTitle Section heading without hashes (e.g., "Status")
 * @param {string} newBody New body content (no trailing newline added)
 * @returns {string} Updated markdown content
 */
function upsertStorySection(storyContent, sectionTitle, newBody) {
  const headingRegex = new RegExp(`(^|\n)(##\s+${escapeRegExp(sectionTitle)}\s*\n)([\s\S]*?)(?=\n##\s|\n#\s|$)`, 'i');
  const normalizedBody = newBody.endsWith('\n') ? newBody : `${newBody}\n`;

  if (headingRegex.test(storyContent)) {
    return storyContent.replace(headingRegex, (full, prefix, heading) => {
      return `${prefix}${heading}${normalizedBody}`;
    });
  }

  const insertion = `\n## ${sectionTitle}\n${normalizedBody}`;
  if (/^#\s+/m.test(storyContent)) {
    return `${storyContent.trimEnd()}${insertion}\n`;
  }
  return `## ${sectionTitle}\n${normalizedBody}\n${storyContent}`;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  resolveStoryPath,
  findStoryById,
  parseStoryFrontMatter,
  upsertStorySection
};
