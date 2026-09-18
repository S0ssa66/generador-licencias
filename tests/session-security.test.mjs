import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    evaluateSessionState,
    SESSION_POLICY
} from '../session-security.js';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const START = 1_800_000_000_000;

test('mantiene activa una sesión reciente', () => {
    const status = evaluateSessionState({
        now: START + 10 * MINUTE,
        startedAt: START,
        lastActivityAt: START + 9 * MINUTE,
        policy: SESSION_POLICY
    });

    assert.equal(status.state, 'active');
    assert.equal(status.canExtend, true);
});

test('avisa dos minutos antes del cierre por inactividad', () => {
    const status = evaluateSessionState({
        now: START + 28 * MINUTE,
        startedAt: START,
        lastActivityAt: START,
        policy: SESSION_POLICY
    });

    assert.equal(status.state, 'warning');
    assert.equal(status.reason, 'idle');
    assert.equal(status.remainingMs, 2 * MINUTE);
    assert.equal(status.canExtend, true);
});

test('expira al alcanzar treinta minutos sin actividad', () => {
    const status = evaluateSessionState({
        now: START + 30 * MINUTE,
        startedAt: START,
        lastActivityAt: START,
        policy: SESSION_POLICY
    });

    assert.equal(status.state, 'expired');
    assert.equal(status.reason, 'idle');
});

test('el límite absoluto avisa sin permitir extender la sesión', () => {
    const status = evaluateSessionState({
        now: START + 7 * HOUR + 58 * MINUTE,
        startedAt: START,
        lastActivityAt: START + 7 * HOUR + 57 * MINUTE,
        policy: SESSION_POLICY
    });

    assert.equal(status.state, 'warning');
    assert.equal(status.reason, 'absolute');
    assert.equal(status.canExtend, false);
});

test('expira al alcanzar ocho horas aunque exista actividad reciente', () => {
    const status = evaluateSessionState({
        now: START + 8 * HOUR,
        startedAt: START,
        lastActivityAt: START + 7 * HOUR + 59 * MINUTE,
        policy: SESSION_POLICY
    });

    assert.equal(status.state, 'expired');
    assert.equal(status.reason, 'absolute');
});

test('rechaza un estado sin marcas de tiempo válidas', () => {
    const status = evaluateSessionState({
        now: START,
        startedAt: null,
        lastActivityAt: null,
        policy: SESSION_POLICY
    });

    assert.equal(status.state, 'invalid');
    assert.equal(status.reason, 'missing');
});

test('Firebase y el cierre manual usan el mismo controlador seguro', () => {
    const auth = read('auth.js');
    const main = read('main.js');
    const sessionSecurity = read('session-security.js');
    const index = read('index.html');
    const styles = read('auth-access.css');

    assert.match(auth, /import\('\.\/session-security\.js'\)/);
    assert.match(auth, /startAuthenticatedSessionSecurity\(\{[\s\S]*onExpire: expireAuthenticatedSession/);
    assert.match(auth, /signOut\(auth\)/);
    assert.match(main, /clearBeatssSessionSecurityState\?\.\(\{ broadcast: true, reason: 'manual' \}\)/);
    assert.match(sessionSecurity, /window\.addEventListener\('storage'/);
    assert.match(sessionSecurity, /idleTimeoutMs: 30 \* 60 \* 1000/);
    assert.match(sessionSecurity, /absoluteTimeoutMs: 8 \* 60 \* 60 \* 1000/);
    assert.doesNotMatch(sessionSecurity, /\b(uid|email|accessToken|refreshToken)\b/i);
    assert.match(index, /id="auth-session-notice"/);
    assert.match(styles, /\.beatss-session-warning\[hidden\]/);
    assert.match(styles, /@media \(max-width: 620px\)[\s\S]*\.beatss-session-warning-actions/);
});
