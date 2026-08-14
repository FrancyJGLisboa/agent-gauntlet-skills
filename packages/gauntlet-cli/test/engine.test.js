import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { initialState, nextSlices, RunStore, transition, validatePack } from '../src/engine.js';

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
  'acceptance-tests.yaml': `tests:\n  - id: core-test\n    slice_id: core\n    command: ["node", "-e", "console.log('PASS')"]\n  - id: ui-test\n    slice_id: ui\n    command: ["node", "-e", "console.log('PASS')"]\n`,
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

test('captures commands itself and binds role capabilities', () => {
  const p=pack(); const validation=validatePack(p.manifest); const store=new RunStore(p.root);
  try {
    store.initialize(validation);
    const builder=store.assign({validation,sliceId:'core',role:'builder'});
    const critic=store.assign({validation,sliceId:'core',role:'critic'});
    store.transition({validation,token:builder.token,sliceId:'core',target:'building'});
    const evidence=store.recordExecution({validation,token:builder.token,sliceId:'core',testId:'core-test'});
    assert.equal(evidence.exit_code,0); assert.match(evidence.stdout,/PASS/);
    store.transition({validation,token:builder.token,sliceId:'core',target:'critiquing'});
    assert.throws(()=>store.transition({validation,token:builder.token,sliceId:'core',target:'passed',evidenceIds:[evidence.evidence_id]}),/Role builder/);
    store.transition({validation,token:critic.token,sliceId:'core',target:'passed',evidenceIds:[evidence.evidence_id]});
    assert.deepEqual(store.ready(validation),['ui']);
  } finally { store.close(); }
});

test('rejects stale evidence and pack mutation', () => {
  const p=pack(); const validation=validatePack(p.manifest); const store=new RunStore(p.root);
  try {
    store.initialize(validation);
    const builder=store.assign({validation,sliceId:'core',role:'builder'});
    fs.appendFileSync(path.join(p.root,'objective.yaml'),'changed: true\n');
    const changed=validatePack(p.manifest);
    assert.notEqual(changed.fingerprint,validation.fingerprint);
    assert.throws(()=>store.recordExecution({validation:changed,token:builder.token,sliceId:'core',testId:'core-test'}),/fingerprint changed/);
  } finally { store.close(); }
});

test('prevents critics from using self-created evidence for a pass', () => {
  const p=pack(); const validation=validatePack(p.manifest); const store=new RunStore(p.root);
  try {
    store.initialize(validation);
    const builder=store.assign({validation,sliceId:'core',role:'builder'});
    const critic=store.assign({validation,sliceId:'core',role:'critic'});
    store.transition({validation,token:builder.token,sliceId:'core',target:'building'});
    store.transition({validation,token:builder.token,sliceId:'core',target:'critiquing'});
    const evidence=store.recordExecution({validation,token:critic.token,sliceId:'core',testId:'core-test'});
    assert.throws(()=>store.transition({validation,token:critic.token,sliceId:'core',target:'passed',evidenceIds:[evidence.evidence_id]}),/independently captured/);
  } finally { store.close(); }
});

test('requires an external HMAC secret for release authority', () => {
  const p=pack(); const validation=validatePack(p.manifest); const store=new RunStore(p.root);
  try {
    store.initialize(validation);
    assert.throws(()=>store.authorizeRelease({target:'ghcr.io/x/y',version:'1.0.0',approval:'x'}),/AUTHORITY_SECRET/);
    const secret='authority-secret';
    const approval=crypto.createHmac('sha256',secret).update('ghcr.io/x/y\n1.0.0').digest('hex');
    assert.equal(store.authorizeRelease({target:'ghcr.io/x/y',version:'1.0.0',approval,authoritySecret:secret}).capability,'release');
  } finally { store.close(); }
});

function reconstructionPack(changes={}) {
  const extra=['source-evidence.yaml','product-reconstruction.yaml','experience-contract.yaml','production-readiness.yaml','claim-traceability.yaml'];
  const manifest=VALID['manifest.yaml'].replace('objective_id: demo\n','objective_id: demo\nreconstruction:\n  mode: mixed_evidence\n').replace(/files:\n([\s\S]*)/,m=>`${m}${extra.map(f=>`  - ${f}\n`).join('')}`);
  return pack({
    'manifest.yaml':manifest,
    'source-evidence.yaml':`claims:\n  - id: demo\n    source: { type: youtube, url: "https://example.test/video", timestamp: "00:30" }\n    observation: User exports a cited report.\n    classification: observed\n    confidence: high\n    falsifier: Export is identified as a mockup.\n  - id: auth\n    source: { type: other, locator: production analysis }\n    observation: Reports require tenant authorization.\n    classification: production-required\n    confidence: high\n    basis: Reports may contain private customer data.\n    falsifier: Product is constrained to single-user local operation.\n`,
    'product-reconstruction.yaml':`capabilities:\n  - id: export\n    description: Export a cited report.\n    origin: { classification: observed, evidence: [demo] }\n    required: true\n    acceptance: [core-test]\n  - id: tenant-auth\n    description: Authorize access to private reports.\n    origin: { classification: production-required, evidence: [auth] }\n    required: true\n    acceptance: [core-test]\n`,
    'experience-contract.yaml':`journeys:\n  - id: export-report\n    persona: analyst\n    trigger: completed analysis\n    steps: [open report, export report]\n    success_evidence: [downloaded artifact]\n`,
    'production-readiness.yaml':`functional: { journeys: true }\nreliability: { recovery: true }\nsecurity: { authorization: true }\noperations: { health: true }\ndistribution: { clean_install: true }\nevidence: { clean_room: true }\n`,
    'claim-traceability.yaml':`links:\n  - { claim_id: demo, capability_id: export, verification: [core-test] }\n  - { claim_id: auth, capability_id: tenant-auth, verification: [core-test] }\n`,
    ...changes
  });
}

test('validates multimodal evidence-to-production reconstruction packs',()=>{
  const p=reconstructionPack(); assert.equal(validatePack(p.manifest).valid,true);
});

test('rejects uncorroborated high-confidence social claims',()=>{
  const p=reconstructionPack({'source-evidence.yaml':`claims:\n  - id: demo\n    source: { type: x-post, url: "https://example.test/post" }\n    observation: Product supports audited exports.\n    classification: observed\n    confidence: high\n    falsifier: Product documentation contradicts the post.\n`});
  const codes=validatePack(p.manifest).errors.map(e=>e.code); assert.ok(codes.includes('SOCIAL_CORROBORATION'));
});

test('rejects required speculative capabilities and untraced material claims',()=>{
  const p=reconstructionPack({'product-reconstruction.yaml':`capabilities:\n  - id: export\n    description: Predict markets from comments.\n    origin: { classification: speculative, evidence: [demo] }\n    required: true\n    acceptance: [core-test]\n`,'claim-traceability.yaml':'links: []\n'});
  const codes=validatePack(p.manifest).errors.map(e=>e.code); assert.ok(codes.includes('SPECULATION_REQUIRED')); assert.ok(codes.includes('UNTRACED_MATERIAL_CLAIM'));
});
