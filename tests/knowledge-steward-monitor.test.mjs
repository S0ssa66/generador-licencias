import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { monitorOnce } from '../scripts/knowledge-steward-monitor.mjs';

test('el monitor registra cambios sin enviar contenido ni ejecutar auditorías fuera del alcance', () => {
  const project = mkdtempSync(join(tmpdir(), 'beatss-monitor-project-'));
  const vault = mkdtempSync(join(tmpdir(), 'beatss-monitor-vault-'));
  const reports = mkdtempSync(join(tmpdir(), 'beatss-monitor-reports-'));
  mkdirSync(join(vault, '00_Indice'), { recursive: true });
  writeFileSync(join(project, 'main.js'), 'export const version = 1;');
  writeFileSync(join(vault, '00_Indice', 'Inicio.md'), '# Inicio');

  const initial = monitorOnce({ projectRoot: project, vaultRoot: vault, reportsRoot: reports, audit: false });
  assert.equal(initial.status, 'initialized');

  writeFileSync(join(project, 'main.js'), 'export const version = 2;');
  writeFileSync(join(vault, '00_Indice', 'Inicio.md'), '# Inicio\nCambio');
  const changed = monitorOnce({ projectRoot: project, vaultRoot: vault, reportsRoot: reports, audit: false });
  assert.equal(changed.events.length, 2);
  assert.deepEqual(new Set(changed.events.map((event) => event.category)), new Set(['project-change', 'vault-index']));
  assert.equal(changed.audits.length, 0);

  const ledger = readFileSync(join(reports, 'change-ledger.jsonl'), 'utf8');
  assert.doesNotMatch(ledger, /export const version|# Inicio/);
  assert.match(ledger, /"hash":"[a-f0-9]{16}"/);
});

test('solo audita al aparecer documentación permitida y reintenta fallos pendientes', () => {
  const project = mkdtempSync(join(tmpdir(), 'beatss-monitor-project-'));
  const vault = mkdtempSync(join(tmpdir(), 'beatss-monitor-vault-'));
  const reports = mkdtempSync(join(tmpdir(), 'beatss-monitor-reports-'));
  mkdirSync(join(project, 'docs', '20_Soporte'), { recursive: true });
  writeFileSync(join(project, 'docs', '20_Soporte', 'Estado.md'), '# Estado');

  monitorOnce({ projectRoot: project, vaultRoot: vault, reportsRoot: reports, audit: false });
  let calls = 0;
  const failedAudit = () => {
    calls += 1;
    return { status: 1, stdout: '', stderr: 'temporal' };
  };
  writeFileSync(join(project, 'docs', '20_Soporte', 'Estado.md'), '# Estado\nCambio');
  const failed = monitorOnce({ projectRoot: project, vaultRoot: vault, reportsRoot: reports, runProcess: failedAudit });
  assert.equal(failed.audits[0].status, 'failed');
  assert.equal(calls, 1);

  const completedAudit = () => {
    calls += 1;
    return { status: 0, stdout: '{"status":"completed"}', stderr: '' };
  };
  const retried = monitorOnce({ projectRoot: project, vaultRoot: vault, reportsRoot: reports, runProcess: completedAudit });
  assert.equal(retried.events.length, 0);
  assert.equal(retried.audits[0].status, 'completed');
  assert.equal(calls, 2);

  const unchanged = monitorOnce({ projectRoot: project, vaultRoot: vault, reportsRoot: reports, runProcess: completedAudit });
  assert.equal(unchanged.events.length, 0);
  assert.equal(unchanged.audits.length, 0);
  assert.equal(calls, 2);
});
