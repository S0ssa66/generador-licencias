#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path';

const PROJECT_ROOT = process.cwd();
const VAULT_ROOT = resolve(PROJECT_ROOT, '../BeatSS-Obsidian');
const REPORTS_ROOT = resolve(PROJECT_ROOT, '.knowledge_steward_reports');
const MAX_FILES = 24;
const MAX_EXCERPT_CHARS = 650;
const MAX_MANIFEST_CHARS = 16_000;
const SENSITIVE_BASENAMES = new Set([
  '.env', '.env.local', '.env.production', '.env.development',
  'firebase-adminsdk.json', 'session_memory.json', 'subagent_memories.json'
]);
const BLOCKED_SEGMENTS = new Set([
  '.git', '.obsidian', '.vercel', '.venv', 'node_modules', 'dist', '.beatss_memory',
  '.trash', '99_Derivado', 'graphify-out', 'Codigo_Beatss'
]);
const BLOCKED_EXTENSIONS = new Set(['.pem', '.key', '.p12', '.pfx', '.db', '.sqlite', '.zip', '.pdf']);

const scopes = {
  handoffs: {
    root: PROJECT_ROOT,
    sources: ['AGENTS.md', 'CODEX_HANDOFF.md', 'OPEN_CODE_HANDOFF.md', 'COLLABORATION_PROTOCOL.md', 'COLLABORATION_STATE.md', 'task.md', '.agents/AGENTS.md']
  },
  'project-docs': {
    root: PROJECT_ROOT,
    sources: ['Dashboard BEATSS.md', 'Memoria del Proyecto.md', 'docs/10_Pagos', 'docs/20_Soporte', 'docs/30_SRI']
  },
  'vault-index': {
    root: VAULT_ROOT,
    sources: ['00_Indice', '1_Proyectos', '2_Areas']
  }
};

function isWithin(candidate, root) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function isSafeMarkdown(file, root) {
  if (extname(file).toLowerCase() !== '.md' || !isWithin(file, root)) return false;
  const parts = relative(root, file).split(sep);
  const name = basename(file).toLowerCase();
  if (parts.some((part) => BLOCKED_SEGMENTS.has(part)) || SENSITIVE_BASENAMES.has(name)) return false;
  return !BLOCKED_EXTENSIONS.has(extname(file).toLowerCase()) && !name.includes('_backup_sincronizado');
}

function collectMarkdown(source, root, files) {
  const absolute = resolve(root, source);
  if (!isWithin(absolute, root) || !existsSync(absolute)) return;
  const info = statSync(absolute);
  if (info.isFile()) {
    if (isSafeMarkdown(absolute, root)) files.add(absolute);
    return;
  }
  for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (BLOCKED_SEGMENTS.has(entry.name)) continue;
    const child = resolve(absolute, entry.name);
    if (entry.isDirectory()) collectMarkdown(child, root, files);
    else if (entry.isFile() && isSafeMarkdown(child, root)) files.add(child);
  }
}

function redact(text) {
  return text
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, '[MATERIAL PRIVADO OMITIDO]')
    .replace(/(^|\n)\s*([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)|api[_-]?key|authorization)\s*[:=].*/gi, '$1$2: [REDACTADO]')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTADO]');
}

function extractFrontmatter(text) {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  return match ? redact(match[1]).slice(0, 900) : '';
}

function extractHeadings(text) {
  return [...text.matchAll(/^#{1,4}\s+(.+)$/gm)].map((match) => match[1].trim()).slice(0, 12);
}

function extractLinks(text) {
  const markdown = [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
  const wikilinks = [...text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)].map((match) => match[1]);
  return [...new Set([...markdown, ...wikilinks])].slice(0, 20);
}

function excerpt(text) {
  const withoutFrontmatter = text.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
  return redact(withoutFrontmatter).replace(/\s+/g, ' ').trim().slice(0, MAX_EXCERPT_CHARS);
}

export function buildSnapshot(scopeName, projectRoot = PROJECT_ROOT, vaultRoot = VAULT_ROOT) {
  const scope = scopes[scopeName];
  if (!scope) throw new Error(`Alcance desconocido: ${scopeName}`);
  const root = scope.root === VAULT_ROOT ? vaultRoot : projectRoot;
  const files = new Set();
  for (const source of scope.sources) collectMarkdown(source, root, files);
  const selected = [...files].sort().slice(0, MAX_FILES);
  const documents = selected.map((file) => {
    const text = readFileSync(file, 'utf8');
    return {
      path: relative(root, file),
      frontmatter: extractFrontmatter(text),
      headings: extractHeadings(text),
      links: extractLinks(text),
      excerpt: excerpt(text)
    };
  });
  const manifest = {
    contract: 'beatss-knowledge-steward-snapshot/v1',
    scope: scopeName,
    root_label: root === vaultRoot ? 'BeatSS-Obsidian' : 'BeatSS',
    source_allowlist: scope.sources,
    files_discovered: files.size,
    files_included: documents.length,
    files_omitted: Math.max(0, files.size - documents.length),
    documents
  };
  if (JSON.stringify(manifest).length > MAX_MANIFEST_CHARS) {
    throw new Error(`El manifiesto excede el límite seguro de ${MAX_MANIFEST_CHARS} caracteres.`);
  }
  return manifest;
}

export function extractFinalText(events) {
  let text = '';
  for (const line of String(events || '').split(/\r?\n/)) {
    try {
      const event = JSON.parse(line);
      if (event?.type === 'text' && typeof event?.part?.text === 'string') text = event.part.text;
    } catch (_) {
      // OpenCode can emit non-JSON diagnostics; they are not agent output.
    }
  }
  return text.trim();
}

export function validateReport(raw, scopeName) {
  let report;
  try {
    report = JSON.parse(raw);
  } catch (_) {
    throw new Error('Knowledge Steward no devolvió JSON válido.');
  }
  if (!['completed', 'needs_input', 'blocked'].includes(report?.status)) throw new Error('Estado de informe inválido.');
  if (report.scope !== scopeName) throw new Error('El informe no coincide con el alcance solicitado.');
  for (const field of ['sources_checked', 'findings', 'limits', 'next_safe_actions']) {
    if (!Array.isArray(report[field])) throw new Error(`Falta el arreglo ${field}.`);
  }
  if (report.findings.length > 20) throw new Error('El informe excede el máximo de 20 hallazgos.');
  return report;
}

function saveReport(scopeName, report) {
  mkdirSync(REPORTS_ROOT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const output = resolve(REPORTS_ROOT, `${stamp}-${scopeName}.json`);
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return output;
}

export function main(args = process.argv.slice(2)) {
  const [scopeName, ...flags] = args;
  if (!scopeName || !(scopeName in scopes) || flags.some((flag) => !['--save', '--debug'].includes(flag))) {
    console.error(`Uso: node scripts/run-knowledge-steward.mjs <${Object.keys(scopes).join('|')}> [--save] [--debug]`);
    console.error('Genera un manifiesto saneado y de alcance limitado; DeepSeek no recibe acceso directo a la bóveda.');
    return 2;
  }

  const snapshot = buildSnapshot(scopeName);
  const debug = flags.includes('--debug');
  if (debug) console.error(`[Knowledge Steward] Manifiesto: ${snapshot.files_included}/${snapshot.files_discovered} archivos, ${JSON.stringify(snapshot).length} caracteres.`);
  const prompt = [
    'Auditoría BEATSS de solo lectura. Usa únicamente el manifiesto JSON incluido abajo.',
    'No tienes acceso a herramientas ni debes solicitar archivos adicionales.',
    'No repitas fragmentos extensos ni datos personales; cita solo rutas del manifiesto.',
    `El campo JSON scope DEBE ser exactamente "${scopeName}"; no lo traduzcas ni lo describas.`,
    'Devuelve exclusivamente el contrato JSON definido por tu perfil.',
    `MANIFIESTO:\n${JSON.stringify(snapshot)}`
  ].join('\n\n');
  const result = spawnSync('opencode', [
    'run', '--agent', 'knowledge-steward', '--model', 'deepseek/deepseek-v4-flash',
    '--format', 'json', '--dir', PROJECT_ROOT, prompt
  ], { encoding: 'utf8', maxBuffer: 2_000_000, timeout: 120_000 });

  if (debug) console.error(`[Knowledge Steward] OpenCode: status=${result.status}, signal=${result.signal || 'none'}, eventos=${result.stdout?.length || 0}.`);

  if (result.error) {
    console.error(`No se pudo iniciar OpenCode: ${result.error.message}`);
    return 1;
  }
  const rawReport = extractFinalText(result.stdout);
  let report;
  try {
    report = validateReport(rawReport, scopeName);
  } catch (error) {
    console.error(`Informe rechazado: ${error.message}`);
    if (result.stderr) console.error(result.stderr.trim());
    return 1;
  }
  if (flags.includes('--save')) report.saved_to = relative(PROJECT_ROOT, saveReport(scopeName, report));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return result.status === 0 ? 0 : 1;
}

if (process.argv[1] && basename(process.argv[1]) === 'run-knowledge-steward.mjs') {
  process.exitCode = main();
}
