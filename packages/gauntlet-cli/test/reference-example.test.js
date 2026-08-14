import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test('reference platform pack validates and its distributed artifact passes clean tests',()=>{
  const validation=spawnSync('node',['src/cli.js','validate','examples/coffee-market-terminal/.gauntlet/manifest.yaml'],{cwd:root,encoding:'utf8'});
  assert.equal(validation.status,0,validation.stderr||validation.stdout);
  const result=JSON.parse(validation.stdout); assert.equal(result.valid,true); assert.match(result.fingerprint,/^[a-f0-9]{64}$/);
  const distribution=spawnSync('node',['examples/coffee-market-terminal/scripts/verify-distribution.js'],{cwd:root,encoding:'utf8'});
  assert.equal(distribution.status,0,distribution.stderr||distribution.stdout);
  assert.equal(JSON.parse(distribution.stdout).clean_install,true);
});
