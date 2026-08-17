import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assignLabels, evaluateAssertions, initialState, nextSlices, RunStore, tallyComparison, transition, validatePack } from '../src/engine.js';

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

test('a test with no declared assertions still means exit code zero', () => {
  assert.equal(evaluateAssertions({}, { exitCode: 0, stdout: '', stderr: '' }).satisfied, true);
  const failed = evaluateAssertions({}, { exitCode: 1, stdout: '', stderr: '' });
  assert.equal(failed.satisfied, false);
  assert.match(failed.failures[0], /exit_code was 1, expected 0/);
});

test('a negative test passes on its declared non-zero exit code', () => {
  const spec = { assertions: [{ exit_code: 4 }, { stdout_equals: '' }, { stderr_matches: '^csv2json: .*expected 3\\n$' }] };
  const observed = { exitCode: 4, stdout: '', stderr: 'csv2json: ragged.csv:3: record 3 has 2 fields; expected 3\n' };
  assert.equal(evaluateAssertions(spec, observed).satisfied, true);
  // The same command exiting 0 is now a failure, not a success.
  const wrong = evaluateAssertions(spec, { ...observed, exitCode: 0 });
  assert.equal(wrong.satisfied, false);
  assert.match(wrong.failures[0], /exit_code was 0, expected 4/);
});

test('unmet stream assertions fail even when the process exits successfully', () => {
  const contains = evaluateAssertions({ assertions: [{ exit_code: 0 }, { stdout_contains: 'PASS' }] }, { exitCode: 0, stdout: 'FAIL\n', stderr: '' });
  assert.equal(contains.satisfied, false);
  assert.match(contains.failures[0], /stdout did not contain "PASS"/);
  const matches = evaluateAssertions({ assertions: [{ stderr_matches: '^ready$' }] }, { exitCode: 0, stdout: '', stderr: 'not ready' });
  assert.equal(matches.satisfied, false);
});

test('unknown or malformed assertions fail closed rather than being ignored', () => {
  const unknown = evaluateAssertions({ assertions: [{ exit_code: 0 }, { stdout_looks_fine: true }] }, { exitCode: 0, stdout: '', stderr: '' });
  assert.equal(unknown.satisfied, false);
  assert.match(unknown.failures[0], /Unsupported assertion: stdout_looks_fine/);
  assert.equal(evaluateAssertions({ assertions: ['looks good'] }, { exitCode: 0, stdout: '', stderr: '' }).satisfied, false);
  assert.equal(evaluateAssertions({ assertions: [{ stdout_matches: '([' }] }, { exitCode: 0, stdout: '', stderr: '' }).satisfied, false);
});

test('declared assertions, not exit codes, decide which evidence can pass a slice', () => {
  const negative = `tests:\n  - id: core-test\n    slice_id: core\n    command: ["node", "-e", "process.stderr.write('boom\\\\n'); process.exit(4)"]\n    assertions:\n      - exit_code: 4\n      - stderr_contains: "boom"\n  - id: ui-test\n    slice_id: ui\n    command: ["node", "-e", "console.log('PASS')"]\n`;
  const p = pack({ 'acceptance-tests.yaml': negative });
  const validation = validatePack(p.manifest); const store = new RunStore(p.root);
  try {
    store.initialize(validation);
    const builder = store.assign({ validation, sliceId: 'core', role: 'builder' });
    const critic = store.assign({ validation, sliceId: 'core', role: 'critic' });
    store.transition({ validation, token: builder.token, sliceId: 'core', target: 'building' });
    const evidence = store.recordExecution({ validation, token: builder.token, sliceId: 'core', testId: 'core-test' });
    assert.equal(evidence.exit_code, 4, 'the command really did fail');
    assert.equal(evidence.satisfied, true, 'but it satisfied its declared assertions');
    store.transition({ validation, token: builder.token, sliceId: 'core', target: 'critiquing' });
    store.transition({ validation, token: critic.token, sliceId: 'core', target: 'passed', evidenceIds: [evidence.evidence_id] });
    assert.deepEqual(store.ready(validation), ['ui']);
  } finally { store.close(); }
});

test('evidence that misses its declared assertions cannot support a pass', () => {
  const mismatched = `tests:\n  - id: core-test\n    slice_id: core\n    command: ["node", "-e", "console.log('PASS')"]\n    assertions:\n      - exit_code: 0\n      - stdout_contains: "TOTALLY DIFFERENT"\n  - id: ui-test\n    slice_id: ui\n    command: ["node", "-e", "console.log('PASS')"]\n`;
  const p = pack({ 'acceptance-tests.yaml': mismatched });
  const validation = validatePack(p.manifest); const store = new RunStore(p.root);
  try {
    store.initialize(validation);
    const builder = store.assign({ validation, sliceId: 'core', role: 'builder' });
    const critic = store.assign({ validation, sliceId: 'core', role: 'critic' });
    store.transition({ validation, token: builder.token, sliceId: 'core', target: 'building' });
    const evidence = store.recordExecution({ validation, token: builder.token, sliceId: 'core', testId: 'core-test' });
    assert.equal(evidence.exit_code, 0, 'the process exited successfully');
    assert.equal(evidence.satisfied, false, 'yet the declared assertion was not met');
    store.transition({ validation, token: builder.token, sliceId: 'core', target: 'critiquing' });
    assert.throws(() => store.transition({ validation, token: critic.token, sliceId: 'core', target: 'passed', evidenceIds: [evidence.evidence_id] }), /did not satisfy its declared assertions/);
  } finally { store.close(); }
});

test('negated stream assertions let a pack forbid output such as stack traces', () => {
  const spec = { assertions: [{ exit_code: 3 }, { stderr_not_matches: 'at .*\\(.*:\\d+:\\d+\\)' }, { stdout_not_contains: 'Traceback' }] };
  assert.equal(evaluateAssertions(spec, { exitCode: 3, stdout: '', stderr: 'csv2json: cannot read missing.csv\n' }).satisfied, true);
  const leaked = evaluateAssertions(spec, { exitCode: 3, stdout: '', stderr: 'boom\n    at read (/app/src/cli.js:12:9)\n' });
  assert.equal(leaked.satisfied, false);
  assert.match(leaked.failures[0], /stderr did not avoid matching/);
});

test('qualitative judging must declare a panel, a threshold, and an inspectable bar', () => {
  const codes = doc => validatePack(pack({ 'critic-protocol.yaml': doc }).manifest).errors.map(e => e.code);
  assert.deepEqual(codes('isolation: { fresh_context: true }\n'), [], 'a pack without qualitative criteria is unaffected');
  const thin = codes('qualitative:\n  judges: 2\n  agreement: 0.5\n  criteria: []\n');
  assert.ok(thin.includes('JUDGE_COUNT'), 'two judges is not a panel');
  assert.ok(thin.includes('AGREEMENT_THRESHOLD'), 'a bare majority is not agreement');
  assert.ok(thin.includes('CRITERIA_EMPTY'));
  const bad = codes(`qualitative:\n  judges: 3\n  agreement: 0.67\n  criteria:\n    - id: polish\n      slice_id: nowhere\n      question: Which looks better?\n      candidate: "npm run shot"\n      artifact: out/a.png\n      reference: ""\n`);
  assert.ok(bad.includes('UNKNOWN_CRITERION_SLICE'));
  assert.ok(bad.includes('CANDIDATE_COMMAND'), 'a shell string is not an argv array');
  assert.ok(bad.includes('REFERENCE_BAR'), 'a criterion without a bar is unjudgeable');
});

test('the runtime, not the judge, decides which artifact is A', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(assignLabels().candidate);
  assert.deepEqual([...seen].sort(), ['A','B'], 'both orderings occur');
  const fixed = assignLabels('a-fixed-nonce');
  assert.equal(assignLabels('a-fixed-nonce').candidate, fixed.candidate, 'the mapping is reproducible from its recorded nonce');
  assert.notEqual(fixed.candidate, fixed.reference);
});

test('consensus is arithmetic on individual votes, never a judge\'s claim', () => {
  const labels = { candidate: 'B', reference: 'A' };
  const tally = (votes, extra = {}) => tallyComparison({ votes, labels, judges: 3, agreement: 0.66, ...extra });
  assert.equal(tally([{winner:'B'},{winner:'B'},{winner:'A'}]).outcome, 'won');
  assert.equal(tally([{winner:'A'},{winner:'A'},{winner:'B'}]).outcome, 'lost');
  // The declared threshold decides, not a bare majority: 0.67 across three judges is
  // 2.01 votes, so two agreeing judges are one short of the bar the pack asked for.
  assert.equal(tallyComparison({votes:[{winner:'B'},{winner:'B'},{winner:'A'}],labels,judges:3,agreement:0.67}).outcome, 'inconclusive');
  assert.equal(tallyComparison({votes:[{winner:'B'},{winner:'B'},{winner:'A'}],labels,judges:3,agreement:1}).outcome, 'inconclusive');
  assert.equal(tally([{winner:'B'},{winner:'A'},{winner:'tie'}]).outcome, 'inconclusive', 'a split panel is not approval');
  assert.equal(tally([{winner:'B'},{winner:'tie'},{winner:'tie'}]).outcome, 'inconclusive');
  assert.equal(tally([{winner:'B'},{winner:'tie'},{winner:'tie'}], {allowTie:true}).outcome, 'won', 'ties count for the candidate only when the criterion allows it');
  assert.equal(tally([{winner:'B'},{winner:'B'}]).outcome, 'inconclusive', 'a judge that failed to vote cannot be assumed to agree');
  assert.equal(tally([{winner:'B'},{winner:'B'},{winner:'yes please'}]).outcome, 'inconclusive', 'an unparseable vote is not a vote');
});

test('a threshold that silently demands unanimity is reported as a warning', () => {
  const strict = validatePack(pack({ 'critic-protocol.yaml': `qualitative:\n  judges: 3\n  agreement: 0.67\n  criteria:\n    - id: polish\n      slice_id: core\n      question: Which looks better?\n      candidate: ["node", "shot.js"]\n      artifact: out/a.png\n      reference: ref/bar.png\n` }).manifest);
  assert.equal(strict.valid, true, 'unanimity is legal, merely surprising');
  assert.ok(strict.warnings.some(w => w.code === 'EFFECTIVE_UNANIMITY'));
  const relaxed = validatePack(pack({ 'critic-protocol.yaml': `qualitative:\n  judges: 3\n  agreement: 0.66\n  criteria:\n    - id: polish\n      slice_id: core\n      question: Which looks better?\n      candidate: ["node", "shot.js"]\n      artifact: out/a.png\n      reference: ref/bar.png\n` }).manifest);
  assert.deepEqual(relaxed.warnings, [], 'a threshold one dissent can survive warns about nothing');
});

test('a declared clean room must be reproducible and scripted with argv arrays', () => {
  const codes = doc => validatePack(pack({ 'final-verification.yaml': doc }).manifest).errors.map(e => e.code);
  assert.deepEqual(codes('clean_room: true\n'), [], 'runs defaults to two');
  assert.deepEqual(codes('clean_room: false\nruns: 1\n'), [], 'a pack that claims no clean room is not held to one');
  assert.ok(codes('clean_room: true\nruns: 1\n').includes('CLEAN_ROOM_RUNS'), 'a single run proves nothing about reproducibility');
  assert.ok(codes('clean_room: true\nsetup:\n  - "npm ci && npm run build"\n').includes('CLEAN_ROOM_SETUP'), 'a shell string is not an argv array');
});

// A refused outcome is the one part of a pack nothing in the repository can supply,
// and the part most easily reduced to decoration.
const refusing = body => ({ 'objective.yaml': `outcome: working product\nrefused_outcomes:\n${body}` });

test('a refused outcome that no test would catch is a compilation defect', () => {
  const { manifest } = pack(refusing('  - id: silent-drop\n    statement: It must never skip a row without telling me.\n    verified_by: []\n'));
  const v = validatePack(manifest);
  assert.equal(v.valid, false);
  assert.ok(v.errors.some(e => e.code === 'REFUSED_OUTCOME_UNVERIFIED'), 'an unverified refusal is not a bar');
});

test('a refused outcome cannot point at a test that does not exist', () => {
  const { manifest } = pack(refusing('  - id: stale\n    statement: It must never show stale prices as current.\n    verified_by: [no-such-test]\n'));
  const v = validatePack(manifest);
  assert.equal(v.valid, false);
  assert.ok(v.errors.some(e => e.code === 'REFUSED_OUTCOME_UNKNOWN_TEST'));
});

test('two refused outcomes cannot share an id', () => {
  const { manifest } = pack(refusing(
    '  - id: stale\n    statement: One.\n    verified_by: [core-test]\n' +
    '  - id: stale\n    statement: Two.\n    verified_by: [ui-test]\n'));
  assert.ok(validatePack(manifest).errors.some(e => /Duplicate refused outcome/.test(e.message)));
});

test('a refused outcome tied to a real test validates, and omitting the section stays legal', () => {
  const tied = pack(refusing('  - id: stale\n    statement: It must never show stale prices as current.\n    verified_by: [core-test, ui-test]\n'));
  assert.equal(validatePack(tied.manifest).valid, true, 'a refusal naming real tests is well formed');
  assert.equal(validatePack(pack().manifest).valid, true, 'packs compiled before this contract still validate');
});
