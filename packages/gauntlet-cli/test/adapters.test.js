import assert from 'node:assert/strict';
import test from 'node:test';
import { claudeArgs, resolveAdapter, AdapterError, RESULT_SCHEMA } from '../src/adapters.js';

const WRITABLE = ['builder', 'compiler'];
const READ_ONLY = ['critic', 'verifier'];
const ROLES = [...WRITABLE, ...READ_ONLY];

function flag(args, name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }

test('claude read-only roles receive only the Read tool and no write permission mode', () => {
  for (const role of READ_ONLY) {
    const args = claudeArgs({ prompt: 'p', role });
    assert.equal(flag(args, '--allowedTools'), 'Read', role);
    assert.ok(!args.includes('--permission-mode'), `${role} must not accept edits`);
  }
});

test('claude writable roles receive write tools and acceptEdits', () => {
  for (const role of WRITABLE) {
    const args = claudeArgs({ prompt: 'p', role });
    assert.equal(flag(args, '--allowedTools'), 'Read,Edit,Write,Bash', role);
    assert.equal(flag(args, '--permission-mode'), 'acceptEdits', role);
  }
});

test('claude args never pass --bare, which would ignore an interactive login', () => {
  for (const role of ROLES) assert.ok(!claudeArgs({ prompt: 'p', role }).includes('--bare'), role);
});

test('claude args request schema-constrained JSON for every role', () => {
  for (const role of ROLES) {
    const args = claudeArgs({ prompt: 'p', role });
    assert.equal(args[0], '-p');
    assert.equal(args[1], 'p');
    assert.equal(flag(args, '--output-format'), 'json', role);
    assert.deepEqual(JSON.parse(flag(args, '--json-schema')), RESULT_SCHEMA, role);
  }
});

test('unsupported hosts are rejected before any process launch', () => {
  assert.throws(() => resolveAdapter('gemini'), (error) => error instanceof AdapterError && error.code === 'HOST_UNSUPPORTED');
});
