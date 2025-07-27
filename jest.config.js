module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'bmad-core/agents/**/*.js',
    'bmad-core/utils/**/*.js',
    'tools/**/*.js',
    '!tools/installer/**/*.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1'
  }
};