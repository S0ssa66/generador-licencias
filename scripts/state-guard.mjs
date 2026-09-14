#!/usr/bin/env node
// Guardián de estado de BEATSS — impide dos tareas activas a la vez.
//
// La fuente autoritativa sigue siendo CURRENT_STATE.md. Este script sólo
// aporta un lock local (.state-claim.json, ignorado por Git) y una
// comprobación automática para que Codex y OpenCode no se pisen.
//
// Uso:
//   node scripts/state-guard.mjs check [--strict]
//   node scripts/state-guard.mjs claim --agent Codex --task "..." [--files a,b] [--verify "..."] [--force]
//   node scripts/state-guard.mjs release [--status done|blocked] [--agent Codex] [--force]
//   node scripts/state-guard.mjs status
//
// Salida: texto legible y código 0 (ok) / 1 (conflicto o error de parseo).

import { readFileSync, writeFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LEDGER = join(ROOT, 'CURRENT_STATE.md');
const CLAIM = join(ROOT, '.state-claim.json');
const AGENTS = ['Codex', 'OpenCode'];

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function readClaim() {
  if (!existsSync(CLAIM)) return null;
  try {
    return JSON.parse(readFileSync(CLAIM, 'utf8'));
  } catch (error) {
    return { __malformed: true, error: error.message };
  }
}

function writeClaim(claim) {
  writeFileSync(CLAIM, JSON.stringify(claim, null, 2) + '\n');
}

function parseLedger() {
  if (!existsSync(LEDGER)) {
    return { exists: false, estado: null, agente: null, fecha: null, inProgress: 0 };
  }
  const text = readFileSync(LEDGER, 'utf8');
  const pick = (label) => {
    const m = text.match(new RegExp('^-\\s*' + label + ':\\s*`?([^`\\n]+?)`?\\s*$', 'm'));
    return m ? m[1].trim() : null;
  };
  const inProgress = (text.match(/^\s*-\s*Estado:\s*`?IN_PROGRESS`?\s*$/gm) || []).length;
  return {
    exists: true,
    estado: pick('Estado'),
    agente: pick('Agente activo'),
    fecha: pick('Fecha'),
    inProgress
  };
}

function ageHours(file) {
  try {
    return Math.round((Date.now() - statSync(file).mtimeMs) / 36e5);
  } catch {
    return null;
  }
}

function printClaim(claim) {
  if (!claim) return 'Sin lock activo.';
  if (claim.__malformed) return 'LOCK MALFORMADO: ' + claim.error;
  return [
    `Agente:  ${claim.agent}`,
    `Tarea:   ${claim.task}`,
    `Estado:  ${claim.status}`,
    `Desde:   ${claim.since}`,
    `Archivos:${claim.files && claim.files.length ? ' ' + claim.files.join(', ') : ' (no declarados)'}`,
    `Verif.:  ${claim.verify || '(no declarada)'}`
  ].join('\n');
}

function cmdCheck(args) {
  const strict = !!args.strict;
  const errors = [];
  const warnings = [];
  const ledger = parseLedger();
  const claim = readClaim();

  console.log('== Estado (CURRENT_STATE.md) ==');
  console.log(`Estado:        ${ledger.estado ?? '(no encontrado)'}`);
  console.log(`Agente activo: ${ledger.agente ?? '(no encontrado)'}`);
  console.log(`Fecha:         ${ledger.fecha ?? '(no encontrada)'}`);
  console.log('');
  console.log('== Lock local (.state-claim.json) ==');
  console.log(printClaim(claim));
  console.log('');

  if (!ledger.exists) errors.push('No existe CURRENT_STATE.md.');
  if (claim && claim.__malformed) errors.push('El lock .state-claim.json está malformado.');
  if (claim && !claim.__malformed) {
    if (!claim.agent) errors.push('El lock no declara agente.');
    if (!claim.task) errors.push('El lock no declara tarea.');
  }
  if (ledger.inProgress > 1) {
    errors.push(`CURRENT_STATE.md contiene ${ledger.inProgress} entradas IN_PROGRESS; sólo puede haber una.`);
  }

  const activeClaim = claim && !claim.__malformed && claim.status === 'active' ? claim : null;
  if (activeClaim && ledger.estado && ledger.estado !== 'IN_PROGRESS') {
    warnings.push(`Lock activo de ${activeClaim.agent} pero el ledger marca "${ledger.estado}". Posible divergencia: sincroniza CURRENT_STATE.md.`);
  }
  if (!activeClaim && ledger.estado === 'IN_PROGRESS') {
    warnings.push('El ledger marca IN_PROGRESS sin lock local. El agente que tomó la tarea debe ejecutar "claim".');
  }
  if (activeClaim && ledger.agente && ledger.agente !== activeClaim.agent) {
    warnings.push(`El ledger atribuye la tarea a ${ledger.agente} y el lock a ${activeClaim.agent}.`);
  }
  if (existsSync(CLAIM)) {
    const h = ageHours(CLAIM);
    if (activeClaim && h !== null && h >= 24) {
      warnings.push(`El lock tiene ${h} h sin actualizarse; verifica si es un lock huérfano.`);
    }
  }

  if (activeClaim) {
    console.log(`>> TAREA ACTIVA: ${activeClaim.task} (${activeClaim.agent})`);
    console.log('>> Si no eres ese agente, detente y deja nota de bloqueo.');
  } else if (!errors.length) {
    console.log('>> No hay tarea activa. Puedes reclamar con "claim".');
  }

  warnings.forEach((w) => console.log('AVISO: ' + w));
  errors.forEach((e) => console.log('ERROR: ' + e));

  if (errors.length) return 1;
  if (strict && warnings.length) return 1;
  return 0;
}

function cmdClaim(args) {
  const agent = typeof args.agent === 'string' ? args.agent : null;
  const task = typeof args.task === 'string' ? args.task : null;
  if (!agent || !task) {
    console.error('Uso: claim --agent <Codex|OpenCode> --task "descripción" [--files a,b] [--verify "..."] [--force]');
    return 1;
  }
  if (!AGENTS.includes(agent) && !args.force) {
    console.error(`Agente desconocido "${agent}". Usa uno de: ${AGENTS.join(', ')} (o --force).`);
    return 1;
  }

  const files = typeof args.files === 'string'
    ? args.files.split(',').map((f) => f.trim()).filter(Boolean)
    : [];
  const verify = typeof args.verify === 'string' ? args.verify : '';
  const ledger = parseLedger();
  const claim = readClaim();

  if (claim && claim.__malformed) {
    console.error('ERROR: el lock existente está malformado. Revísalo o bórralo manualmente.');
    return 1;
  }
  const active = claim && claim.status === 'active' ? claim : null;
  if (active && active.agent !== agent && !args.force) {
    console.error(`BLOQUEADO: ${active.agent} ya tiene una tarea activa:`);
    console.error('  ' + active.task);
    console.error('Espera su cierre (release) o usa --force con autorización.');
    return 1;
  }
  if (!active && ledger.estado === 'IN_PROGRESS' && ledger.agente && ledger.agente !== agent && !args.force) {
    console.error(`BLOQUEADO: CURRENT_STATE.md marca IN_PROGRESS de ${ledger.agente} sin lock.`);
    console.error('Confirma con esa persona/agente antes de reclamar, o usa --force.');
    return 1;
  }

  const now = new Date().toISOString();
  const next = {
    agent,
    task,
    files,
    verify,
    status: 'active',
    since: active && active.agent === agent ? active.since : now,
    updated: now
  };
  writeClaim(next);
  console.log('Lock creado:');
  console.log(printClaim(next));
  console.log('');
  console.log('Recuerda reflejarlo en CURRENT_STATE.md:');
  console.log(`- Estado: \`IN_PROGRESS\`\n- Agente activo: \`${agent}\`\n- Objetivo: ${task}`);
  return 0;
}

function cmdRelease(args) {
  const status = typeof args.status === 'string' ? args.status : 'done';
  const agent = typeof args.agent === 'string' ? args.agent : null;
  const claim = readClaim();
  if (!claim) {
    console.log('Sin lock activo; nada que liberar.');
    return 0;
  }
  if (claim.__malformed) {
    console.error('ERROR: lock malformado; revísalo o bórralo manualmente.');
    return 1;
  }
  if (agent && claim.agent !== agent && !args.force) {
    console.error(`BLOQUEADO: el lock pertenece a ${claim.agent}. Usa --agent ${claim.agent} o --force.`);
    return 1;
  }
  rmSync(CLAIM, { force: true });
  console.log(`Lock liberado (${claim.agent} — ${claim.task}) con estado "${status}".`);
  console.log('Recuerda actualizar CURRENT_STATE.md: estado, resumen, archivos, pruebas y siguiente acción.');
  return 0;
}

function cmdStatus() {
  const claim = readClaim();
  console.log(printClaim(claim));
  return 0;
}

const argv = process.argv.slice(2);
const args = parseArgs(argv);
const cmd = args._[0] || 'status';

let code = 0;
switch (cmd) {
  case 'check': code = cmdCheck(args); break;
  case 'claim': code = cmdClaim(args); break;
  case 'release': code = cmdRelease(args); break;
  case 'status': code = cmdStatus(); break;
  default:
    console.error('Comando desconocido: ' + cmd);
    console.error('Comandos: check | claim | release | status');
    code = 1;
}
process.exit(code);
