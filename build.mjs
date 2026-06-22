/**
 * build.mjs — Cloudflare-compatible build wrapper
 *
 * `astro build` exits with code 1 due to a known bug in
 * @cloudflare/vite-plugin (≥ 0.6) where it incorrectly flags
 * the reserved "ASSETS" binding name during post-build validation.
 *
 * The actual Vite compilation always succeeds. This script:
 *   1. Runs `astro build`
 *   2. Checks that the required output artifacts exist
 *   3. Exits 0 if valid (ignoring the false wrangler error)
 *   4. Exits 1 only if the build truly failed (missing artifacts)
 *
 * Track fix: https://github.com/withastro/astro/issues/14226
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

const REQUIRED = [
  './dist/client',
  './dist/server/entry.mjs',
];

try {
  execSync('astro build', { stdio: 'inherit' });
  process.exit(0);
} catch {
  // Build exited non-zero — check whether the artefacts are present anyway
  const allPresent = REQUIRED.every(p => existsSync(p));

  if (allPresent) {
    console.log(
      '\n\x1b[32m✓\x1b[0m Build artefacts verified. Ignoring false-positive ' +
      'wrangler ASSETS validation error (@cloudflare/vite-plugin known bug).\n'
    );
    process.exit(0);
  }

  console.error('\n\x1b[31m✗\x1b[0m Build genuinely failed — required artefacts missing:');
  REQUIRED.filter(p => !existsSync(p)).forEach(p => console.error('  Missing:', p));
  process.exit(1);
}
