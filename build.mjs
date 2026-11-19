import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

if (existsSync('.env')) process.loadEnvFile('.env');

const keys = ['EMAILJS_SERVICE_ID', 'EMAILJS_TEMPLATE_ID', 'EMAILJS_PUBLIC_KEY'];
const missing = keys.filter(key => !process.env[key]?.trim());
if (missing.length) throw new Error('Configurazione mancante: ' + missing.join(', '));

const [serviceId, templateId, publicKey] = keys.map(key => process.env[key].trim());
const html = await readFile('index.html', 'utf8');
const placeholder = 'const emailConfig = {};';
if (!html.includes(placeholder)) throw new Error('Configurazione EmailJS non trovata nella pagina.');
const config = JSON.stringify({ serviceId, templateId, publicKey }).replaceAll('<', '\\u003c');

await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html.replace(placeholder, () => 'const emailConfig = ' + config + ';'));
