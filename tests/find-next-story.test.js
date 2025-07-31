const fs = require('fs');
const path = require('path');
const { findNextApprovedStory, getAllStoriesStatus } = require('../bmad-core/utils/find-next-story');

describe('Find Next Story Utility', () => {
  const testStoriesDir = path.join(__dirname, 'test-stories');

  beforeEach(() => {
    // Create test stories directory
    if (!fs.existsSync(testStoriesDir)) {
      fs.mkdirSync(testStoriesDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test stories directory
    if (fs.existsSync(testStoriesDir)) {
      fs.rmSync(testStoriesDir, { recursive: true, force: true });
    }
  });

  describe('findNextApprovedStory', () => {
    it('should return error when stories directory does not exist', () => {
      const nonExistentDir = path.join(__dirname, 'non-existent-dir');
      const result = findNextApprovedStory(nonExistentDir);
      
      expect(result.found).toBe(false);
      expect(result.error).toContain('Stories directory not found');
    });

    it('should return error when no story files exist', () => {
      const result = findNextApprovedStory(testStoriesDir);
      
      expect(result.found).toBe(false);
      expect(result.error).toBe('No story files found in the stories directory');
    });

    it('should find the most recent approved story', () => {
      // Create test stories with different statuses
      const draftStory = `---
StoryContract:
  version: "1.0"
  story_id: "1.1"
  epic_id: "1"
  apiEndpoints: []
  filesToModify: []
  acceptanceCriteriaLinks: []
---

# Epic 1 - Story 1: Draft Story

## Status
Draft

## Story
As a user, I want a draft feature`;

      const approvedStory1 = `---
StoryContract:
  version: "1.0"
  story_id: "2.1"
  epic_id: "2"
  apiEndpoints: []
  filesToModify: []
  acceptanceCriteriaLinks: ["AC-2.1.1"]
---

# Epic 2 - Story 1: First Approved Story

## Status
Approved

## Story
As a user, I want an approved feature`;

      const approvedStory2 = `---
StoryContract:
  version: "1.0"
  story_id: "2.2"
  epic_id: "2"
  apiEndpoints: []
  filesToModify: []
  acceptanceCriteriaLinks: ["AC-2.2.1"]
---

# Epic 2 - Story 2: Second Approved Story

## Status
Approved

## Story
As a user, I want another approved feature`;

      const inProgressStory = `---
StoryContract:
  version: "1.0"
  story_id: "3.1"
  epic_id: "3"
  apiEndpoints: []
  filesToModify: []
  acceptanceCriteriaLinks: []
---

# Epic 3 - Story 1: In Progress Story

## Status
InProgress

## Story
As a user, I want a feature in progress`;

      // Write stories with different timestamps
      fs.writeFileSync(path.join(testStoriesDir, '1.1.draft-story.md'), draftStory);
      
      // Write first approved story
      fs.writeFileSync(path.join(testStoriesDir, '2.1.first-approved.md'), approvedStory1);
      
      // Ensure different modification time by setting it explicitly
      // Set first story to past time
      const pastTime = new Date(Date.now() - 1000);
      fs.utimesSync(path.join(testStoriesDir, '2.1.first-approved.md'), pastTime, pastTime);
      
      // Write second approved story (should be most recent)
      fs.writeFileSync(path.join(testStoriesDir, '2.2.second-approved.md'), approvedStory2);
      
      // Write in-progress story
      fs.writeFileSync(path.join(testStoriesDir, '3.1.in-progress.md'), inProgressStory);

      const result = findNextApprovedStory(testStoriesDir);
      
      expect(result.found).toBe(true);
      expect(result.filename).toBe('2.2.second-approved.md');
      expect(result.title).toBe('Epic 2 - Story 2: Second Approved Story');
      expect(result.storyContract).toBeDefined();
      expect(result.storyContract.story_id).toBe('2.2');
    });

    it('should return error when no approved stories exist', () => {
      // Create only non-approved stories
      const draftStory = `# Epic 1 - Story 1

## Status
Draft

## Story
Draft story content`;

      const doneStory = `# Epic 2 - Story 1

## Status
Done

## Story
Completed story content`;

      fs.writeFileSync(path.join(testStoriesDir, '1.1.draft.md'), draftStory);
      fs.writeFileSync(path.join(testStoriesDir, '2.1.done.md'), doneStory);

      const result = findNextApprovedStory(testStoriesDir);
      
      expect(result.found).toBe(false);
      expect(result.error).toContain('No approved stories found');
    });

    it('should handle stories without StoryContract gracefully', () => {
      const storyWithoutContract = `# Epic 4 - Story 1: No Contract Story

## Status
Approved

## Story
As a user, I want a feature without a contract`;

      fs.writeFileSync(path.join(testStoriesDir, '4.1.no-contract.md'), storyWithoutContract);

      const result = findNextApprovedStory(testStoriesDir);
      
      expect(result.found).toBe(true);
      expect(result.storyContract).toBeNull();
      expect(result.filename).toBe('4.1.no-contract.md');
    });
  });

  describe('getAllStoriesStatus', () => {
    it('should return empty array when directory does not exist', () => {
      const nonExistentDir = path.join(__dirname, 'non-existent-dir');
      const result = getAllStoriesStatus(nonExistentDir);
      
      expect(result).toEqual([]);
    });

    it('should return all stories with their statuses', () => {
      // Create stories with various statuses
      const stories = [
        { file: '1.1.story.md', status: 'Draft' },
        { file: '1.2.story.md', status: 'Approved' },
        { file: '2.1.story.md', status: 'InProgress' },
        { file: '2.2.story.md', status: 'Review' },
        { file: '3.1.story.md', status: 'Done' }
      ];

      stories.forEach(({ file, status }) => {
        const content = `# Story ${file}

## Status
${status}

## Story
Story content`;
        fs.writeFileSync(path.join(testStoriesDir, file), content);
      });

      const result = getAllStoriesStatus(testStoriesDir);
      
      expect(result).toHaveLength(5);
      expect(result[0].file).toBe('1.1.story.md');
      expect(result[0].status).toBe('Draft');
      expect(result[1].file).toBe('1.2.story.md');
      expect(result[1].status).toBe('Approved');
      expect(result[4].file).toBe('3.1.story.md');
      expect(result[4].status).toBe('Done');
    });

    it('should handle malformed story files', () => {
      // Create a story without status section
      const malformedStory = `# Malformed Story

Some content without status section`;

      fs.writeFileSync(path.join(testStoriesDir, '1.1.malformed.md'), malformedStory);

      const result = getAllStoriesStatus(testStoriesDir);
      
      expect(result).toHaveLength(1);
      expect(result[0].file).toBe('1.1.malformed.md');
      expect(result[0].status).toBe('Unknown');
    });
  });
});