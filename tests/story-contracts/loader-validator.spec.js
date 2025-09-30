const fs = require('fs');
const path = require('path');

const { loadStoryContract } = require('../../semad-core/utils/story-contract');
const StoryContractValidator = require('../../bmad-core/utils/story-contract-validator');

describe('StoryContract loader and validator', () => {
  const tmpDir = path.join(__dirname, '..', 'tmp');
  const storiesDir = path.join(tmpDir, 'docs', 'stories');
  const contractsDir = path.join(storiesDir, 'contracts');

  beforeAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(contractsDir, { recursive: true });
  });

  test('loads via StoryContractXml pointer (wins over YAML)', () => {
    const storyId = '99-77';
    const xmlPath = path.join(contractsDir, `story-${storyId}.xml`);
    const xml = `<?xml version="1.0"?>\n<StoryContract>\n  <version>1</version>\n  <schemaVersion>1</schemaVersion>\n  <story_id>${storyId}</story_id>\n  <epic_id>99</epic_id>\n</StoryContract>`;
    fs.writeFileSync(xmlPath, xml, 'utf8');

    const md = [
      '---',
      `StoryContractXml: ${path.relative(process.cwd(), xmlPath).replace(/\\\\/g, '/')}`,
      'StoryContract:',
      '  version: "0.0"',
      `  story_id: "${storyId}-DIFF"`,
      '  epic_id: "0"',
      '  schemaVersion: "1"',
      '---',
      '',
      `# Story ${storyId}: Test`
    ].join('\n');
    const storyFile = path.join(storiesDir, `story-${storyId}.md`);
    fs.writeFileSync(storyFile, md, 'utf8');

    const { contract } = loadStoryContract(storyFile);
    expect(contract.story_id).toBe(storyId); // pointer wins

    const validator = new StoryContractValidator();
    const result = validator.validateStoryFile(storyFile);
    expect(result.valid).toBe(true);
  });
});
