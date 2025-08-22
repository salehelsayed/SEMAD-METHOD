/**
 * Dependency-Cruiser configuration for SEMAD-METHOD
 * - Flags circular dependencies and orphaned modules
 * - Limits cross-boundary imports between top-level folders
 */
module.exports = {
  options: {
    doNotFollow: {
      path: 'node_modules|dist',
    },
    exclude: {
      path: '(^|/)tests?/|(^|/)\.ai/|(^|/)dist/',
    },
    includeOnly: {
      path: '^(tools|scripts|bmad-core|docs|common)/',
    },
    tsPreCompilationDeps: false,
    combinedDependencies: true,
    reporterOptions: {
      dot: {
        theme: {
          graph: { splines: 'polyline', rankdir: 'LR' },
        },
      },
    },
  },
  forbidden: [
    // No circular dependencies
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    // Don’t import from dist
    { name: 'no-import-from-dist', severity: 'error', from: {}, to: { path: '^dist/' } },
    // Flag orphaned files
    { name: 'no-orphans', severity: 'warn', from: { orphan: true }, to: {} },
    // Limit cross-folder imports to stable boundaries
    {
      name: 'isolate-docs',
      severity: 'warn',
      from: { path: '^docs/' },
      to: { pathNot: '^docs/' },
    },
  ],
};

