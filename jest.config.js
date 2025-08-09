module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  injectGlobals: false,
  collectCoverageFrom: [
    'bmad-core/agents/**/*.js',
    'bmad-core/utils/**/*.js',
    'tools/**/*.js',
    '!tools/installer/**/*.js'
  ],
  modulePathIgnorePatterns: ['<rootDir>/tools/installer'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1'
  }
};
