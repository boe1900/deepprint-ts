import { readFileSync } from 'node:fs';

const initialEnvKeys = new Set(Object.keys(process.env));

export function loadDotEnv(path = '.env', override = false) {
  try {
    const text = readFileSync(path, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match) continue;
      const key = match[1];
      if (initialEnvKeys.has(key) || (!override && process.env[key] !== undefined)) continue;
      process.env[key] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // Local convenience only; production should provide real env vars.
  }
}

export function loadLocalEnv() {
  loadDotEnv('.env');
  loadDotEnv('.env.local', true);
}
