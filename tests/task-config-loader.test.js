const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');

const { TaskConfigLoader } = require('../tools/task-runner/config/task-config-loader');
const { ValidationError } = require('../semad-core/errors/task-errors');

function createTempProject() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-config-loader-'));
  const semadSchemasPath = path.join(tempDir, 'semad-core', 'schemas');
  fs.mkdirSync(semadSchemasPath, { recursive: true });

  const sourceSchemaDir = path.join(__dirname, '..', 'semad-core', 'schemas');
  fs.copyFileSync(
    path.join(sourceSchemaDir, 'structured-task-schema.json'),
    path.join(semadSchemasPath, 'structured-task-schema.json')
  );
  fs.copyFileSync(
    path.join(sourceSchemaDir, 'task-schema.json'),
    path.join(semadSchemasPath, 'task-schema.json')
  );

  fs.writeFileSync(
    path.join(tempDir, 'core-config.yaml'),
    yaml.dump({ structuredTasks: true })
  );

  return tempDir;
}

describe('TaskConfigLoader', () => {
  let tempDir;

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    tempDir = null;
  });

  test('loadTask validates structured task schema', async () => {
    tempDir = createTempProject();
    const loader = new TaskConfigLoader(tempDir);
    const taskPath = path.join(tempDir, 'valid-structured-task.yaml');
    const taskDefinition = {
      id: 'test-structured-task',
      name: 'Structured Task',
      description: 'A minimal structured task for loader validation',
      steps: [
        {
          id: 'step-1',
          name: 'Step One',
          actions: []
        }
      ]
    };

    fs.writeFileSync(taskPath, yaml.dump(taskDefinition));

    const result = await loader.loadTask(taskPath);
    expect(result.type).toBe('structured');
    expect(result.data.name).toBe('Structured Task');
  });

  test('loadTask throws ValidationError for malformed structured task', async () => {
    tempDir = createTempProject();
    const loader = new TaskConfigLoader(tempDir);
    const taskPath = path.join(tempDir, 'invalid-structured-task.yaml');
    const malformedTask = {
      id: 'invalid-task',
      name: 42,
      steps: 'not-an-array'
    };

    fs.writeFileSync(taskPath, yaml.dump(malformedTask));

    await expect(loader.loadTask(taskPath)).rejects.toThrow(ValidationError);
  });
});
