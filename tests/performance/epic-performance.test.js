const fs = require('fs');
const path = require('path');
const os = require('os');
const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

const { 
  getStoriesForEpic, 
  getAllStoriesStatus 
} = require('../../bmad-core/utils/find-next-story');

describe('Epic Loop Performance Tests', () => {
  let tempDir;
  let storyDir;

  beforeEach(() => {
    // Create temporary directory for test stories
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-perf-test-'));
    storyDir = path.join(tempDir, 'stories');
    fs.mkdirSync(storyDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('getStoriesForEpic Performance', () => {
    test('should perform efficiently with large number of stories across multiple epics', () => {
      // Create many stories across multiple epics to test filtering efficiency
      const epicsCount = 10;
      const storiesPerEpic = 50;
      const targetEpic = '5'; // Epic we'll search for
      
      // Create stories for multiple epics
      for (let epicId = 1; epicId <= epicsCount; epicId++) {
        for (let storyId = 1; storyId <= storiesPerEpic; storyId++) {
          createTestStory(
            `${epicId}.${storyId}.story-${epicId}-${storyId}.md`,
            'Approved',
            `Epic ${epicId} Story ${storyId}`
          );
        }
      }

      // Total files created: 10 epics * 50 stories = 500 files
      const totalFiles = epicsCount * storiesPerEpic;
      console.log(`Created ${totalFiles} test story files`);

      // Measure getStoriesForEpic performance (optimized - should only read epic 5 files)
      const startTimeOptimized = process.hrtime.bigint();
      const optimizedResult = getStoriesForEpic(storyDir, targetEpic);
      const endTimeOptimized = process.hrtime.bigint();
      const optimizedDuration = Number(endTimeOptimized - startTimeOptimized) / 1000000; // Convert to milliseconds

      // Measure getAllStoriesStatus performance (reads all files)
      const startTimeAll = process.hrtime.bigint();
      const allStories = getAllStoriesStatus(storyDir);
      const filteredStories = allStories.filter(story => story.epicId === targetEpic);
      const endTimeAll = process.hrtime.bigint();
      const allStoriesDuration = Number(endTimeAll - startTimeAll) / 1000000; // Convert to milliseconds

      // Verify results are equivalent
      expect(optimizedResult).toHaveLength(storiesPerEpic);
      expect(filteredStories).toHaveLength(storiesPerEpic);
      expect(optimizedResult.map(s => s.fullStoryId).sort())
        .toEqual(filteredStories.map(s => s.fullStoryId).sort());

      // Performance assertions
      console.log(`Optimized getStoriesForEpic: ${optimizedDuration.toFixed(2)}ms`);
      console.log(`getAllStoriesStatus + filter: ${allStoriesDuration.toFixed(2)}ms`);
      console.log(`Performance improvement: ${(allStoriesDuration / optimizedDuration).toFixed(2)}x faster`);

      // The optimized version should be significantly faster
      // With 500 files, reading only 50 should be much faster than reading all 500
      expect(optimizedDuration).toBeLessThan(allStoriesDuration);
      
      // Reasonable performance thresholds
      expect(optimizedDuration).toBeLessThan(1000); // Should complete within 1 second
    });

    test('should scale linearly with epic size, not total story count', () => {
      const measurements = [];
      
      // Test with different epic sizes while keeping total story count high
      const epicSizes = [10, 25, 50];
      const otherEpicsCount = 20; // Many other epics to test filtering efficiency
      
      epicSizes.forEach(epicSize => {
        // Clean up from previous iteration
        if (fs.existsSync(storyDir)) {
          fs.rmSync(storyDir, { recursive: true, force: true });
          fs.mkdirSync(storyDir, { recursive: true });
        }

        // Create target epic with specified size
        for (let storyId = 1; storyId <= epicSize; storyId++) {
          createTestStory(
            `1.${storyId}.target-story-${storyId}.md`,
            'Approved',
            `Target Story ${storyId}`
          );
        }

        // Create many other epics to ensure we're testing filtering efficiency
        for (let epicId = 2; epicId <= otherEpicsCount; epicId++) {
          for (let storyId = 1; storyId <= 30; storyId++) { // 30 stories per other epic
            createTestStory(
              `${epicId}.${storyId}.other-story-${epicId}-${storyId}.md`,
              'Approved',
              `Other Epic ${epicId} Story ${storyId}`
            );
          }
        }

        const totalFiles = epicSize + (otherEpicsCount - 1) * 30;
        console.log(`Testing with epic size ${epicSize}, total files: ${totalFiles}`);

        // Measure performance
        const startTime = process.hrtime.bigint();
        const result = getStoriesForEpic(storyDir, '1');
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000;

        measurements.push({
          epicSize,
          totalFiles,
          duration,
          resultCount: result.length
        });

        expect(result).toHaveLength(epicSize);
        console.log(`Epic size ${epicSize}: ${duration.toFixed(2)}ms`);
      });

      // Verify that performance scales with epic size, not total file count
      // Duration should correlate more with epic size than total files
      const epicSizeCorrelation = calculateCorrelation(
        measurements.map(m => m.epicSize),
        measurements.map(m => m.duration)
      );
      
      const totalFilesCorrelation = calculateCorrelation(
        measurements.map(m => m.totalFiles),
        measurements.map(m => m.duration)
      );

      console.log(`Epic size correlation: ${epicSizeCorrelation.toFixed(3)}`);
      console.log(`Total files correlation: ${totalFilesCorrelation.toFixed(3)}`);

      // Performance should correlate more with epic size than total files
      expect(epicSizeCorrelation).toBeGreaterThan(Math.abs(totalFilesCorrelation));
    });

    test('should handle concurrent access efficiently', async () => {
      // Create a medium-sized epic
      for (let storyId = 1; storyId <= 20; storyId++) {
        createTestStory(
          `1.${storyId}.concurrent-story-${storyId}.md`,
          'Approved',
          `Concurrent Story ${storyId}`
        );
      }

      // Simulate concurrent access
      const concurrentRequests = 10;
      const promises = Array.from({ length: concurrentRequests }, () => {
        return new Promise((resolve) => {
          const startTime = process.hrtime.bigint();
          const result = getStoriesForEpic(storyDir, '1');
          const endTime = process.hrtime.bigint();
          const duration = Number(endTime - startTime) / 1000000;
          
          resolve({
            duration,
            resultCount: result.length
          });
        });
      });

      const results = await Promise.all(promises);
      
      // All requests should return the same number of stories
      results.forEach(result => {
        expect(result.resultCount).toBe(20);
        expect(result.duration).toBeLessThan(500); // Each request should be fast
      });

      const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
      console.log(`Average concurrent request duration: ${avgDuration.toFixed(2)}ms`);
    });
  });

  describe('Memory Usage', () => {
    test('should use memory efficiently with large epics', () => {
      // Create a large epic
      const storyCount = 100;
      for (let storyId = 1; storyId <= storyCount; storyId++) {
        createTestStory(
          `1.${storyId}.memory-story-${storyId}.md`,
          'Approved',
          `Memory Test Story ${storyId}`
        );
      }

      // Measure memory usage
      const memBefore = process.memoryUsage();
      const result = getStoriesForEpic(storyDir, '1');
      const memAfter = process.memoryUsage();

      const heapUsedDiff = memAfter.heapUsed - memBefore.heapUsed;
      const rssUsedDiff = memAfter.rss - memBefore.rss;

      console.log(`Heap memory difference: ${(heapUsedDiff / 1024 / 1024).toFixed(2)} MB`);
      console.log(`RSS memory difference: ${(rssUsedDiff / 1024 / 1024).toFixed(2)} MB`);

      expect(result).toHaveLength(storyCount);
      
      // Memory usage should be reasonable (adjust threshold based on needs)
      expect(heapUsedDiff).toBeLessThan(50 * 1024 * 1024); // Less than 50MB heap increase
    });
  });

  // Helper functions
  function createTestStory(filename, status, title) {
    const storyContent = `---
StoryContract:
  title: "${title}"
  description: "Performance test story"
---

# ${title}

## Description
This is a performance test story.

## Acceptance Criteria
- [ ] Performance criterion 1
- [ ] Performance criterion 2

## Status
${status}
`;
    fs.writeFileSync(path.join(storyDir, filename), storyContent);
  }

  function calculateCorrelation(x, y) {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumYY = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  }
});
