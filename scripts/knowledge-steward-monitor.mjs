#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const PROJECT_ROOT = process.cwd();
const VAULT_ROOT = resolve(PROJECT_ROOT, '../BeatSS-Obsidian');
const REPORTS_ROOT = resolve(PROJECT_ROOT, '.knowledge_steward_reports');
const STATE_FILE = 'monitor-state.json';
const LEDGER_FILE = 'change-ledger.jsonl';
const MAX_EVENTS_PER_RUN = 200;
const TRACKED_EXTENSIONS = new Set(['.md', '.js', '.mjs', '.cjs', '.py', '.html', '.css', '.json', '.yml', '.yaml', '.toml', '.sh']);
const BLOCKED_DIRECTORIES = new Set([
  '.git', '.obsidian', '.vercel', '.venv', 'node_modules', 'dist', '.beatss_memory',
  '.knowledge_steward_reports', '.trash', '99_Derivado', 'graphify-out', 'Codigo_Beatss',
  'temp_audio_cache', 'output', 'work'
]);
const SENSITIVE_NAMES = new Set([
  '.env', '.env.local', '.env.production', '.env.development',
  'firebase-adminsdk.json', 'session_memory.json', 'subagent_memories.json'
]);
const SENSITIVE_EXTENSIONS = new Set(['.pem', '.key', '.p12', '.pfx', '.db', '.sqlite']);

function isWithin(candidate, root) {
  const path = relative(root, candidate);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

function isTrackedFile(path, root) {
  if (!isWithin(path, root)) return false;
  const name = basename(path).toLowerCase();
  const segments = relative(root, path).split(sep);
  if (segments.some((segment) => BLOCKED_DIRECTORIES.has(segment))) return false;
  if (SENSITIVE_NAMES.has(name) || name.includes('_backup_sincronizado')) return false;
  return TRACKED_EXTENSIONS.has(extname(path).toLowerCase()) && !SENSITIVE_EXTENSIONS.has(extname(path).toLowerCase());
}

function collectFiles(root, directory = root, target = new Map()) {
  if (!existsSync(directory) || !isWithin(directory, root)) return target;
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (BLOCKED_DIRECTORIES.has(entry.name)) continue;
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) collectFiles(root, file, target);
    else if (entry.isFile() && isTrackedFile(file, root)) {
      const stats = lstatSync(file);
      target.set(relative(root, file), { size: stats.size, mtimeMs: Math.round(stats.mtimeMs) });
    }
  }
  return target;
}

function contentHash(root, relPath) {
  const path = resolve(root, relPath);
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16);
}

function atomicWrite(path, data) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  renameSync(temporary, path);
}

function loadState(reportsRoot) {
  const path = resolve(reportsRoot, STATE_FILE);
  if (!existsSync(path)) return null;
  try {
    const state = JSON.parse(readFileSync(path, 'utf8'));
    return state?.version === 1 && state?.roots ? state : null;
  } catch (_) {
    return null;
  }
}

function classifyChange(rootName, relPath) {
  if (rootName === 'vault') {
    if (/^(00_Indice|1_Proyectos|2_Areas)\//.test(relPath)) return { category: 'vault-index', auditScope: 'vault-index' };
    return { category: 'vault-change', auditScope: null };
  }
  if (/^(AGENTS\.md|CODEX_HANDOFF\.md|OPEN_CODE_HANDOFF\.md|COLLABORATION_PROTOCOL\.md|COLLABORATION_STATE\.md|task\.md|\.agents\/AGENTS\.md)$/.test(relPath)) {
    return { category: 'handoff', auditScope: 'handoffs' };
  }
  if (/^(Dashboard BEATSS\.md|Memoria del Proyecto\.md|docs\/(10_Pagos|20_Soporte|30_SRI)\/)/.test(relPath)) {
    return { category: 'project-doc', auditScope: 'project-docs' };
  }
  return { category: 'project-change', auditScope: null };
}

function diffRoot(rootName, previous = {}, current, rootPath, now) {
  const events = [];
  for (const [path, metadata] of current) {
    const before = previous[path];
    if (before && before.size === metadata.size && before.mtimeMs === metadata.mtimeMs) continue;
    const kind = before ? 'modified' : 'created';
    const classification = classifyChange(rootName, path);
    events.push({
      timestamp: now,
      root: rootName,
      path,
      kind,
      category: classification.category,
      hash: contentHash(rootPath, path),
      ...classification
    });
  }
  for (const path of Object.keys(previous)) {
    if (current.has(path)) continue;
    const classification = classifyChange(rootName, path);
    events.push({ timestamp: now, root: rootName, path, kind: 'deleted', category: classification.category, hash: null, ...classification });
  }
  return events;
}

function appendLedger(reportsRoot, events) {
  if (!events.length) return;
  const path = resolve(reportsRoot, LEDGER_FILE);
  writeFileSync(path, events.map((event) => JSON.stringify(event)).join('\n') + '\n', { encoding: 'utf8', flag: 'a' });
}

function runAudit(scope, projectRoot, runProcess = spawnSync) {
  const result = runProcess(process.execPath, ['scripts/run-knowledge-steward.mjs', scope, '--save'], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 2_000_000
  });
  return {
    scope,
    status: result.status === 0 ? 'completed' : 'failed',
    output_chars: result.stdout?.length || 0,
    error: result.status === 0 ? null : String(result.stderr || result.error?.message || 'Auditoría sin salida').slice(0, 400)
  };
}

export function monitorOnce({ projectRoot = PROJECT_ROOT, vaultRoot = VAULT_ROOT, reportsRoot = REPORTS_ROOT, audit = true, runProcess = spawnSync } = {}) {
  mkdirSync(reportsRoot, { recursive: true });
  const state = loadState(reportsRoot);
  const now = new Date().toISOString();
  const roots = {
    project: collectFiles(projectRoot),
    vault: collectFiles(vaultRoot)
  };
  const serializedRoots = Object.fromEntries(Object.entries(roots).map(([name, entries]) => [name, Object.fromEntries(entries)]));
  const nextState = {
    version: 1,
    initialized_at: state?.initialized_at || now,
    updated_at: now,
    roots: serializedRoots,
    pending_scopes: Array.isArray(state?.pending_scopes) ? state.pending_scopes : []
  };

  if (!state) {
    atomicWrite(resolve(reportsRoot, STATE_FILE), nextState);
    return { status: 'initialized', tracked: { project: roots.project.size, vault: roots.vault.size }, events: [], audits: [] };
  }

  const events = [
    ...diffRoot('project', state.roots.project, roots.project, projectRoot, now),
    ...diffRoot('vault', state.roots.vault, roots.vault, vaultRoot, now)
  ];
  const storedEvents = events.slice(0, MAX_EVENTS_PER_RUN);
  if (events.length > MAX_EVENTS_PER_RUN) storedEvents.push({ timestamp: now, kind: 'overflow', root: 'system', path: '', category: 'monitor', hash: null, auditScope: null, omitted: events.length - MAX_EVENTS_PER_RUN });
  appendLedger(reportsRoot, storedEvents);
  const scopes = new Set(nextState.pending_scopes);
  for (const event of storedEvents) if (event.auditScope) scopes.add(event.auditScope);
  const audits = audit ? [...scopes].map((scope) => runAudit(scope, projectRoot, runProcess)) : [];
  nextState.pending_scopes = audit
    ? audits.filter((result) => result.status !== 'completed').map((result) => result.scope)
    : [...scopes];
  atomicWrite(resolve(reportsRoot, STATE_FILE), nextState);
  return { status: 'scanned', tracked: { project: roots.project.size, vault: roots.vault.size }, events: storedEvents, audits };
}

export function main(args = process.argv.slice(2)) {
  const allowed = new Set(['--no-audit', '--status']);
  if (args.some((arg) => !allowed.has(arg))) {
    console.error('Uso: node scripts/knowledge-steward-monitor.mjs [--no-audit|--status]');
    return 2;
  }
  if (args.includes('--status')) {
    const state = loadState(REPORTS_ROOT);
    process.stdout.write(`${JSON.stringify(state ? { status: 'ready', updated_at: state.updated_at, tracked: Object.fromEntries(Object.entries(state.roots).map(([name, files]) => [name, Object.keys(files).length])) } : { status: 'not_initialized' }, null, 2)}\n`);
    return 0;
  }
  const result = monitorOnce({ audit: !args.includes('--no-audit') });
  process.stdout.write(`${JSON.stringify({ ...result, events: result.events.map(({ auditScope, ...event }) => event) }, null, 2)}\n`);
  return result.audits.some((audit) => audit.status === 'failed') ? 1 : 0;
}

if (process.argv[1] && basename(process.argv[1]) === 'knowledge-steward-monitor.mjs') process.exitCode = main();
