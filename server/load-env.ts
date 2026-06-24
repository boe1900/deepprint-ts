import { readFileSync } from 'node:fs';

export function loadDotEnv(path = '.env', override = false) {
  try {
    const text = readFileSync(path, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match || (!override && process.env[match[1]] !== undefined)) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // Local convenience only; production should provide real env vars.
  }
}

export function loadLocalEnv() {
  loadDotEnv('.env');
  loadDotEnv('.env.local', true);
}
