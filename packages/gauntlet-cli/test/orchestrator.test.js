import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { deliverGauntlet, runGauntlet } from '../src/orchestrator.js';

const here=path.dirname(fileURLToPath(import.meta.url));
function project(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gauntlet-run-'));
  fs.cpSync(path.resolve(here,'../examples/coffee-market-terminal'),root,{recursive:true});
  spawnSync('git',['init','-q'],{cwd:root});spawnSync('git',['add','.'],{cwd:root});spawnSync('git',['-c','user.name=Test','-c','user.email=test@example.test','commit','-qm','fixture'],{cwd:root});
  return root;
}
test('one invocation completes builder-critic-verifier loops and writes a passport',()=>{
  const root=project(),calls=[];
  const adapter={name:'mock',invoke(input){calls.push(input);return {verdict:input.role==='builder'?'complete':'pass',summary:'requirements satisfied',reason:'independent checks passed',largest_gap:'none',changed_files:[]};}};
  const result=runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter});
  assert.equal(result.completed,true);
  assert.ok(result.status.slices.every(s=>s.state==='verified'));
  assert.equal(calls.filter(c=>c.role==='builder').length,2);
  assert.equal(calls.filter(c=>c.role==='critic').length,2);
  assert.equal(calls.filter(c=>c.role==='verifier').length,2);
  assert.ok(fs.existsSync(path.join(root,'.gauntlet/product-passport.md')));
  assert.ok(calls.every(c=>!c.prompt.includes('gcap_')),'capability tokens never enter agent context');
});
test('critic repair verdict automatically returns work to builder',()=>{
  const root=project();let repaired=false,builders=0;
  const adapter={name:'mock',invoke(input){
    if(input.role==='builder'){builders++;return {verdict:'complete',summary:'built',reason:'',largest_gap:'',changed_files:[]};}
    if(input.role==='critic'&&!repaired){repaired=true;return {verdict:'repair',summary:'gap',reason:'tighten implementation',largest_gap:'gap',changed_files:[]};}
    return {verdict:'pass',summary:'ok',reason:'passed',largest_gap:'none',changed_files:[]};
  }};
  const result=runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter});
  assert.equal(result.completed,true);assert.equal(builders,3);
  assert.equal(result.status.slices.find(s=>s.id==='core').repairs,1);
});

test('verified changes integrate and interrupted building resumes',()=>{
  const root=project();let fail=true,edited=false;
  const adapter={name:'mock',invoke(input){
    if(input.role==='builder'&&fail){fail=false;throw new Error('simulated process loss');}
    if(input.role==='builder'&&!edited){fs.appendFileSync(path.join(input.cwd,'src/market.js'),'\n// isolated gauntlet change\n');edited=true;}
    return {verdict:input.role==='builder'?'complete':'pass',summary:'ok',reason:'passed',largest_gap:'none',changed_files:[]};
  }};
  assert.throws(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter}),/simulated process loss/);
  const result=runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter});
  assert.equal(result.completed,true);assert.match(fs.readFileSync(path.join(root,'src/market.js'),'utf8'),/isolated gauntlet change/);
  assert.equal(spawnSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).stdout,'');
});
test('out-of-scope builder changes are rejected',()=>{
  const root=project(),adapter={name:'mock',invoke(input){if(input.role==='builder')fs.writeFileSync(path.join(input.cwd,'forbidden.txt'),'no');return {verdict:input.role==='builder'?'complete':'pass',summary:'',reason:'',largest_gap:'',changed_files:[]};}};
  assert.throws(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter}),e=>e.code==='SCOPE_VIOLATION');
});
test('deliver compiles a missing pack and runs it in one invocation',()=>{
  const root=project(),backup=path.join(root,'pack-backup');fs.renameSync(path.join(root,'.gauntlet'),backup);let compiled=false;
  const adapter={name:'mock',invoke(input){if(input.role==='compiler'){fs.renameSync(backup,path.join(root,'.gauntlet'));compiled=true;return {verdict:'complete',summary:'compiled',reason:'',largest_gap:'',changed_files:[]};}return {verdict:input.role==='builder'?'complete':'pass',summary:'ok',reason:'passed',largest_gap:'none',changed_files:[]};}};
  const result=deliverGauntlet({request:'Build the reference product',manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter});
  assert.equal(compiled,true);assert.equal(result.completed,true);
});
