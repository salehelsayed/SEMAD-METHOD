module.exports = {
  testEnvironment: 'node',
  // Run only essential StoryContract XML migration tests
  testMatch: ['**/tests/story-contracts/**/*.js'],
  testPathIgnorePatterns: [],
  collectCoverageFrom: [
    'semad-core/agents/**/*.js',
    'semad-core/utils/**/*.js',
    'tools/**/*.js',
    '!tools/installer/**/*.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1'
  }
};
