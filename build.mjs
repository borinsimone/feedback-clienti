import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

if (existsSync('.env')) process.loadEnvFile('.env');

const endpoint = new URL(process.env.FEEDBACK_ENDPOINT || '');
if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
  throw new Error('FEEDBACK_ENDPOINT deve essere un URL HTTPS pubblico.');
}

const html = await readFile('index.html', 'utf8');
const placeholder = "const feedbackEndpoint = '';";
if (!html.includes(placeholder)) throw new Error('Configurazione del modulo non trovata.');
const value = JSON.stringify(endpoint.href).replaceAll('<', '\\u003c');

await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html.replace(placeholder, () => 'const feedbackEndpoint = ' + value + ';'));
