const fs = require('fs').promises;
const path = require('path');

class SecurityScanner {
  constructor() {
    this.vulnerabilityPatterns = [
      /eval\(/g,
      /innerHTML\s*=/g,
      /document\.write\(/g,
      /\$\{.*\}/g,  // Template injection
      /require\(['"]child_process['"]/g,
      /\.exec\(/g,
      /password\s*=\s*['"][^'"]*['"]/gi,
      /api[_-]?key\s*=\s*['"][^'"]*['"]/gi
    ];
  }
  
  async scanForVulnerabilities(projectDir = process.cwd()) {
    console.log('[SECURITY] Scanning for security vulnerabilities...');
    
    const results = {
      vulnerabilities: [],
      warnings: [],
      scannedFiles: 0
    };
    
    const files = await this.getCodeFiles(projectDir);
    
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const fileVulns = this.scanFileContent(content, file);
      results.vulnerabilities.push(...fileVulns);
      results.scannedFiles++;
    }
    
    // Check for exposed secrets
    const secretsCheck = await this.checkForSecrets(projectDir);
    results.vulnerabilities.push(...secretsCheck);
    
    console.log(`[SECURITY] Found ${results.vulnerabilities.length} vulnerabilities in ${results.scannedFiles} files`);
    return results;
  }
  
  scanFileContent(content, filePath) {
    const vulnerabilities = [];
    
    this.vulnerabilityPatterns.forEach((pattern, index) => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          vulnerabilities.push({
            file: filePath,
            type: this.getVulnerabilityType(index),
            pattern: match,
            severity: this.getSeverity(index),
            line: this.getLineNumber(content, match)
          });
        });
      }
    });
    
    return vulnerabilities;
  }
  
  async checkForSecrets(projectDir) {
    const secrets = [];
    const envFiles = ['.env', '.env.local', '.env.production'];
    
    for (const envFile of envFiles) {
      try {
        const envPath = path.join(projectDir, envFile);
        const content = await fs.readFile(envPath, 'utf-8');
        
        // Check if .env files are in .gitignore
        const gitignore = await this.checkGitignore(projectDir);
        if (!gitignore.includes(envFile)) {
          secrets.push({
            file: envFile,
            type: 'exposed-secrets',
            severity: 'high',
            message: `${envFile} not in .gitignore - secrets may be exposed`
          });
        }
      } catch (error) {
        // File doesn't exist, which is fine
      }
    }
    
    return secrets;
  }
  
  async checkGitignore(projectDir) {
    try {
      const gitignorePath = path.join(projectDir, '.gitignore');
      return await fs.readFile(gitignorePath, 'utf-8');
    } catch (error) {
      return '';
    }
  }
  
  getVulnerabilityType(index) {
    const types = [
      'code-injection',
      'xss-vulnerability',
      'xss-vulnerability',
      'template-injection',
      'command-injection',
      'command-injection',
      'hardcoded-password',
      'hardcoded-api-key'
    ];
    return types[index] || 'unknown';
  }
  
  getSeverity(index) {
    const severities = [
      'critical',
      'high',
      'high',
      'high',
      'critical',
      'critical',
      'high',
      'high'
    ];
    return severities[index] || 'medium';
  }
  
  getLineNumber(content, match) {
    const index = content.indexOf(match);
    return content.substring(0, index).split('\n').length;
  }
  
  async getCodeFiles(dir) {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        files.push(...await this.getCodeFiles(path.join(dir, entry.name)));
      } else if (entry.isFile() && this.isCodeFile(entry.name)) {
        files.push(path.join(dir, entry.name));
      }
    }
    
    return files;
  }
  
  isCodeFile(filename) {
    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.vue', '.py', '.php', '.rb'];
    return codeExtensions.some(ext => filename.endsWith(ext));
  }
}

module.exports = { SecurityScanner };

if (require.main === module) {
  const scanner = new SecurityScanner();
  scanner.scanForVulnerabilities().then(results => {
    if (results.vulnerabilities.length > 0) {
      console.error('Security vulnerabilities found:');
      results.vulnerabilities.forEach(vuln => {
        console.error(`  ${vuln.severity.toUpperCase()}: ${vuln.type} in ${vuln.file}:${vuln.line}`);
      });
      process.exit(1);
    } else {
      console.log('No security vulnerabilities found.');
      process.exit(0);
    }
  });
}