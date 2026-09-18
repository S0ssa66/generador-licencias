import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildSnapshot, extractFinalText, validateReport } from '../scripts/run-knowledge-steward.mjs';

test('el manifiesto de vault-index excluye ajustes de Obsidian y conserva evidencia útil', () => {
  const project = mkdtempSync(join(tmpdir(), 'beatss-steward-project-'));
  const vault = mkdtempSync(join(tmpdir(), 'beatss-steward-vault-'));
  for (const folder of ['00_Indice', '1_Proyectos', '2_Areas', '.obsidian', '99_Derivado/Graphify']) {
    mkdirSync(join(vault, folder), { recursive: true });
  }
  writeFileSync(join(vault, '00_Indice', 'Inicio.md'), '# Inicio\n[[Proyecto]]\nAPI_KEY=should-not-leak');
  writeFileSync(join(vault, '.obsidian', 'app.json'), '{"private":true}');
  writeFileSync(join(vault, '99_Derivado', 'Graphify', 'derived.md'), '# Derivado');
  const snapshot = buildSnapshot('vault-index', project, vault);
  assert.equal(snapshot.files_discovered, 1);
  assert.equal(snapshot.documents[0].path, '00_Indice/Inicio.md');
  assert.match(snapshot.documents[0].excerpt, /API_KEY: \[REDACTADO\]/);
});

test('solo se acepta el último evento de texto y un contrato del alcance correcto', () => {
  const raw = [
    '{"type":"step_start"}',
    '{"type":"text","part":{"text":"{\\"status\\":\\"completed\\",\\"scope\\":\\"vault-index\\",\\"sources_checked\\":[],\\"findings\\":[],\\"limits\\":[],\\"next_safe_actions\\":[]}"}}'
  ].join('\n');
  const report = validateReport(extractFinalText(raw), 'vault-index');
  assert.equal(report.status, 'completed');
  assert.throws(() => validateReport(JSON.stringify({ ...report, scope: 'handoffs' }), 'vault-index'));
});
