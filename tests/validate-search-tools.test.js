const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { execSync } = require('child_process');

describe('Validate Search Tools', () => {
  const testDir = path.join(__dirname, 'test-outputs');
  const scriptPath = path.join(__dirname, '..', 'scripts', 'validate-search-tools.js');
  const testFilePath = path.join(testDir, 'test-search-tools.yaml');

  beforeEach(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  test('should validate correct search tools file with metadata', () => {
    const validData = {
      version: '1.0',
      generated: new Date().toISOString(),
      searchTools: [
        {
          name: 'github',
          query: 'authentication middleware',
          description: 'Search for authentication on github'
        },
        {
          name: 'npmjs',
          query: 'passport',
          repository: 'passportjs/passport',
          description: 'Search for passport on npmjs'
        }
      ]
    };

    fs.writeFileSync(testFilePath, yaml.dump(validData));

    // Should not throw
    expect(() => {
      execSync(`node ${scriptPath} --file ${testFilePath}`, { encoding: 'utf8' });
    }).not.toThrow();
  });

  test('should validate correct search tools file without metadata', () => {
    const validData = [
      {
        name: 'github',
        query: 'authentication middleware',
        description: 'Search for authentication on github'
      },
      {
        name: 'npmjs',
        query: 'passport',
        description: 'Search for passport on npmjs'
      }
    ];

    fs.writeFileSync(testFilePath, yaml.dump(validData));

    // Should not throw
    expect(() => {
      execSync(`node ${scriptPath} --file ${testFilePath}`, { encoding: 'utf8' });
    }).not.toThrow();
  });

  test('should fail validation for missing required fields', () => {
    const invalidData = {
      version: '1.0',
      generated: new Date().toISOString(),
      searchTools: [
        {
          name: 'github',
          // Missing query
          description: 'Search for authentication on github'
        },
        {
          // Missing name
          query: 'passport',
          description: 'Search for passport on npmjs'
        }
      ]
    };

    fs.writeFileSync(testFilePath, yaml.dump(invalidData));

    // Should throw
    expect(() => {
      execSync(`node ${scriptPath} --file ${testFilePath}`, { encoding: 'utf8' });
    }).toThrow();
  });

  test('should fail validation for invalid YAML', () => {
    fs.writeFileSync(testFilePath, 'invalid: yaml: content: [');

    // Should throw
    expect(() => {
      execSync(`node ${scriptPath} --file ${testFilePath}`, { encoding: 'utf8' });
    }).toThrow();
  });

  test('should fail validation for non-existent file', () => {
    // Should throw
    expect(() => {
      execSync(`node ${scriptPath} --file /non/existent/file.yaml`, { encoding: 'utf8' });
    }).toThrow();
  });

  test('should fail validation for wrong field types', () => {
    const invalidData = {
      version: '1.0',
      generated: new Date().toISOString(),
      searchTools: [
        {
          name: 123, // Should be string
          query: 'test query',
          description: 'test description'
        }
      ]
    };

    fs.writeFileSync(testFilePath, yaml.dump(invalidData));

    // Should throw
    expect(() => {
      execSync(`node ${scriptPath} --file ${testFilePath}`, { encoding: 'utf8' });
    }).toThrow();
  });

  test('should fail validation for non-array searchTools', () => {
    const invalidData = {
      version: '1.0',
      generated: new Date().toISOString(),
      searchTools: 'not an array'
    };

    fs.writeFileSync(testFilePath, yaml.dump(invalidData));

    // Should throw
    expect(() => {
      execSync(`node ${scriptPath} --file ${testFilePath}`, { encoding: 'utf8' });
    }).toThrow();
  });
});