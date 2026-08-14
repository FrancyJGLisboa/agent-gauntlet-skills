#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { initialState, loadState, nextSlices, saveState, transition, validatePack } from './engine.js';

function usage() {
  console.log(`gauntlet <command> [manifest]

Commands:
  validate [manifest]                         Validate pack structure and policies
  init [manifest]                             Validate and initialize run-state.json
  status [manifest]                           Show current state
  next [manifest]                             List dependency-ready slices
  transition <slice> <state> [options]        Apply a guarded state transition
  release-check [manifest]                    Verify distribution readiness

Transition options:
  --actor <builder|critic|verifier|engine>
  --evidence <file>                            Repeatable
  --reason <text>
  --publish-authorized`);
}

function print(value) { console.log(JSON.stringify(value, null, 2)); }
function manifestFrom(args) { return args.find(a => !a.startsWith('--')) ?? '.gauntlet/manifest.yaml'; }
function option(args, name, fallback = '') { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; }
function repeated(args, name) { const out=[]; for(let i=0;i<args.length;i++) if(args[i]===name && args[i+1]) out.push(args[++i]); return out; }

const [command, ...args] = process.argv.slice(2);
if (!command || ['help', '--help', '-h'].includes(command)) { usage(); process.exit(0); }

try {
  if (command === 'validate') {
    const result = validatePack(manifestFrom(args));
    print({ valid: result.valid, errors: result.errors, warnings: result.warnings });
    process.exit(result.valid ? 0 : 1);
  }
  if (command === 'init') {
    const result = validatePack(manifestFrom(args));
    if (!result.valid) { print({ initialized: false, errors: result.errors }); process.exit(1); }
    const file = path.join(result.root, 'run-state.json');
    if (fs.existsSync(file)) throw new Error('Run state already exists; refusing to overwrite it');
    const state = initialState(result); saveState(file, state); print({ initialized: true, file, state });
  } else if (command === 'status' || command === 'next' || command === 'release-check') {
    const result = validatePack(manifestFrom(args));
    if (!result.valid) { print({ valid: false, errors: result.errors }); process.exit(1); }
    if (command === 'release-check') {
      const distribution = result.documents['distribution-contract.yaml'];
      const ready = distribution.requirements.clean_install && distribution.requirements.upgrade && distribution.requirements.rollback && distribution.requirements.checksums;
      print({ ready: Boolean(ready), artifacts: distribution.artifacts }); process.exit(ready ? 0 : 1);
    }
    const { state } = loadState(result.root);
    print(command === 'next' ? { ready: nextSlices(result, state) } : state);
  } else if (command === 'transition') {
    const [sliceId, target, ...rest] = args;
    if (!sliceId || !target) throw new Error('transition requires <slice> <state>');
    const manifest = option(rest, '--manifest', '.gauntlet/manifest.yaml');
    const result = validatePack(manifest);
    if (!result.valid) { print({ transitioned: false, errors: result.errors }); process.exit(1); }
    const loaded = loadState(result.root);
    const event = transition({ validation: result, state: loaded.state, sliceId, target,
      actor: option(rest, '--actor', 'engine'), evidenceFiles: repeated(rest, '--evidence'),
      reason: option(rest, '--reason', ''), publishAuthorized: rest.includes('--publish-authorized') });
    saveState(loaded.file, loaded.state); print({ transitioned: true, event });
  } else { usage(); process.exit(2); }
} catch (error) {
  console.error(JSON.stringify({ error: error.message }, null, 2)); process.exit(1);
}
