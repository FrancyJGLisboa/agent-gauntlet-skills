import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import YAML from 'yaml';

export const REQUIRED_FILES = [
  'manifest.yaml', 'objective.yaml', 'evidence.yaml', 'reference-contract.yaml',
  'target-contracts.yaml', 'semantic-mappings.yaml', 'architecture-decisions.yaml',
  'distribution-contract.yaml', 'uncertainties.yaml', 'execution-dag.yaml',
  'acceptance-tests.yaml', 'critic-protocol.yaml', 'stop-policy.yaml',
  'final-verification.yaml'
];
export const RECONSTRUCTION_FILES = [
  'source-evidence.yaml', 'product-reconstruction.yaml', 'experience-contract.yaml',
  'production-readiness.yaml', 'claim-traceability.yaml'
];
const RECONSTRUCTION_MODES = new Set(['youtube_demonstration','blog_description','social_discussion','screenshots','live_product','research_paper','mixed_evidence']);

export const STATES = ['pending', 'building', 'critiquing', 'repairing', 'passed', 'failed', 'blocked', 'final_verification', 'verified'];
const TRANSITIONS = {
  pending: ['building', 'blocked'],
  building: ['critiquing', 'repairing', 'failed', 'blocked'],
  critiquing: ['passed', 'repairing', 'failed', 'blocked'],
  repairing: ['building', 'failed', 'blocked'],
  passed: ['final_verification'],
  final_verification: ['verified', 'repairing', 'failed', 'blocked'],
  failed: [], blocked: [], verified: []
};

function issue(code, message, file, pointer = '') { return { code, message, file, pointer }; }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function asArray(value) { return Array.isArray(value) ? value : []; }

export function readYaml(file) {
  return YAML.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(data) { return crypto.createHash('sha256').update(data).digest('hex'); }

export function packFingerprint(root, files = REQUIRED_FILES) {
  const hash = crypto.createHash('sha256');
  for (const name of [...files].sort()) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) throw new Error(`Cannot fingerprint missing file: ${name}`);
    hash.update(name); hash.update('\0'); hash.update(fs.readFileSync(file)); hash.update('\0');
  }
  return hash.digest('hex');
}

function validateReconstruction(documents, errors) {
  const evidence=documents['source-evidence.yaml'];
  const claims=asArray(evidence?.claims); const claimIds=new Set();
  if(!claims.length) errors.push(issue('SOURCE_EVIDENCE_EMPTY','Reconstruction requires at least one source claim','source-evidence.yaml','claims'));
  const classifications=new Set(['observed','corroborated','inferred','production-required','speculative','unknown','prohibited']);
  const sourceTypes=new Set(['youtube','blog','x-post','social-comment','screenshot','live-product','repository','research-paper','other']);
  for(const [i,c] of claims.entries()) {
    const p=`claims[${i}]`; requireKeys(c,['id','source','observation','classification','confidence','falsifier'],'source-evidence.yaml',errors);
    if(claimIds.has(c.id)) errors.push(issue('DUPLICATE_CLAIM',`Duplicate claim id: ${c.id}`,'source-evidence.yaml',`${p}.id`)); claimIds.add(c.id);
    if(!sourceTypes.has(c.source?.type)) errors.push(issue('SOURCE_TYPE','Unsupported source type','source-evidence.yaml',`${p}.source.type`));
    if(!classifications.has(c.classification)) errors.push(issue('CLAIM_CLASS','Unsupported claim classification','source-evidence.yaml',`${p}.classification`));
    if(['x-post','social-comment'].includes(c.source?.type)&&c.confidence==='high'&&!asArray(c.corroborated_by).length) errors.push(issue('SOCIAL_CORROBORATION','High-confidence social claims require independent corroboration','source-evidence.yaml',`${p}.corroborated_by`));
    if(['inferred','production-required'].includes(c.classification)&&!c.basis) errors.push(issue('CLAIM_BASIS',`${c.classification} claims require a basis`,'source-evidence.yaml',`${p}.basis`));
  }
  for(const c of claims) for(const id of asArray(c.corroborated_by)) if(!claimIds.has(id)) errors.push(issue('UNKNOWN_CORROBORATION',`Unknown corroborating claim: ${id}`,'source-evidence.yaml',c.id));

  const reconstruction=documents['product-reconstruction.yaml']; const capabilities=asArray(reconstruction?.capabilities); const capabilityIds=new Set();
  if(!capabilities.length) errors.push(issue('RECONSTRUCTION_EMPTY','At least one reconstructed capability is required','product-reconstruction.yaml','capabilities'));
  for(const [i,c] of capabilities.entries()) {
    const p=`capabilities[${i}]`; requireKeys(c,['id','description','origin','acceptance'],'product-reconstruction.yaml',errors); capabilityIds.add(c.id);
    for(const id of asArray(c.origin?.evidence)) if(!claimIds.has(id)) errors.push(issue('UNKNOWN_CLAIM',`Capability references unknown claim: ${id}`,'product-reconstruction.yaml',`${p}.origin.evidence`));
    if(c.origin?.classification==='speculative'&&c.required!==false) errors.push(issue('SPECULATION_REQUIRED','Speculative capabilities must be explicitly optional','product-reconstruction.yaml',p));
    if(c.origin?.classification==='prohibited') errors.push(issue('PROHIBITED_CAPABILITY','Prohibited evidence cannot become a capability','product-reconstruction.yaml',p));
    if(!asArray(c.acceptance).length) errors.push(issue('CAPABILITY_ACCEPTANCE','Capability requires executable or observable acceptance criteria','product-reconstruction.yaml',`${p}.acceptance`));
  }

  const experience=documents['experience-contract.yaml']; const journeys=asArray(experience?.journeys);
  if(!journeys.length) errors.push(issue('EXPERIENCE_EMPTY','At least one critical user journey is required','experience-contract.yaml','journeys'));
  for(const [i,j] of journeys.entries()) { requireKeys(j,['id','persona','trigger','steps','success_evidence'],'experience-contract.yaml',errors); if(!asArray(j.steps).length) errors.push(issue('JOURNEY_STEPS','Journey requires observable steps','experience-contract.yaml',`journeys[${i}].steps`)); }

  const readiness=documents['production-readiness.yaml'];
  for(const section of ['functional','reliability','security','operations','distribution','evidence']) if(!isObject(readiness?.[section])||!Object.keys(readiness[section]).length) errors.push(issue('READINESS_SECTION',`Missing or empty production-readiness section: ${section}`,'production-readiness.yaml',section));

  const trace=asArray(documents['claim-traceability.yaml']?.links); const linkedClaims=new Set();
  for(const [i,l] of trace.entries()) {
    requireKeys(l,['claim_id','capability_id','verification'],'claim-traceability.yaml',errors); linkedClaims.add(l.claim_id);
    if(!claimIds.has(l.claim_id)) errors.push(issue('TRACE_UNKNOWN_CLAIM',`Trace references unknown claim: ${l.claim_id}`,'claim-traceability.yaml',`links[${i}].claim_id`));
    if(!capabilityIds.has(l.capability_id)) errors.push(issue('TRACE_UNKNOWN_CAPABILITY',`Trace references unknown capability: ${l.capability_id}`,'claim-traceability.yaml',`links[${i}].capability_id`));
    if(!asArray(l.verification).length) errors.push(issue('TRACE_VERIFICATION','Trace link requires verification','claim-traceability.yaml',`links[${i}].verification`));
  }
  for(const c of claims.filter(c=>['observed','corroborated','production-required'].includes(c.classification))) if(!linkedClaims.has(c.id)) errors.push(issue('UNTRACED_MATERIAL_CLAIM',`Material claim is not traced to a capability: ${c.id}`,'claim-traceability.yaml','links'));
}

function requireKeys(doc, keys, file, errors) {
  if (!isObject(doc)) {
    errors.push(issue('DOCUMENT_TYPE', 'Document must be a mapping', file));
    return;
  }
  for (const key of keys) if (!(key in doc)) errors.push(issue('REQUIRED_KEY', `Missing required key: ${key}`, file, key));
}

function validateArchitecture(doc, file, errors) {
  const decisions = asArray(doc?.decisions ?? doc?.components ?? doc);
  if (!decisions.length) return errors.push(issue('ARCHITECTURE_EMPTY', 'At least one architecture decision is required', file));
  for (const [i, d] of decisions.entries()) {
    const p = `decisions[${i}]`;
    requireKeys(d, ['component', 'workload', 'candidates', 'selected', 'evidence', 'reconsider_when'], file, errors);
    if (asArray(d?.candidates).length < 2 && !d?.external_constraint) errors.push(issue('ARCHITECTURE_CANDIDATES', 'Provide at least two candidates or an external_constraint', file, `${p}.candidates`));
    if (!asArray(d?.evidence).length) errors.push(issue('ARCHITECTURE_EVIDENCE', 'Selection requires evidence', file, `${p}.evidence`));
    if (!isObject(d?.workload) || !Object.keys(d.workload).length) errors.push(issue('WORKLOAD_BUDGET', 'Workload budgets cannot be empty', file, `${p}.workload`));
    if (!asArray(d?.reconsider_when).length) errors.push(issue('RECONSIDER_TRIGGER', 'At least one reconsideration trigger is required', file, `${p}.reconsider_when`));
    if (String(d?.selected).toLowerCase() === 'rust' && asArray(d?.evidence).every(e => !/benchmark|constraint|profile|latency|memory|safety/i.test(String(typeof e === 'string' ? e : JSON.stringify(e))))) {
      errors.push(issue('RUST_JUSTIFICATION', 'Rust selection requires benchmark or explicit constraint evidence', file, `${p}.evidence`));
    }
  }
}

function validateDistribution(doc, file, errors) {
  requireKeys(doc, ['personas', 'artifacts', 'requirements'], file, errors);
  if (!asArray(doc?.personas).length && !isObject(doc?.personas)) errors.push(issue('DISTRIBUTION_PERSONAS', 'At least one distribution persona is required', file, 'personas'));
  if (!asArray(doc?.artifacts).length) errors.push(issue('DISTRIBUTION_ARTIFACTS', 'At least one distributable artifact is required', file, 'artifacts'));
  const requirements = doc?.requirements ?? {};
  for (const key of ['clean_install', 'upgrade', 'rollback', 'checksums']) {
    if (!(key in requirements)) errors.push(issue('DISTRIBUTION_LIFECYCLE', `Missing lifecycle requirement: ${key}`, file, `requirements.${key}`));
  }
}

function validateMappings(doc, file, errors) {
  const mappings = asArray(doc?.mappings ?? doc);
  const allowed = new Set(['equivalent', 'transformable', 'proxy', 'unavailable', 'unknown']);
  for (const [i, m] of mappings.entries()) {
    if (!allowed.has(m?.classification)) errors.push(issue('MAPPING_CLASS', 'Invalid semantic mapping classification', file, `mappings[${i}].classification`));
    if (m?.classification === 'equivalent' && !m?.evidence) errors.push(issue('EQUIVALENCE_EVIDENCE', 'Equivalent mappings require evidence', file, `mappings[${i}].evidence`));
    if (!m?.validation) errors.push(issue('MAPPING_VALIDATION', 'Every mapping requires a validation method', file, `mappings[${i}].validation`));
  }
}

function validateDag(doc, file, errors) {
  const slices = asArray(doc?.slices);
  if (!slices.length) return errors.push(issue('DAG_EMPTY', 'Execution DAG requires at least one slice', file, 'slices'));
  const ids = new Set();
  for (const [i, s] of slices.entries()) {
    requireKeys(s, ['id', 'depends_on', 'builder', 'critic', 'acceptance_tests'], file, errors);
    if (ids.has(s.id)) errors.push(issue('DUPLICATE_SLICE', `Duplicate slice id: ${s.id}`, file, `slices[${i}].id`));
    ids.add(s.id);
  }
  for (const [i, s] of slices.entries()) for (const dep of asArray(s.depends_on)) if (!ids.has(dep)) errors.push(issue('UNKNOWN_DEPENDENCY', `Unknown dependency: ${dep}`, file, `slices[${i}].depends_on`));
  const visiting = new Set(), visited = new Set(), byId = new Map(slices.map(s => [s.id, s]));
  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dep of asArray(byId.get(id)?.depends_on)) if (visit(dep)) return true;
    visiting.delete(id); visited.add(id); return false;
  }
  if ([...ids].some(visit)) errors.push(issue('DAG_CYCLE', 'Execution DAG contains a cycle', file, 'slices'));
}

// A declared assertion is the pack's definition of success for one test. Without
// this, the runtime scored every test as `exit_code === 0`, so a negative test
// (`exit_code: 4`) could never pass and stdout/stderr expectations were inert.
function matches(pattern, actual, key, failures) {
  let expression;
  try { expression = new RegExp(String(pattern)); }
  catch (error) { failures.push(`${key} is not a valid regular expression: ${error.message}`); return null; }
  return expression.test(actual);
}
const OPERATORS = {
  equals: (a, e) => a === String(e),
  contains: (a, e) => a.includes(String(e)),
  not_contains: (a, e) => !a.includes(String(e)),
  matches: (a, e, k, f) => matches(e, a, k, f),
  not_matches: (a, e, k, f) => { const hit = matches(e, a, k, f); return hit === null ? null : !hit; }
};
const DESCRIPTIONS = { equals: 'equal', contains: 'contain', not_contains: 'omit', matches: 'match', not_matches: 'avoid matching' };
const STREAM_ASSERTIONS = new Map(['stdout','stderr'].flatMap(s => Object.keys(OPERATORS).map(o => [`${s}_${o}`, [s, o]])));
export function evaluateAssertions(spec, { exitCode, stdout, stderr }) {
  const declared = asArray(spec?.assertions);
  if (!declared.length) return { satisfied: exitCode === 0, failures: exitCode === 0 ? [] : [`exit_code was ${exitCode}, expected 0`] };
  const failures = [], streams = { stdout: stdout ?? '', stderr: stderr ?? '' };
  for (const assertion of declared) {
    if (!isObject(assertion)) { failures.push(`Assertion is not a mapping: ${JSON.stringify(assertion)}`); continue; }
    for (const [key, expected] of Object.entries(assertion)) {
      if (key === 'exit_code') { if (exitCode !== expected) failures.push(`exit_code was ${exitCode}, expected ${expected}`); continue; }
      const target = STREAM_ASSERTIONS.get(key);
      if (!target) { failures.push(`Unsupported assertion: ${key}`); continue; }
      const [stream, operator] = target;
      const held = OPERATORS[operator](streams[stream], expected, key, failures);
      if (held === false) failures.push(`${stream} did not ${DESCRIPTIONS[operator]} ${JSON.stringify(String(expected))}`);
    }
  }
  return { satisfied: failures.length === 0, failures };
}

export function validatePack(manifestPath = '.gauntlet/manifest.yaml') {
  const absoluteManifest = path.resolve(manifestPath);
  const root = path.dirname(absoluteManifest);
  const errors = [], warnings = [], documents = {};
  for (const name of REQUIRED_FILES) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) { errors.push(issue('MISSING_FILE', `Missing required file: ${name}`, name)); continue; }
    try { documents[name] = readYaml(file); }
    catch (error) { errors.push(issue('INVALID_YAML', error.message, name)); }
  }
  const manifest = documents['manifest.yaml'];
  const reconstructionMode=manifest?.reconstruction?.mode;
  const reconstructionEnabled=RECONSTRUCTION_MODES.has(reconstructionMode);
  const requiredFiles=reconstructionEnabled?[...REQUIRED_FILES,...RECONSTRUCTION_FILES]:[...REQUIRED_FILES];
  if(reconstructionEnabled) for(const name of RECONSTRUCTION_FILES) {
    const file=path.join(root,name);
    if(!fs.existsSync(file)){errors.push(issue('MISSING_RECONSTRUCTION_FILE',`Missing reconstruction file: ${name}`,name));continue;}
    try{documents[name]=readYaml(file);}catch(error){errors.push(issue('INVALID_YAML',error.message,name));}
  }
  if (manifest) {
    requireKeys(manifest, ['gauntlet_version', 'status', 'objective_id', 'execution', 'human_dependency', 'files'], 'manifest.yaml', errors);
    if (!['executable', 'conditionally_executable', 'blocked'].includes(manifest.status)) errors.push(issue('MANIFEST_STATUS', 'Invalid manifest status', 'manifest.yaml', 'status'));
    if ((manifest.execution?.maximum_repairs_per_slice ?? 4) > 3) errors.push(issue('REPAIR_LIMIT', 'maximum_repairs_per_slice cannot exceed 3', 'manifest.yaml', 'execution.maximum_repairs_per_slice'));
    const declared = new Set(asArray(manifest.files).map(v => typeof v === 'string' ? v : v?.path));
    for (const name of requiredFiles) if (!declared.has(name)) errors.push(issue('FILE_INDEX', `Manifest file index does not declare ${name}`, 'manifest.yaml', 'files'));
  }
  if (documents['architecture-decisions.yaml']) validateArchitecture(documents['architecture-decisions.yaml'], 'architecture-decisions.yaml', errors);
  if (documents['distribution-contract.yaml']) validateDistribution(documents['distribution-contract.yaml'], 'distribution-contract.yaml', errors);
  if (documents['semantic-mappings.yaml']) validateMappings(documents['semantic-mappings.yaml'], 'semantic-mappings.yaml', errors);
  if (documents['execution-dag.yaml']) validateDag(documents['execution-dag.yaml'], 'execution-dag.yaml', errors);
  if(reconstructionEnabled) validateReconstruction(documents,errors);
  const stop = documents['stop-policy.yaml'];
  if (stop && (stop.retry?.maximum_repairs_per_slice ?? 4) > 3) errors.push(issue('REPAIR_LIMIT', 'Stop policy repair limit cannot exceed 3', 'stop-policy.yaml', 'retry.maximum_repairs_per_slice'));
  return { valid: errors.length === 0, root, errors, warnings, documents, requiredFiles,
    fingerprint: errors.some(e => ['MISSING_FILE','MISSING_RECONSTRUCTION_FILE','INVALID_YAML'].includes(e.code)) ? null : packFingerprint(root,requiredFiles) };
}

export class RunStore {
  constructor(root) {
    this.root = root;
    this.file = path.join(root, 'run-state.sqlite');
    this.db = new DatabaseSync(this.file);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS slices (id TEXT PRIMARY KEY, state TEXT NOT NULL, repairs INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS assignments (
        id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, slice_id TEXT NOT NULL,
        role TEXT NOT NULL, fingerprint TEXT NOT NULL, created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL, revoked_at TEXT
      );
      CREATE TABLE IF NOT EXISTS evidence (
        id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL, slice_id TEXT NOT NULL,
        test_id TEXT NOT NULL, fingerprint TEXT NOT NULL, captured_at TEXT NOT NULL,
        command_json TEXT NOT NULL, cwd TEXT NOT NULL, exit_code INTEGER,
        signal TEXT, stdout_sha256 TEXT NOT NULL, stderr_sha256 TEXT NOT NULL,
        artifact_path TEXT NOT NULL, git_commit TEXT, git_dirty INTEGER NOT NULL,
        satisfied INTEGER NOT NULL DEFAULT 0, assertion_failures TEXT NOT NULL DEFAULT '[]',
        FOREIGN KEY(assignment_id) REFERENCES assignments(id)
      );
      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, slice_id TEXT NOT NULL,
        from_state TEXT NOT NULL, to_state TEXT NOT NULL, assignment_id TEXT NOT NULL,
        reason TEXT NOT NULL, evidence_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS authorities (
        capability TEXT NOT NULL, target TEXT NOT NULL, version TEXT NOT NULL,
        granted_at TEXT NOT NULL, approval_hash TEXT NOT NULL,
        PRIMARY KEY(capability, target, version)
      );
    `);
  }
  close() { this.db.close(); }
  getMeta(key) { return this.db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value; }
  setMeta(key, value) { this.db.prepare('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)').run(key, String(value)); }
  assertFingerprint(fingerprint) {
    const stored = this.getMeta('pack_fingerprint');
    if (!stored) throw new Error('Run is not initialized');
    if (stored !== fingerprint) throw new Error(`Pack fingerprint changed: expected ${stored}, observed ${fingerprint}; recompile before continuing`);
  }
  initialize(validation) {
    if (!validation.valid) throw new Error('Cannot initialize an invalid pack');
    if (this.getMeta('pack_fingerprint')) throw new Error('Run already initialized');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.setMeta('pack_fingerprint', validation.fingerprint);
      this.setMeta('created_at', new Date().toISOString());
      for (const slice of asArray(validation.documents['execution-dag.yaml']?.slices)) this.db.prepare('INSERT INTO slices(id,state,repairs) VALUES(?,?,0)').run(slice.id, 'pending');
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return this.status();
  }
  status() {
    return { fingerprint: this.getMeta('pack_fingerprint'), slices: this.db.prepare('SELECT id,state,repairs FROM slices ORDER BY id').all(), events: this.db.prepare('SELECT * FROM events ORDER BY seq').all() };
  }
  ready(validation) {
    const states = new Map(this.db.prepare('SELECT id,state FROM slices').all().map(s => [s.id, s.state]));
    return asArray(validation.documents['execution-dag.yaml']?.slices).filter(s => states.get(s.id) === 'pending' && asArray(s.depends_on).every(d => ['passed','verified'].includes(states.get(d)))).map(s => s.id);
  }
  assign({ validation, sliceId, role, ttlSeconds = 3600 }) {
    this.assertFingerprint(validation.fingerprint);
    if (!['builder','critic','verifier','engine'].includes(role)) throw new Error(`Invalid role: ${role}`);
    const slice = this.db.prepare('SELECT id FROM slices WHERE id=?').get(sliceId);
    if (!slice) throw new Error(`Unknown slice: ${sliceId}`);
    const id = crypto.randomUUID(), token = `gcap_${crypto.randomBytes(32).toString('base64url')}`;
    const now = new Date(), expires = new Date(now.getTime() + ttlSeconds * 1000);
    this.db.prepare('INSERT INTO assignments VALUES(?,?,?,?,?,?,?,NULL)').run(id, sha256(token), sliceId, role, validation.fingerprint, now.toISOString(), expires.toISOString());
    return { assignment_id:id, token, slice_id:sliceId, role, expires_at:expires.toISOString() };
  }
  authenticate(token, sliceId, roles) {
    if (!token) throw new Error('Assignment capability token is required');
    const a = this.db.prepare('SELECT * FROM assignments WHERE token_hash=?').get(sha256(token));
    if (!a || a.revoked_at) throw new Error('Invalid or revoked assignment capability');
    if (Date.parse(a.expires_at) <= Date.now()) throw new Error('Assignment capability expired');
    if (a.slice_id !== sliceId) throw new Error('Assignment capability is bound to another slice');
    if (!roles.includes(a.role)) throw new Error(`Role ${a.role} cannot perform this action`);
    if (a.fingerprint !== this.getMeta('pack_fingerprint')) throw new Error('Assignment belongs to another pack fingerprint');
    return a;
  }
  recordExecution({ validation, token, sliceId, testId, workspaceRoot }) {
    this.assertFingerprint(validation.fingerprint);
    const assignment = this.authenticate(token, sliceId, ['builder','critic','verifier']);
    const tests = asArray(validation.documents['acceptance-tests.yaml']?.tests);
    const spec = tests.find(t => t.id === testId && (!t.slice_id || t.slice_id === sliceId));
    if (!spec) throw new Error(`Undeclared acceptance test: ${testId}`);
    if (!Array.isArray(spec.command) || !spec.command.length || spec.command.some(v => typeof v !== 'string')) throw new Error('Test command must be a non-empty argv array; shell strings are prohibited');
    const executionRoot=workspaceRoot?path.resolve(workspaceRoot,'.gauntlet'):validation.root;
    const cwd = path.resolve(executionRoot, spec.cwd ?? '..');
    const allowedRoot = path.resolve(executionRoot, '..');
    if (cwd !== allowedRoot && !cwd.startsWith(`${allowedRoot}${path.sep}`)) throw new Error('Test cwd escapes the repository root');
    const started = new Date().toISOString();
    const result = spawnSync(spec.command[0], spec.command.slice(1), { cwd, encoding:'utf8', timeout: spec.timeout_ms ?? 300000,
      env: Object.fromEntries((spec.env_allowlist ?? ['PATH','HOME','TMPDIR']).filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]])) });
    const completed = new Date().toISOString();
    const stdout = result.stdout ?? '', stderr = result.stderr ?? '';
    const id = crypto.randomUUID(), evidenceDir = path.join(validation.root, 'runs', sliceId);
    fs.mkdirSync(evidenceDir, { recursive:true });
    const artifactPath = path.join(evidenceDir, `${testId}-${id}.json`);
    let gitCommit = null, gitDirty = true;
    const rev = spawnSync('git',['rev-parse','HEAD'],{cwd,encoding:'utf8'}); if(rev.status===0) gitCommit=rev.stdout.trim();
    const dirty = spawnSync('git',['status','--porcelain'],{cwd,encoding:'utf8'}); if(dirty.status===0) gitDirty=dirty.stdout.trim().length>0;
    const verdict = evaluateAssertions(spec, { exitCode: result.status, stdout, stderr });
    const artifact = { evidence_id:id, assignment_id:assignment.id, slice_id:sliceId, test_id:testId,
      pack_fingerprint:validation.fingerprint, started_at:started, completed_at:completed,
      command:spec.command, cwd, exit_code:result.status, signal:result.signal, stdout, stderr,
      stdout_sha256:sha256(stdout), stderr_sha256:sha256(stderr), git_commit:gitCommit, git_dirty:gitDirty,
      assertions:asArray(spec.assertions), satisfied:verdict.satisfied, assertion_failures:verdict.failures,
      node_version:process.version, platform:process.platform, arch:process.arch };
    fs.writeFileSync(artifactPath, `${JSON.stringify(artifact,null,2)}\n`, { mode:0o600 });
    this.db.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, assignment.id, sliceId, testId, validation.fingerprint, completed, JSON.stringify(spec.command), cwd, result.status, result.signal, artifact.stdout_sha256, artifact.stderr_sha256, artifactPath, gitCommit, gitDirty?1:0, verdict.satisfied?1:0, JSON.stringify(verdict.failures));
    return artifact;
  }
  transition({ validation, token, sliceId, target, evidenceIds = [], reason = '' }) {
    this.assertFingerprint(validation.fingerprint);
    const roles = target === 'passed' ? ['critic'] : target === 'verified' ? ['verifier'] : target === 'building' ? ['builder'] : ['builder','critic','verifier','engine'];
    const assignment = this.authenticate(token, sliceId, roles);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT * FROM slices WHERE id=?').get(sliceId);
      if (!row) throw new Error(`Unknown slice: ${sliceId}`);
      if (!TRANSITIONS[row.state]?.includes(target)) throw new Error(`Illegal transition: ${row.state} -> ${target}`);
      if (target === 'building' && row.state === 'pending' && !this.ready(validation).includes(sliceId)) throw new Error('Slice dependencies have not passed');
      if (['passed','verified'].includes(target)) {
        if (!evidenceIds.length) throw new Error(`${target} requires CLI-captured evidence`);
        for (const id of evidenceIds) {
          const e = this.db.prepare('SELECT * FROM evidence WHERE id=? AND slice_id=? AND fingerprint=?').get(id, sliceId, validation.fingerprint);
          if (!e) throw new Error(`Evidence is missing, stale, or belongs to another slice: ${id}`);
          if (!e.satisfied) throw new Error(`Evidence did not satisfy its declared assertions and cannot support ${target}: ${id} (${JSON.parse(e.assertion_failures ?? '[]').join('; ') || `exit_code ${e.exit_code}`})`);
          if (assignment.role === 'critic' && e.assignment_id === assignment.id) throw new Error('Critic verdict must rely on independently captured execution, not its own manufactured evidence');
        }
      }
      let repairs=row.repairs;
      if(target==='repairing') { repairs++; const limit=validation.documents['stop-policy.yaml']?.retry?.maximum_repairs_per_slice??3; if(repairs>limit) throw new Error(`Repair limit exceeded (${limit})`); }
      this.db.prepare('UPDATE slices SET state=?,repairs=? WHERE id=?').run(target,repairs,sliceId);
      this.db.prepare('INSERT INTO events(at,slice_id,from_state,to_state,assignment_id,reason,evidence_json) VALUES(?,?,?,?,?,?,?)').run(new Date().toISOString(),sliceId,row.state,target,assignment.id,reason,JSON.stringify(evidenceIds));
      this.db.exec('COMMIT');
      return { slice:sliceId, from:row.state, to:target, role:assignment.role, evidence:evidenceIds };
    } catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
  authorizeRelease({ target, version, approval, authoritySecret }) {
    if (!authoritySecret) throw new Error('GAUNTLET_AUTHORITY_SECRET is required and must remain outside agent context');
    const expected = crypto.createHmac('sha256', authoritySecret).update(`${target}\n${version}`).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(approval)))) throw new Error('Invalid release authority signature');
    this.db.prepare('INSERT OR REPLACE INTO authorities VALUES(?,?,?,?,?)').run('release',target,version,new Date().toISOString(),sha256(approval));
    return { capability:'release', target, version };
  }
}

export function initialState(validation) {
  const slices = asArray(validation.documents['execution-dag.yaml']?.slices);
  return {
    gauntlet_version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    slices: Object.fromEntries(slices.map(s => [s.id, { state: 'pending', repairs: 0, evidence: [], history: [] }])),
    history: []
  };
}

export function loadState(root) {
  const file = path.join(root, 'run-state.json');
  if (!fs.existsSync(file)) throw new Error('Run state does not exist; run `gauntlet init` first');
  return { file, state: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

export function saveState(file, state) {
  state.updated_at = new Date().toISOString();
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

export function nextSlices(validation, state) {
  const slices = asArray(validation.documents['execution-dag.yaml']?.slices);
  return slices.filter(s => state.slices[s.id]?.state === 'pending' && asArray(s.depends_on).every(d => ['passed', 'verified'].includes(state.slices[d]?.state))).map(s => s.id);
}

function evidenceDigest(file) {
  const data = fs.readFileSync(file);
  return { path: path.resolve(file), sha256: crypto.createHash('sha256').update(data).digest('hex'), bytes: data.length };
}

export function transition({ validation, state, sliceId, target, actor, evidenceFiles = [], reason = '', publishAuthorized = false }) {
  const slice = state.slices[sliceId];
  if (!slice) throw new Error(`Unknown slice: ${sliceId}`);
  if (!STATES.includes(target)) throw new Error(`Unknown state: ${target}`);
  if (!TRANSITIONS[slice.state].includes(target)) throw new Error(`Illegal transition: ${slice.state} -> ${target}`);
  if (target === 'building' && slice.state === 'pending' && !nextSlices(validation, state).includes(sliceId)) throw new Error('Slice dependencies have not passed');
  if (target === 'passed' && actor !== 'critic') throw new Error('Only an independent critic can pass a slice');
  if (target === 'verified' && actor !== 'verifier') throw new Error('Only a clean-room verifier can verify a run');
  if (['passed', 'verified'].includes(target) && evidenceFiles.length === 0) throw new Error(`${target} requires evidence artifacts`);
  if (target === 'repairing') {
    slice.repairs += 1;
    const limit = validation.documents['stop-policy.yaml']?.retry?.maximum_repairs_per_slice ?? 3;
    if (slice.repairs > limit) throw new Error(`Repair limit exceeded (${limit})`);
  }
  if (/publish|release|deploy/i.test(reason) && !publishAuthorized) throw new Error('Publishing or deployment requires explicit authorization');
  const evidence = evidenceFiles.map(evidenceDigest);
  const event = { at: new Date().toISOString(), slice: sliceId, from: slice.state, to: target, actor, reason, evidence };
  slice.state = target; slice.evidence.push(...evidence); slice.history.push(event); state.history.push(event);
  return event;
}
