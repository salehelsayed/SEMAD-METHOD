const { parseXmlString } = require('../../semad-core/utils/xml-normalizer');

describe('XML Normalizer', () => {
  test('coerces required fields to strings and preserves arrays', () => {
    const xml = `<?xml version="1.0"?>
<StoryContract>
  <version>1</version>
  <schemaVersion>1</schemaVersion>
  <story_id>99-42</story_id>
  <epic_id>99</epic_id>
  <acceptanceCriteriaLinks>AC-1: foo</acceptanceCriteriaLinks>
  <acceptanceCriteriaLinks>AC-2: bar</acceptanceCriteriaLinks>
  <linkedArtifacts>
    <type>prd</type>
    <path>docs/prd/PRD.md</path>
    <version>1</version>
  </linkedArtifacts>
  <filesToModify>
    <path>src/app.js</path>
    <reason>Touch</reason>
  </filesToModify>
</StoryContract>`;

    const obj = parseXmlString(xml);
    expect(typeof obj.version).toBe('string');
    expect(typeof obj.schemaVersion).toBe('string');
    expect(typeof obj.story_id).toBe('string');
    expect(typeof obj.epic_id).toBe('string');
    expect(Array.isArray(obj.acceptanceCriteriaLinks)).toBe(true);
    expect(Array.isArray(obj.linkedArtifacts)).toBe(true);
    expect(Array.isArray(obj.filesToModify)).toBe(true);
    expect(typeof obj.linkedArtifacts[0].version).toBe('string');
    expect(typeof obj.filesToModify[0].reason).toBe('string');
  });
});

