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
test('a persistently out-of-scope builder is reverted and stopped by the repair cap',()=>{
  const root=project(),worktrees=new Set();
  const adapter={name:'mock',invoke(input){worktrees.add(input.cwd);if(input.role==='builder')fs.writeFileSync(path.join(input.cwd,'forbidden.txt'),'no');return {verdict:input.role==='builder'?'complete':'pass',summary:'',reason:'',largest_gap:'',changed_files:[]};}};
  assert.throws(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter}),/Repair limit exceeded/);
  for(const dir of worktrees)assert.ok(!fs.existsSync(path.join(dir,'forbidden.txt')),'out-of-scope file reverted from the worktree');
  assert.ok(!fs.existsSync(path.join(root,'forbidden.txt')),'out-of-scope file never reaches the checkout');
});
test('an out-of-scope builder recovers on repair instead of wedging the run',()=>{
  const root=project();let breached=false,worktree;
  const adapter={name:'mock',invoke(input){
    if(input.role==='builder'&&input.prompt.includes('"id": "core"')){
      worktree=input.cwd;
      if(!breached){breached=true;fs.writeFileSync(path.join(input.cwd,'forbidden.txt'),'no');}
      else fs.appendFileSync(path.join(input.cwd,'src/market.js'),'\n// in-scope change\n');
    }
    return {verdict:input.role==='builder'?'complete':'pass',summary:'ok',reason:'passed',largest_gap:'none',changed_files:[]};
  }};
  const result=runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter});
  assert.equal(result.completed,true);
  assert.equal(result.status.slices.find(s=>s.id==='core').repairs,1,'the breach costs exactly one repair');
  assert.ok(!fs.existsSync(path.join(worktree,'forbidden.txt')));
  assert.ok(!fs.existsSync(path.join(root,'forbidden.txt')));
  assert.match(fs.readFileSync(path.join(root,'src/market.js'),'utf8'),/in-scope change/,'in-scope work still integrates');
});
test('every role prompt names its isolated worktree, never the original checkout',()=>{
  const root=project(),calls=[];
  const adapter={name:'mock',invoke(input){calls.push(input);return {verdict:input.role==='builder'?'complete':'pass',summary:'ok',reason:'passed',largest_gap:'none',changed_files:[]};}};
  const result=runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter});
  assert.equal(result.completed,true);
  assert.ok(calls.length>=6,'builder, critic, and verifier all ran');
  for(const call of calls){
    assert.notEqual(call.cwd,root,`${call.role} must run in a worktree, not the checkout`);
    assert.ok(call.prompt.includes(`Work only in ${call.cwd}`),`${call.role} prompt must name its own worktree`);
    assert.ok(!call.prompt.includes(`Work only in ${root}`),`${call.role} prompt must not name the original checkout`);
  }
});

test('deliver compiles a missing pack and runs it in one invocation',()=>{
  const root=project(),backup=path.join(root,'pack-backup');fs.renameSync(path.join(root,'.gauntlet'),backup);let compiled=false;
  const adapter={name:'mock',invoke(input){if(input.role==='compiler'){fs.renameSync(backup,path.join(root,'.gauntlet'));compiled=true;return {verdict:'complete',summary:'compiled',reason:'',largest_gap:'',changed_files:[]};}return {verdict:input.role==='builder'?'complete':'pass',summary:'ok',reason:'passed',largest_gap:'none',changed_files:[]};}};
  const result=deliverGauntlet({request:'Build the reference product',manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter});
  assert.equal(compiled,true);assert.equal(result.completed,true);
});

const ok=(role,extra={})=>({verdict:role==='builder'?'complete':'pass',summary:'ok',reason:'passed',largest_gap:'none',changed_files:[],blocking_slice:'',...extra});

test('a defect owned by an upstream slice reopens that slice instead of blocking', () => {
  const root=project(); let downstreamAttempts=0, coreRebuilt=false; const events=[];
  const adapter={name:'mock',invoke(input){
    const isDownstream=input.prompt.includes('"id": "distribution"');
    if(input.role==='builder'&&isDownstream){
      downstreamAttempts++;
      // The ui builder proves on its first attempt that the defect lives in core.
      if(downstreamAttempts===1)return {verdict:'blocked',summary:'upstream defect',reason:'core exports the wrong shape',largest_gap:'core',changed_files:[],blocking_slice:'core'};
      return ok('builder');
    }
    if(input.role==='builder'&&!isDownstream&&downstreamAttempts>0){coreRebuilt=true;fs.appendFileSync(path.join(input.cwd,'src/market.js'),'\n// upstream repair\n');}
    return ok(input.role);
  }};
  const result=runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter,onEvent:e=>events.push(e)});
  assert.equal(result.completed,true);
  assert.ok(coreRebuilt,'the owning slice was rebuilt');
  assert.equal(result.status.slices.find(s=>s.id==='core').repairs,1,'the reopened slice pays the repair');
  assert.equal(result.status.slices.find(s=>s.id==='distribution').repairs,0,'the dependent does not pay for a defect it cannot fix');
  assert.ok(events.some(e=>e.type==='upstream.repair'&&e.owner==='core'&&e.slice==='distribution'));
  assert.match(fs.readFileSync(path.join(root,'src/market.js'),'utf8'),/upstream repair/);
});

test('only a genuine ancestor can be reopened', () => {
  const root=project();
  // core names distribution — its own dependent, not an ancestor — and must simply block.
  const adapter={name:'mock',invoke(input){
    if(input.role==='builder'&&input.prompt.includes('"id": "core"'))return {verdict:'blocked',summary:'x',reason:'blaming a downstream slice',largest_gap:'x',changed_files:[],blocking_slice:'distribution'};
    return ok(input.role);
  }};
  assert.throws(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter}),e=>e.code==='RUN_TERMINAL');
});

test('an unknown blocking slice cannot reopen anything', () => {
  const root=project();
  const adapter={name:'mock',invoke(input){
    if(input.role==='builder'&&input.prompt.includes('"id": "distribution"'))return {verdict:'blocked',summary:'x',reason:'invented an upstream slice',largest_gap:'x',changed_files:[],blocking_slice:'no-such-slice'};
    return ok(input.role);
  }};
  assert.throws(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter}),e=>e.code==='RUN_TERMINAL');
});

test('an exhausted upstream repair budget blocks the dependent rather than looping', () => {
  const root=project(); let events=[];
  const adapter={name:'mock',invoke(input){
    const isDownstream=input.prompt.includes('"id": "distribution"');
    if(input.role==='builder'&&isDownstream)return {verdict:'blocked',summary:'x',reason:'still upstream',largest_gap:'x',changed_files:[],blocking_slice:'core'};
    return ok(input.role);
  }};
  assert.throws(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter,onEvent:e=>events.push(e)}),e=>e.code==='RUN_TERMINAL');
  assert.ok(events.some(e=>e.type==='upstream.exhausted'),'the loop terminates on the upstream cap');
  assert.ok(events.filter(e=>e.type==='upstream.repair').length<=3,'reopening is bounded by the repair cap');
});
