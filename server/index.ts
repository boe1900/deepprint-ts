import { serve } from '@hono/node-server';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { Hono } from 'hono';
import { app as apiApp, type Bindings, type Variables } from '../functions/api/[[route]]';
import { createPostgresDatabase } from './postgres-db';
import { loadLocalEnv } from './load-env';

loadLocalEnv();

const port = Number(process.env.PORT || 3000);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const env: Bindings = {
  ...process.env,
  deepprint_auth: createPostgresDatabase(databaseUrl),
} as Bindings;

const staticRoot = join(process.cwd(), 'dist');
const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

const web = new Hono<{ Bindings: Bindings; Variables: Variables }>();

web.use('*', async (c, next) => {
  c.env = env;
  await next();
});

web.route('/', apiApp);

web.get('*', async (c) => {
  const pathname = new URL(c.req.url).pathname;
  const safePath = pathname.includes('..') ? '/' : pathname;
  const filePath = join(staticRoot, safePath === '/' ? 'index.html' : safePath);

  try {
    const bytes = await readFile(filePath);
    return new Response(bytes, {
      headers: {
        'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream',
      },
    });
  } catch {
    const bytes = await readFile(join(staticRoot, 'index.html'));
    return new Response(bytes, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
});

serve({
  fetch: web.fetch,
  port,
}, () => {
  console.log(`DeepPrint listening on http://localhost:${port}`);
});
