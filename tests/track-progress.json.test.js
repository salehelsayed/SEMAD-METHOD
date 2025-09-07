const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

describe('track-progress accepts JSON meta', () => {
  const script = path.join(process.cwd(), 'semad-core', 'utils', 'track-progress.js');
  const agent = `dev-test-${Date.now()}`;

  test('observation with JSON stores message and meta', () => {
    const payload = JSON.stringify({ message: 'Session start', build: '123' });
    const res = spawnSync(process.execPath, [script, 'observation', agent, payload], { encoding: 'utf8' });
    expect(res.status).toBe(0);
    const logFile = path.join(process.cwd(), '.ai', 'history', `${agent}_log.jsonl`);
    expect(fs.existsSync(logFile)).toBe(true);
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.type).toBe('observation');
    expect(last.content).toBe('Session start');
    expect(last.meta).toBeTruthy();
    expect(last.meta.build).toBe('123');
  });
});

