import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { initialState, nextSlices, transition, validatePack } from '../src/engine.js';

const VALID = {
  'manifest.yaml': `gauntlet_version: 1\nstatus: executable\nobjective_id: demo\nexecution:\n  maximum_repairs_per_slice: 3\nhuman_dependency: {}\nfiles:\n${['manifest.yaml','objective.yaml','evidence.yaml','reference-contract.yaml','target-contracts.yaml','semantic-mappings.yaml','architecture-decisions.yaml','distribution-contract.yaml','uncertainties.yaml','execution-dag.yaml','acceptance-tests.yaml','critic-protocol.yaml','stop-policy.yaml','final-verification.yaml'].map(f=>`  - ${f}`).join('\n')}\n`,
  'objective.yaml': 'outcome: working product\n',
  'evidence.yaml': 'claims: []\n',
  'reference-contract.yaml': 'inputs: []\noutputs: []\n',
  'target-contracts.yaml': 'sources: []\n',
  'semantic-mappings.yaml': 'mappings: []\n',
  'architecture-decisions.yaml': `decisions:\n  - component: api\n    workload: { maximum_p95_latency_ms: 200 }\n    candidates: [typescript, rust]\n    selected: typescript\n    evidence: ["ecosystem constraint"]\n    reconsider_when: ["p95 exceeds 200ms"]\n`,
  'distribution-contract.yaml': `personas: [{ name: developer }]\nartifacts: [{ name: cli, format: npm }]\nrequirements:\n  clean_install: true\n  upgrade: true\n  rollback: true\n  checksums: true\n`,
  'uncertainties.yaml': 'items: []\n',
  'execution-dag.yaml': `slices:\n  - id: core\n    depends_on: []\n    builder: { scope: core }\n    critic: { independent: true }\n    acceptance_tests: [core-test]\n  - id: ui\n    depends_on: [core]\n    builder: { scope: ui }\n    critic: { independent: true }\n    acceptance_tests: [ui-test]\n`,
  'acceptance-tests.yaml': 'tests: []\n',
  'critic-protocol.yaml': 'isolation: { fresh_context: true }\n',
  'stop-policy.yaml': 'retry: { maximum_repairs_per_slice: 3 }\n',
  'final-verification.yaml': 'clean_room: true\n'
};

function pack(changes = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gauntlet-test-'));
  for (const [name, content] of Object.entries({ ...VALID, ...changes })) if (content !== null) fs.writeFileSync(path.join(root, name), content);
  return { root, manifest: path.join(root, 'manifest.yaml') };
}

test('validates a complete pack', () => {
  const p = pack();
  assert.equal(validatePack(p.manifest).valid, true);
});

test('rejects missing required files and excessive repairs', () => {
  const p = pack({ 'distribution-contract.yaml': null, 'stop-policy.yaml': 'retry: { maximum_repairs_per_slice: 4 }\n' });
  const codes = validatePack(p.manifest).errors.map(e => e.code);
  assert.ok(codes.includes('MISSING_FILE'));
  assert.ok(codes.includes('REPAIR_LIMIT'));
});

test('rejects cyclic DAGs', () => {
  const p = pack({ 'execution-dag.yaml': `slices:\n  - { id: a, depends_on: [b], builder: {}, critic: {}, acceptance_tests: [a] }\n  - { id: b, depends_on: [a], builder: {}, critic: {}, acceptance_tests: [b] }\n` });
  assert.ok(validatePack(p.manifest).errors.some(e => e.code === 'DAG_CYCLE'));
});

test('enforces dependency order, critic pass, evidence, and repair cap', () => {
  const p = pack(); const validation = validatePack(p.manifest); const state = initialState(validation);
  assert.deepEqual(nextSlices(validation, state), ['core']);
  assert.throws(() => transition({ validation, state, sliceId:'ui', target:'building', actor:'builder' }), /dependencies/);
  transition({ validation, state, sliceId:'core', target:'building', actor:'builder' });
  transition({ validation, state, sliceId:'core', target:'critiquing', actor:'builder' });
  assert.throws(() => transition({ validation, state, sliceId:'core', target:'passed', actor:'builder' }), /critic/);
  assert.throws(() => transition({ validation, state, sliceId:'core', target:'passed', actor:'critic' }), /evidence/);
  const evidence = path.join(p.root, 'proof.log'); fs.writeFileSync(evidence, 'PASS\n');
  transition({ validation, state, sliceId:'core', target:'passed', actor:'critic', evidenceFiles:[evidence] });
  assert.deepEqual(nextSlices(validation, state), ['ui']);
});

test('blocks unauthorized publishing transitions', () => {
  const p = pack(); const validation = validatePack(p.manifest); const state = initialState(validation);
  assert.throws(() => transition({ validation, state, sliceId:'core', target:'building', actor:'builder', reason:'deploy to production' }), /authorization/);
});
