const path = require('path');

function resolveModule(moduleName, fallbackPath) {
  const possiblePaths = [
    path.join(__dirname, '..', 'semad-core', moduleName),
    path.join(__dirname, '..', '.semad-core', moduleName),
    path.join(__dirname, '..', moduleName),
    path.join(process.cwd(), 'semad-core', moduleName),
    path.join(process.cwd(), 'bmad-core', moduleName)
  ];

  for (const modulePath of possiblePaths) {
    try {
      require.resolve(modulePath);
      return modulePath;
    } catch (e) {
      // Continue to next path
    }
  }

  try {
    return require.resolve(`semad-method/semad-core/${moduleName}`);
  } catch (e) {
    return fallbackPath;
  }
}

module.exports = {
  resolveModule
};
