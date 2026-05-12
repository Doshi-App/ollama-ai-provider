/**
 * Build / packaging integration test.
 *
 * Builds the package, then verifies:
 *   - every path referenced by package.json `exports` actually exists
 *   - the package can be consumed via both ESM and CJS by an outside project
 *   - `.d.ts` typings ship (so TS consumers don't get implicit any)
 *
 * Slow-ish (runs tsup + spawns node twice) — kept here so CI catches packaging
 * regressions on every PR.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PKG_DIR = join(__dirname, '..');

function pkgJson(): any {
  return JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8'));
}

beforeAll(() => {
  execSync('pnpm build', { cwd: PKG_DIR, stdio: 'pipe' });
}, 30_000);

describe('package.json exports', () => {
  it('every path referenced by exports actually exists in dist/', () => {
    const pkg = pkgJson();
    const exp = pkg.exports['.'];
    for (const [key, relPath] of Object.entries(exp)) {
      const abs = join(PKG_DIR, relPath as string);
      expect(existsSync(abs), `${key} → ${relPath} should exist`).toBe(true);
    }
  });

  it('main, module, types fields all point to real files', () => {
    const pkg = pkgJson();
    for (const field of ['main', 'module', 'types'] as const) {
      const rel = pkg[field];
      expect(rel, `package.json.${field} should be set`).toBeTruthy();
      expect(existsSync(join(PKG_DIR, rel)), `${field} → ${rel}`).toBe(true);
    }
  });

  it('ships .d.ts typings for consumers', () => {
    expect(existsSync(join(PKG_DIR, 'dist/index.d.ts'))).toBe(true);
  });
});

describe('end-to-end consumer install', () => {
  let tmpDir: string;

  beforeAll(() => {
    execSync('pnpm pack', { cwd: PKG_DIR, stdio: 'pipe' });
    tmpDir = mkdtempSync(join(tmpdir(), 'doshi-ollama-pkg-'));
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'consumer', version: '1.0.0', private: true }),
    );
    execSync(
      `npm install ${join(PKG_DIR, 'doshi-ollama-0.0.0.tgz')} --no-audit --no-fund --silent`,
      { cwd: tmpDir, stdio: 'pipe' },
    );
  }, 60_000);

  it('an ESM consumer can import { createOllama, ollama, jsonSchemaToInstruction }', () => {
    writeFileSync(
      join(tmpDir, 'use.mjs'),
      `import * as m from '@doshi/ollama';
       const keys = Object.keys(m).sort().join(',');
       if (!keys.includes('createOllama')) throw new Error('missing createOllama, got: ' + keys);
       if (!keys.includes('jsonSchemaToInstruction')) throw new Error('missing jsonSchemaToInstruction, got: ' + keys);
       if (!keys.includes('ollama')) throw new Error('missing ollama singleton, got: ' + keys);
       console.log('OK');`,
    );
    const out = execSync('node use.mjs', { cwd: tmpDir }).toString();
    expect(out.trim()).toBe('OK');
  });

  it('a CJS consumer can require the package', () => {
    writeFileSync(
      join(tmpDir, 'use.cjs'),
      `const m = require('@doshi/ollama');
       if (typeof m.createOllama !== 'function') throw new Error('createOllama missing');
       if (typeof m.jsonSchemaToInstruction !== 'function') throw new Error('jsonSchemaToInstruction missing');
       console.log('OK');`,
    );
    const out = execSync('node use.cjs', { cwd: tmpDir }).toString();
    expect(out.trim()).toBe('OK');
  });
});
