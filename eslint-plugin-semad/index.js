/**
 * ESLint Plugin for SEMAD Method Traceability
 * Enforces FEAT/STORY annotations in code and AC tags in tests
 */

module.exports = {
  rules: {
    'traceability-annotations': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Enforce FEAT and STORY annotations in implementation files',
          category: 'Best Practices',
          recommended: true
        },
        fixable: null,
        schema: []
      },
      create(context) {
        return {
          Program(node) {
            const sourceCode = context.getSourceCode();
            const text = sourceCode.getText();
            const filename = context.getFilename();
            
            // Skip test files and config files
            if (filename.includes('.test.') || 
                filename.includes('.spec.') || 
                filename.includes('.config.') ||
                filename.includes('node_modules')) {
              return;
            }
            
            // Check for FEAT annotation
            const hasFeatAnnotation = /\/\/\s*FEAT:\s*FEAT-[A-Za-z0-9_-]+/.test(text) ||
                                     /\/\*\s*FEAT:\s*FEAT-[A-Za-z0-9_-]+/.test(text);
            
            // Check for STORY annotation
            const hasStoryAnnotation = /\/\/\s*STORY:\s*ST-[A-Za-z0-9_-]+/.test(text) ||
                                      /\/\*\s*STORY:\s*ST-[A-Za-z0-9_-]+/.test(text);
            
            // Only require annotations if file has substantial code (>50 lines)
            const lines = text.split('\n');
            const codeLines = lines.filter(line => 
              line.trim() && !line.trim().startsWith('//') && !line.trim().startsWith('/*')
            ).length;
            
            if (codeLines > 50) {
              if (!hasFeatAnnotation) {
                context.report({
                  node,
                  message: 'Missing FEAT annotation. Add: // FEAT: FEAT-<feature-id>'
                });
              }
              
              if (!hasStoryAnnotation) {
                context.report({
                  node,
                  message: 'Missing STORY annotation. Add: // STORY: ST-<story-id>'
                });
              }
            }
          }
        };
      }
    },
    
    'test-ac-tags': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Enforce AC tags in test names or descriptions',
          category: 'Best Practices',
          recommended: true
        },
        fixable: null,
        schema: []
      },
      create(context) {
        return {
          CallExpression(node) {
            const filename = context.getFilename();
            
            // Only check test files
            if (!filename.includes('.test.') && !filename.includes('.spec.')) {
              return;
            }
            
            // Check for test/it/describe calls
            if (node.callee.name === 'test' || 
                node.callee.name === 'it' || 
                node.callee.name === 'describe') {
              
              const firstArg = node.arguments[0];
              if (firstArg && firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
                const testName = firstArg.value;
                
                // Check if test name includes AC tag
                const hasAcTag = /\[AC-[A-Za-z0-9_-]+\]/.test(testName);
                
                if (!hasAcTag) {
                  context.report({
                    node: firstArg,
                    message: 'Test name should include acceptance criteria tag: [AC-XXX]'
                  });
                }
              }
            }
          }
        };
      }
    }
  }
};