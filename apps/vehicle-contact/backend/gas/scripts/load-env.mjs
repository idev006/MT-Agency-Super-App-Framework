// Loads gitignored local DEV config/credentials from .env into process.env.
// Owner-authorized local storage; .env is gitignored and must never be committed.
// Existing environment variables always win; blank values are skipped.
import fs from 'node:fs';
import path from 'node:path';

function loadEnv() {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const file = path.join(dir, '.env');
    if (fs.existsSync(file)) {
      for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (v !== '' && process.env[m[1]] === undefined) process.env[m[1]] = v;
      }
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

loadEnv();