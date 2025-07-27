const path = require('path');

/**
 * Helper function for resolving BMad module paths in tests
 * @param {string} moduleName - Module name relative to bmad-core (e.g., 'utils/story-contract-validator')
 * @param {string} baseDir - Base directory to search from (defaults to __dirname)
 * @returns {string} Resolved module path
 */
function resolveBmadModule(moduleName, baseDir = __dirname) {
  const possiblePaths = [
    // Standard locations relative to test directory
    path.join(baseDir, '..', '..', 'bmad-core', moduleName),
    path.join(baseDir, '..', '..', '.bmad-core', moduleName),
    path.join(baseDir, '..', '..', moduleName),
    // Try one level up
    path.join(baseDir, '..', 'bmad-core', moduleName),
    path.join(baseDir, '..', '.bmad-core', moduleName),
    path.join(baseDir, '..', moduleName)
  ];
  
  for (const candidatePath of possiblePaths) {
    try {
      require.resolve(candidatePath);
      return candidatePath;
    } catch (e) {
      // Continue to next path
    }
  }
  
  // Try as npm package
  try {
    return require.resolve(`bmad-method/bmad-core/${moduleName}`);
  } catch (e) {
    // Return the most common fallback
    return path.join(baseDir, '..', '..', 'bmad-core', moduleName);
  }
}

module.exports = { resolveBmadModule };