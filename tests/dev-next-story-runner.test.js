const fs = require('fs');
const path = require('path');
const DevNextStoryRunner = require('../tools/dev-next-story.js');

describe('DevNextStoryRunner acceptance enforcement', () => {
  const runner = new DevNextStoryRunner(process.cwd());
  const acceptanceDir = path.join(process.cwd(), '.ai', 'dev', 'acceptance');
  const evidencePath = path.join(acceptanceDir, 'TEST-STORY.json');

  afterEach(() => {
    if (fs.existsSync(evidencePath)) {
      fs.unlinkSync(evidencePath);
    }
    if (fs.existsSync(acceptanceDir) && fs.readdirSync(acceptanceDir).length === 0) {
      fs.rmdirSync(acceptanceDir, { recursive: false });
    }
  });

  it('fails verification when evidence file is missing', () => {
    const result = runner.verifyAcceptanceEvidence(evidencePath);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Acceptance evidence missing/);
  });

  it('passes verification when criteria are marked verified', () => {
    fs.mkdirSync(acceptanceDir, { recursive: true });
    const payload = {
      acceptance: [
        { id: 'AC-1', verified: true, evidence: [{ type: 'test', reference: 'passes fast', status: 'passed' }] },
        { id: 'AC-2', verified: true, evidence: [{ type: 'test', reference: 'passes slow', status: 'passed' }] }
      ]
    };
    fs.writeFileSync(evidencePath, JSON.stringify(payload, null, 2));

    const result = runner.verifyAcceptanceEvidence(evidencePath);
    expect(result.ok).toBe(true);
  });
});
