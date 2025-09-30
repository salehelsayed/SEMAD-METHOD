const path = require('path');
const {
  loadStoryContract,
  deriveAcceptanceCriteria,
  deriveTestFiles,
  deriveWorkItems
} = require('../semad-core/utils/story-contract');

describe('story-contract utils', () => {
  const storyPath = path.join(__dirname, 'fixtures', 'story-contract-sample.md');
  const { contract } = loadStoryContract(storyPath);

  it('derives acceptance criteria from matrix and markdown bullets', () => {
    const criteria = deriveAcceptanceCriteria(storyPath, contract);
    const ids = criteria.map(item => item.id);

    expect(ids).toContain('AC-MATRIX');
    expect(criteria.find(item => item.description.includes('Documentation updated'))).toBeTruthy();
  });

  it('resolves scoped test files from the acceptance matrix', () => {
    const files = deriveTestFiles(storyPath, contract);
    const expected = path.join(process.cwd(), 'tests', 'fixtures', 'sample-acceptance.test.js');
    expect(files).toContain(expected);
  });

  it('extracts work items from filesToModify entries', () => {
    const workItems = deriveWorkItems(contract);
    expect(workItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'src/example.js', type: 'modify' }),
        expect.objectContaining({ path: 'docs/example.md', type: 'modify' })
      ])
    );
  });
});
