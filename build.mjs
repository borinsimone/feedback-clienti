import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

if (existsSync('.env')) process.loadEnvFile('.env');

const endpoint = process.env.FEEDBACK_ENDPOINT ? new URL(process.env.FEEDBACK_ENDPOINT) : null;
if (endpoint && (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)) {
  throw new Error('FEEDBACK_ENDPOINT deve essere un URL HTTPS pubblico.');
}

const html = await readFile('index.html', 'utf8');
const placeholder = /^const feedbackEndpoint = .*;$/m;
if (!placeholder.test(html)) throw new Error('Configurazione del modulo non trovata.');
const output = endpoint
  ? html.replace(placeholder, () => 'const feedbackEndpoint = ' + JSON.stringify(endpoint.href).replaceAll('<', '\\u003c') + ';')
  : html;

await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', output);
