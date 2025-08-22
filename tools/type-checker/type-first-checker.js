const fs = require('fs').promises;
const path = require('path');

class TypeFirstChecker {
  async checkTypeDefinitions(projectDir = process.cwd()) {
    console.log('[TYPE-CHECK] Enforcing type-first development...');
    
    const results = {
      schemasFirst: false,
      typesFirst: false,
      interfacesFirst: false,
      errors: []
    };
    
    // Check if schemas exist before implementation
    const schemasDir = path.join(projectDir, 'bmad-core', 'schemas');
    try {
      const schemas = await fs.readdir(schemasDir);
      results.schemasFirst = schemas.length > 0;
    } catch (error) {
      results.errors.push('No schemas directory found');
    }
    
    // Check TypeScript definitions
    try {
      const srcDir = path.join(projectDir, 'src');
      const typeFiles = await this.findTypeFiles(srcDir);
      results.typesFirst = typeFiles.length > 0;
    } catch (error) {
      results.errors.push('No TypeScript types found');
    }
    
    console.log(`[TYPE-CHECK] Type-first compliance: ${results.schemasFirst && results.typesFirst}`);
    return results;
  }
  
  async findTypeFiles(dir) {
    const files = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          files.push(...await this.findTypeFiles(path.join(dir, entry.name)));
        } else if (entry.name.endsWith('.d.ts') || entry.name.includes('types')) {
          files.push(path.join(dir, entry.name));
        }
      }
    } catch (error) {
      // Directory doesn't exist
    }
    return files;
  }
}

module.exports = { TypeFirstChecker };

if (require.main === module) {
  const checker = new TypeFirstChecker();
  checker.checkTypeDefinitions().then(results => {
    process.exit(results.schemasFirst && results.typesFirst ? 0 : 1);
  });
}