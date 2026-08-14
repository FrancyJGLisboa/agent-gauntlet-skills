import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export const REQUIRED_FILES = [
  'manifest.yaml', 'objective.yaml', 'evidence.yaml', 'reference-contract.yaml',
  'target-contracts.yaml', 'semantic-mappings.yaml', 'architecture-decisions.yaml',
  'distribution-contract.yaml', 'uncertainties.yaml', 'execution-dag.yaml',
  'acceptance-tests.yaml', 'critic-protocol.yaml', 'stop-policy.yaml',
  'final-verification.yaml'
];

export const STATES = ['pending', 'building', 'critiquing', 'repairing', 'passed', 'failed', 'blocked', 'final_verification', 'verified'];
const TRANSITIONS = {
  pending: ['building', 'blocked'],
  building: ['critiquing', 'failed', 'blocked'],
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
  if (manifest) {
    requireKeys(manifest, ['gauntlet_version', 'status', 'objective_id', 'execution', 'human_dependency', 'files'], 'manifest.yaml', errors);
    if (!['executable', 'conditionally_executable', 'blocked'].includes(manifest.status)) errors.push(issue('MANIFEST_STATUS', 'Invalid manifest status', 'manifest.yaml', 'status'));
    if ((manifest.execution?.maximum_repairs_per_slice ?? 4) > 3) errors.push(issue('REPAIR_LIMIT', 'maximum_repairs_per_slice cannot exceed 3', 'manifest.yaml', 'execution.maximum_repairs_per_slice'));
    const declared = new Set(asArray(manifest.files).map(v => typeof v === 'string' ? v : v?.path));
    for (const name of REQUIRED_FILES) if (!declared.has(name)) errors.push(issue('FILE_INDEX', `Manifest file index does not declare ${name}`, 'manifest.yaml', 'files'));
  }
  if (documents['architecture-decisions.yaml']) validateArchitecture(documents['architecture-decisions.yaml'], 'architecture-decisions.yaml', errors);
  if (documents['distribution-contract.yaml']) validateDistribution(documents['distribution-contract.yaml'], 'distribution-contract.yaml', errors);
  if (documents['semantic-mappings.yaml']) validateMappings(documents['semantic-mappings.yaml'], 'semantic-mappings.yaml', errors);
  if (documents['execution-dag.yaml']) validateDag(documents['execution-dag.yaml'], 'execution-dag.yaml', errors);
  const stop = documents['stop-policy.yaml'];
  if (stop && (stop.retry?.maximum_repairs_per_slice ?? 4) > 3) errors.push(issue('REPAIR_LIMIT', 'Stop policy repair limit cannot exceed 3', 'stop-policy.yaml', 'retry.maximum_repairs_per_slice'));
  return { valid: errors.length === 0, root, errors, warnings, documents };
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
