import { build } from 'vite';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = path.resolve(__dirname, '..');

// Confirms the frontend actually exists and builds — the gap identified
// after the 2026-08-02 deployment check only verified the *deployed* build
// via curl, never that a local build reliably produces the right output.
describe('client build sanity', () => {
  it('produces dist/index.html with the correct <title>, confirming the frontend builds', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-build-test-'));

    await build({
      root: CLIENT_ROOT,
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    });

    const htmlPath = path.join(outDir, 'index.html');
    expect(fs.existsSync(htmlPath)).toBe(true);

    const html = fs.readFileSync(htmlPath, 'utf8');
    expect(html).toContain('<title>NoiseToSignal</title>');

    fs.rmSync(outDir, { recursive: true, force: true });
  }, 60000);
});
