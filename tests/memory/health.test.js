const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const health = require('../../bmad-core/utils/memory/health');

describe('Memory Health (light)', () => {
  let cwd;
  let tmp;
  beforeAll(async () => {
    cwd = process.cwd();
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mh-test-'));
    process.chdir(tmp);
  });
  afterAll(async () => {
    process.chdir(cwd);
    try { await fs.rm(tmp, { recursive: true, force: true }); } catch {}
  });

  test('performHealthCheck basic', async () => {
    const res = await health.performHealthCheck('dev', { skipQdrant: true });
    expect(['healthy', 'degraded', 'unhealthy']).toContain(res.overallStatus);
    expect(res.checks).toHaveProperty(health.CHECK_TYPES.MEMORY_DIRECTORY);
  });

  test('periodic monitoring start/stop', async () => {
    const stop = health.startPeriodicMonitoring('qa', 50);
    await new Promise(r => setTimeout(r, 120));
    const status = health.getCurrentHealthStatus('qa');
    expect(status).not.toBeNull();
    stop();
  });
});

