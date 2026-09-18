import test from 'node:test';
import assert from 'node:assert/strict';
import { isTrustedBeatssOrigin } from '../api/_cors-origin.js';

test('CORS solo acepta dominios BEATSS, previews del proyecto y desarrollo local', () => {
    for (const origin of [
        'https://beatss.app',
        'https://www.beatss.app',
        'https://generador-licencias.vercel.app',
        'https://generador-licencias-abc123-masterjuego25-5300s-projects.vercel.app',
        'http://localhost:5173',
        'http://127.0.0.1:3000'
    ]) assert.equal(isTrustedBeatssOrigin(origin), true, origin);

    for (const origin of [
        '',
        'https://attacker.vercel.app',
        'https://generador-licencias-attacker.vercel.app',
        'https://generador-licencias-abc123-other-project.vercel.app',
        'https://beatss.app.attacker.example',
        'https://beatss.app@attacker.example',
        'http://localhost.attacker.example:5173'
    ]) assert.equal(isTrustedBeatssOrigin(origin), false, origin);
});
