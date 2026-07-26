#!/usr/bin/env node

/**
 * Fast pre-deploy security gate for BEATSS.
 * It checks configuration and source invariants only; it never contacts
 * Firebase, Vercel, or a payment provider.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];
const warnings = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const signingKey = process.env.DOWNLOAD_SIGNING_KEY || '';
if (process.env.NODE_ENV === 'production') {
  assert(signingKey.length >= 32, 'DOWNLOAD_SIGNING_KEY debe tener al menos 32 caracteres en producción.');
} else if (!signingKey) {
  warnings.push('DOWNLOAD_SIGNING_KEY no está en este entorno (esperado en una revisión local).');
}

const serverlessFiles = [
  'api/get-order-downloads.js',
  'api/log-download.js',
  'api/proxy-audio.js',
  'api/confirm-purchase.js',
  'api/redeem-vip.js',
  'api/activate-pro.js',
  'api/convert-referral.js',
  'api/gdrive.js',
];
for (const file of serverlessFiles) {
  const source = read(file);
  assert(!source.includes("Access-Control-Allow-Origin', '*'"), `${file} contiene CORS abierto (*).`);
  assert(!source.includes('Access-Control-Allow-Origin", "*"'), `${file} contiene CORS abierto (*).`);
  assert(!source.includes('default_fallback_secret') && !source.includes('dev-signing-key'), `${file} contiene una clave de firma insegura.`);
}

const vercel = JSON.parse(read('vercel.json'));
const headers = JSON.stringify(vercel.headers || []);
assert(headers.includes('X-Content-Type-Options'), 'vercel.json debe publicar X-Content-Type-Options.');
assert(headers.includes('Strict-Transport-Security'), 'vercel.json debe publicar HSTS.');
assert(headers.includes('Cross-Origin-Resource-Policy'), 'vercel.json debe publicar CORP.');

const firestore = read('firestore.rules');
assert(firestore.includes('allow delete: if false;'), 'Firestore debe mantener borrado bloqueado por defecto en pagos.');
if (firestore.includes('request.auth == null')) {
  warnings.push('Firestore mantiene un listener anónimo de pagos; separar estado público y PII antes de retirar esa excepción.');
}

if (failures.length) {
  console.error('SECURITY CHECK FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('SECURITY CHECK PASSED');
}
for (const warning of warnings) console.warn(`WARNING: ${warning}`);
