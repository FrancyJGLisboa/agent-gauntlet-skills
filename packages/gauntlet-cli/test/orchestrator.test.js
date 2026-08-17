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
test('one invocation completes builder-critic-verifier loops and writes a passport',async()=>{
  const root=project(),calls=[];
  const adapter={name:'mock',invoke(input){calls.push(input);return {verdict:input.role==='builder'?'complete':'pass',summary:'requirements satisfied',reason:'independent checks passed',largest_gap:'none',changed_files:[]};}};
  const result=await runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter});
  assert.equal(result.completed,true);
  assert.ok(result.status.slices.every(s=>s.state==='verified'));
  assert.equal(calls.filter(c=>c.role==='builder').length,2);
  assert.equal(calls.filter(c=>c.role==='critic').length,2);
  assert.equal(calls.filter(c=>c.role==='verifier').length,2);
  assert.ok(fs.existsSync(path.join(root,'.gauntlet/product-passport.md')));
  assert.ok(calls.every(c=>!c.prompt.includes('gcap_')),'capability tokens never enter agent context');
});
test('critic repair verdict automatically returns work to builder',async()=>{
  const root=project();let repaired=false,builders=0;
  const adapter={name:'mock',invoke(input){
    if(input.role==='builder'){builders++;return {verdict:'complete',summary:'built',reason:'',largest_gap:'',changed_files:[]};}
    if(input.role==='critic'&&!repaired){repaired=true;return {verdict:'repair',summary:'gap',reason:'tighten implementation',largest_gap:'gap',changed_files:[]};}
    return {verdict:'pass',summary:'ok',reason:'passed',largest_gap:'none',changed_files:[]};
  }};
  const result=await runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter});
  assert.equal(result.completed,true);assert.equal(builders,3);
  assert.equal(result.status.slices.find(s=>s.id==='core').repairs,1);
});

test('verified changes integrate and interrupted building resumes',async()=>{
  const root=project();let fail=true,edited=false;
  const adapter={name:'mock',invoke(input){
    if(input.role==='builder'&&fail){fail=false;throw new Error('simulated process loss');}
    if(input.role==='builder'&&!edited){fs.appendFileSync(path.join(input.cwd,'src/market.js'),'\n// isolated gauntlet change\n');edited=true;}
    return {verdict:input.role==='builder'?'complete':'pass',summary:'ok',reason:'passed',largest_gap:'none',changed_files:[]};
  }};
  await assert.rejects(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter}),/simulated process loss/);
  const result=await runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter});
  assert.equal(result.completed,true);assert.match(fs.readFileSync(path.join(root,'src/market.js'),'utf8'),/isolated gauntlet change/);
  assert.equal(spawnSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).stdout,'');
});
test('a persistently out-of-scope builder is reverted and stopped by the repair cap',async()=>{
  const root=project(),worktrees=new Set();
  const adapter={name:'mock',invoke(input){worktrees.add(input.cwd);if(input.role==='builder')fs.writeFileSync(path.join(input.cwd,'forbidden.txt'),'no');return {verdict:input.role==='builder'?'complete':'pass',summary:'',reason:'',largest_gap:'',changed_files:[]};}};
  await assert.rejects(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter}),/Repair limit exceeded/);
  for(const dir of worktrees)assert.ok(!fs.existsSync(path.join(dir,'forbidden.txt')),'out-of-scope file reverted from the worktree');
  assert.ok(!fs.existsSync(path.join(root,'forbidden.txt')),'out-of-scope file never reaches the checkout');
});
test('an out-of-scope builder recovers on repair instead of wedging the run',async()=>{
  const root=project();let breached=false,worktree;
  const adapter={name:'mock',invoke(input){
    if(input.role==='builder'&&input.prompt.includes('"id": "core"')){
      worktree=input.cwd;
      if(!breached){breached=true;fs.writeFileSync(path.join(input.cwd,'forbidden.txt'),'no');}
      else fs.appendFileSync(path.join(input.cwd,'src/market.js'),'\n// in-scope change\n');
    }
    return {verdict:input.role==='builder'?'complete':'pass',summary:'ok',reason:'passed',largest_gap:'none',changed_files:[]};
  }};
  const result=await runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter});
  assert.equal(result.completed,true);
  assert.equal(result.status.slices.find(s=>s.id==='core').repairs,1,'the breach costs exactly one repair');
  assert.ok(!fs.existsSync(path.join(worktree,'forbidden.txt')));
  assert.ok(!fs.existsSync(path.join(root,'forbidden.txt')));
  assert.match(fs.readFileSync(path.join(root,'src/market.js'),'utf8'),/in-scope change/,'in-scope work still integrates');
});
test('every role prompt names its isolated worktree, never the original checkout',async()=>{
  const root=project(),calls=[];
  const adapter={name:'mock',invoke(input){calls.push(input);return {verdict:input.role==='builder'?'complete':'pass',summary:'ok',reason:'passed',largest_gap:'none',changed_files:[]};}};
  const result=await runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter});
  assert.equal(result.completed,true);
  assert.ok(calls.length>=6,'builder, critic, and verifier all ran');
  for(const call of calls){
    assert.notEqual(call.cwd,root,`${call.role} must run in a worktree, not the checkout`);
    assert.ok(call.prompt.includes(`Work only in ${call.cwd}`),`${call.role} prompt must name its own worktree`);
    assert.ok(!call.prompt.includes(`Work only in ${root}`),`${call.role} prompt must not name the original checkout`);
  }
});

test('deliver compiles a missing pack and runs it in one invocation',async()=>{
  const root=project(),backup=path.join(root,'pack-backup');fs.renameSync(path.join(root,'.gauntlet'),backup);let compiled=false;
  const adapter={name:'mock',invoke(input){if(input.role==='compiler'){fs.renameSync(backup,path.join(root,'.gauntlet'));compiled=true;return {verdict:'complete',summary:'compiled',reason:'',largest_gap:'',changed_files:[]};}return {verdict:input.role==='builder'?'complete':'pass',summary:'ok',reason:'passed',largest_gap:'none',changed_files:[]};}};
  const result=await deliverGauntlet({request:'Build the reference product',manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter});
  assert.equal(compiled,true);assert.equal(result.completed,true);
});

const ok=(role,extra={})=>({verdict:role==='builder'?'complete':'pass',summary:'ok',reason:'passed',largest_gap:'none',changed_files:[],blocking_slice:'',...extra});

test('a defect owned by an upstream slice reopens that slice instead of blocking', async () => {
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
  const result=await runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter,onEvent:e=>events.push(e)});
  assert.equal(result.completed,true);
  assert.ok(coreRebuilt,'the owning slice was rebuilt');
  assert.equal(result.status.slices.find(s=>s.id==='core').repairs,1,'the reopened slice pays the repair');
  assert.equal(result.status.slices.find(s=>s.id==='distribution').repairs,0,'the dependent does not pay for a defect it cannot fix');
  assert.ok(events.some(e=>e.type==='upstream.repair'&&e.owner==='core'&&e.slice==='distribution'));
  assert.match(fs.readFileSync(path.join(root,'src/market.js'),'utf8'),/upstream repair/);
});

test('only a genuine ancestor can be reopened', async () => {
  const root=project();
  // core names distribution — its own dependent, not an ancestor — and must simply block.
  const adapter={name:'mock',invoke(input){
    if(input.role==='builder'&&input.prompt.includes('"id": "core"'))return {verdict:'blocked',summary:'x',reason:'blaming a downstream slice',largest_gap:'x',changed_files:[],blocking_slice:'distribution'};
    return ok(input.role);
  }};
  await assert.rejects(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter}),e=>e.code==='RUN_TERMINAL');
});

test('an unknown blocking slice cannot reopen anything', async () => {
  const root=project();
  const adapter={name:'mock',invoke(input){
    if(input.role==='builder'&&input.prompt.includes('"id": "distribution"'))return {verdict:'blocked',summary:'x',reason:'invented an upstream slice',largest_gap:'x',changed_files:[],blocking_slice:'no-such-slice'};
    return ok(input.role);
  }};
  await assert.rejects(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter}),e=>e.code==='RUN_TERMINAL');
});

test('an exhausted upstream repair budget blocks the dependent rather than looping', async () => {
  const root=project(); let events=[];
  const adapter={name:'mock',invoke(input){
    const isDownstream=input.prompt.includes('"id": "distribution"');
    if(input.role==='builder'&&isDownstream)return {verdict:'blocked',summary:'x',reason:'still upstream',largest_gap:'x',changed_files:[],blocking_slice:'core'};
    return ok(input.role);
  }};
  await assert.rejects(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter,onEvent:e=>events.push(e)}),e=>e.code==='RUN_TERMINAL');
  assert.ok(events.some(e=>e.type==='upstream.exhausted'),'the loop terminates on the upstream cap');
  assert.ok(events.filter(e=>e.type==='upstream.repair').length<=3,'reopening is bounded by the repair cap');
});

// A pack whose `core` slice must beat a reference artifact, judged blind by three.
function qualitativeProject(agreement='0.66',allowTie=false){
  const root=project();
  fs.mkdirSync(path.join(root,'ref'),{recursive:true});
  fs.writeFileSync(path.join(root,'ref','bar.txt'),'the reference bar\n');
  // the fixture repo is "type": "module", so the generator must be ESM
  fs.writeFileSync(path.join(root,'make-candidate.js'),`import fs from 'node:fs';\nfs.mkdirSync('out',{recursive:true});\nfs.writeFileSync('out/candidate.txt','the candidate\\n');\n`);
  fs.writeFileSync(path.join(root,'.gauntlet','critic-protocol.yaml'),
    `isolation: { fresh_context: true }\nqualitative:\n  judges: 3\n  agreement: ${agreement}\n  criteria:\n    - id: polish\n      slice_id: core\n      question: Which reads as the more polished product?\n      candidate: ["node", "make-candidate.js"]\n      artifact: out/candidate.txt\n      reference: ref/bar.txt\n      allow_tie: ${allowTie}\n`);
  spawnSync('git',['add','.'],{cwd:root});spawnSync('git',['-c','user.name=Test','-c','user.email=test@example.test','commit','-qm','qualitative'],{cwd:root});
  return root;
}
function panel(votes){
  let i=0;
  return {name:'mock',invoke(input){
    if(input.role==='judge')return {winner:votes[i++%votes.length],decisive_difference:'wording'};
    return ok(input.role);
  }};
}

test('a slice cannot pass on tests alone when it declares a reference bar', async () => {
  const root=qualitativeProject(); const events=[]; const judgePrompts=[];
  // Judges vote for whichever label holds the candidate, so the outcome does not ride
  // on the runtime's coin flip — only the blinding of the prompt is under test here.
  const adapter={name:'mock',invoke(input){
    if(input.role==='judge'){
      judgePrompts.push(input.prompt);
      const a=input.prompt.match(/A: (\S+)/)[1];
      return {winner:fs.readFileSync(a,'utf8').includes('candidate')?'A':'B',decisive_difference:'crisper wording'};
    }
    return ok(input.role);
  }};
  const result=await runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter,onEvent:e=>events.push(e)});
  const comparison=events.find(e=>e.type==='comparison');
  assert.ok(comparison,'the comparison ran');
  assert.equal(events.filter(e=>e.type==='judge').length>=3,true,'three judges voted');
  assert.equal(judgePrompts.length>=3,true);
  for(const prompt of judgePrompts){
    assert.ok(!prompt.includes('candidate.txt'),'the judge never sees the candidate filename');
    assert.ok(!prompt.includes('ref/bar.txt'),'nor the reference path');
    assert.ok(!prompt.includes('make-candidate.js'),'nor how the candidate was produced');
    assert.match(prompt,/Which reads as the more polished product\?/);
  }
  assert.equal(comparison.outcome,'won');
  assert.equal(result.completed,true,'clearing the bar lets the slice pass');
});

test('losing to the reference bar sends the slice back to its builder', async () => {
  const root=qualitativeProject(); const events=[];
  // Judges always pick whichever label the reference wears.
  let labels;
  const adapter={name:'mock',invoke(input){
    if(input.role==='judge'){
      const a=input.prompt.match(/A: (\S+)/)[1];
      const isReferenceA=fs.readFileSync(a,'utf8').includes('reference');
      labels=isReferenceA?'A':'B';
      return {winner:labels,decisive_difference:'the other one is unfinished'};
    }
    return ok(input.role);
  }};
  await assert.rejects(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter,onEvent:e=>events.push(e)}),/Repair limit exceeded/);
  assert.ok(events.filter(e=>e.type==='comparison').every(e=>e.outcome==='lost'));
});

test('a split panel is inconclusive, and inconclusive is not approval', async () => {
  const root=qualitativeProject(); const events=[];
  await assert.rejects(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter:panel(['A','B','tie']),onEvent:e=>events.push(e)}),/Repair limit exceeded/);
  const comparisons=events.filter(e=>e.type==='comparison');
  assert.ok(comparisons.length>0);
  assert.ok(comparisons.every(e=>e.outcome==='inconclusive'),'a divided panel never passes the slice');
});

test('a judge that fails to answer is not counted as agreement', async () => {
  const root=qualitativeProject(); const events=[];
  const adapter={name:'mock',invoke(input){
    // The first seat never returns a vote; the other two agree on A every time.
    if(input.role==='judge'){
      if(input.prompt.includes('judge 1 of 3'))throw new Error('judge process died');
      return {winner:'A',decisive_difference:'x'};
    }
    return ok(input.role);
  }};
  await assert.rejects(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter,onEvent:e=>events.push(e)}),/Repair limit exceeded/);
  assert.ok(events.some(e=>e.type==='judge.failed'),'the failure is recorded');
  assert.ok(events.filter(e=>e.type==='comparison').some(e=>e.outcome==='inconclusive'),'a missing vote cannot complete a quorum');
});

// A pack whose single slice passes only because of a file that was never committed.
function cleanRoomProject({finalVerification,command}){
  const root=project();
  fs.writeFileSync(path.join(root,'.gitignore'),'never-committed.txt\n');
  fs.writeFileSync(path.join(root,'.gauntlet','final-verification.yaml'),finalVerification);
  fs.writeFileSync(path.join(root,'.gauntlet','execution-dag.yaml'),
    `slices:\n  - id: core\n    depends_on: []\n    builder: { scope: [src/market.js] }\n    critic: { independent: true }\n    acceptance_tests: [unit-test]\n`);
  fs.writeFileSync(path.join(root,'.gauntlet','acceptance-tests.yaml'),
    `tests:\n  - id: unit-test\n    slice_id: core\n    cwd: ..\n    command: ${JSON.stringify(command)}\n`);
  spawnSync('git',['add','-A'],{cwd:root});spawnSync('git',['-c','user.name=T','-c','user.email=t@e.test','commit','-qm','cleanroom'],{cwd:root});
  return root;
}

test('the clean room contains only committed content, so uncommitted crutches fail it', async () => {
  const root=cleanRoomProject({finalVerification:'clean_room: true\nruns: 2\n',
    command:['node','-e','import("node:fs").then(fs=>process.exit(fs.existsSync("never-committed.txt")?0:1))']});
  const events=[];
  const adapter={name:'mock',invoke(input){
    // The builder leaves a gitignored file behind: the tests pass in its own worktree.
    if(input.role==='builder')fs.writeFileSync(path.join(input.cwd,'never-committed.txt'),'crutch');
    return ok(input.role);
  }};
  await assert.rejects(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter,onEvent:e=>events.push(e)}),/Repair limit exceeded/);
  const rooms=events.filter(e=>e.type==='clean_room');
  assert.ok(rooms.length>=2,'both declared runs happened');
  assert.ok(rooms.every(e=>e.satisfied===false),'the checkout without the crutch fails');
});

test('a clean room runs the declared number of times and reports its commit', async () => {
  const root=cleanRoomProject({finalVerification:'clean_room: true\nruns: 3\n',
    command:['node','-e','console.log("PASS")']});
  const events=[];
  const result=await runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter:{name:'mock',invoke:i=>ok(i.role)},onEvent:e=>events.push(e)});
  assert.equal(result.completed,true);
  const rooms=events.filter(e=>e.type==='clean_room');
  assert.equal(rooms.length,3);
  assert.ok(rooms.every(e=>e.satisfied&&/^[0-9a-f]{40}$/.test(e.commit)),'each run names the commit it verified');
  assert.equal(new Set(rooms.map(e=>e.commit)).size,1,'every run verifies the same commit');
});

test('runs that disagree are not reproducible even when both pass', async () => {
  const root=cleanRoomProject({finalVerification:'clean_room: true\nruns: 2\nrequire_identical_output: true\n',
    command:['node','-e','console.log(process.hrtime.bigint())']});
  const events=[];
  await assert.rejects(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter:{name:'mock',invoke:i=>ok(i.role)},onEvent:e=>events.push(e)}),/Repair limit exceeded/);
  assert.ok(events.filter(e=>e.type==='clean_room').every(e=>e.satisfied),'each run passed on its own');
});

test('declared setup steps prepare the clean room before the tests run', async () => {
  // The gitignored file exists in the builder's worktree and never in a fresh
  // checkout, so this run can only reach `verified` if setup recreated it.
  const root=cleanRoomProject({finalVerification:`clean_room: true\nruns: 2\nsetup:\n  - ["node", "-e", "import('node:fs').then(fs=>fs.writeFileSync('never-committed.txt','rebuilt'))"]\n`,
    command:['node','-e','import("node:fs").then(fs=>process.exit(fs.existsSync("never-committed.txt")?0:1))']});
  const events=[];
  const adapter={name:'mock',invoke(input){
    if(input.role==='builder')fs.writeFileSync(path.join(input.cwd,'never-committed.txt'),'crutch');
    return ok(input.role);
  }};
  const result=await runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter,onEvent:e=>events.push(e)});
  assert.equal(result.completed,true,'setup output is available to the tests in the same room');
  assert.ok(events.filter(e=>e.type==='clean_room').every(e=>e.satisfied));
});

const blockerAdapter=(packet)=>({name:'mock',invoke(input){
  if(input.role==='escalation')return packet;
  if(input.role==='builder')return ok('builder');
  return {verdict:'repair',summary:'gap',reason:'not good enough',largest_gap:'gap',changed_files:[],blocking_slice:''};
}});
const PACKET={classification:'BLOCKED_ACCESS',what_was_attempted:'Three builders tried to reach the price feed.',
  what_stopped_it:'The price feed needs a login we do not have, so no version of this can show real prices.',
  recommendation:'Provide a read-only API key, or accept a version that runs on the sample file only.',
  tradeoff:'The sample-file version cannot be trusted for live decisions.',
  safe_default:'Nothing ships; the existing manual process continues.',
  human_dependency:'credentials',request_to_human:'Can you supply a read-only API key for the price feed?'};

test('a stopped run writes an explanation a non-coder can read', async () => {
  const root=project();
  await assert.rejects(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter:blockerAdapter(PACKET)}),/Repair limit exceeded/);
  const markdown=fs.readFileSync(path.join(root,'.gauntlet/blocker.md'),'utf8');
  assert.match(markdown,/needs a login we do not have/,'the plain-language cause leads');
  assert.match(markdown,/What is needed from you \(credentials\)/);
  assert.match(markdown,/If nobody decides anything:/,'a safe default is always stated');
  assert.match(markdown,/core: \*\*\w+\*\* after 3 repair attempts/,'the runtime supplies the slice history');
  assert.ok(!/Error:|at Object\.|\.js:\d+:\d+/.test(markdown),'no stack traces reach the reader');
  const json=JSON.parse(fs.readFileSync(path.join(root,'.gauntlet/blocker.json'),'utf8'));
  assert.equal(json.classification,'BLOCKED_ACCESS');
  assert.equal(json.facts.stopped_with.message,'Repair limit exceeded (3)');
});

test('the evidence in a blocker comes from the runtime, not the agent', async () => {
  const root=project();
  const lying={...PACKET,what_was_attempted:'Everything passed on the first try.'};
  await assert.rejects(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter:blockerAdapter(lying)}),/Repair limit exceeded/);
  const json=JSON.parse(fs.readFileSync(path.join(root,'.gauntlet/blocker.json'),'utf8'));
  assert.ok(json.facts.attempts.length>=3,'the recorded attempts contradict the claim');
  assert.ok(json.facts.slices.some(s=>s.repairs===3));
  assert.match(fs.readFileSync(path.join(root,'.gauntlet/blocker.md'),'utf8'),/after 3 repair attempts/);
});

test('a technical dead end is never dressed up as a question for the human', async () => {
  const root=project();
  // The agent tries to hand a technical judgment back to the user anyway.
  const overreach={...PACKET,classification:'PACK_DEFECT',human_dependency:'none',
    request_to_human:'Which JSON library should we use, and is 200ms an acceptable p95?'};
  await assert.rejects(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter:blockerAdapter(overreach)}),/Repair limit exceeded/);
  const markdown=fs.readFileSync(path.join(root,'.gauntlet/blocker.md'),'utf8');
  assert.ok(!markdown.includes('Which JSON library'),'the question is stripped, not printed');
  assert.match(markdown,/No decision of yours can unblock this/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'.gauntlet/blocker.json'),'utf8')).request_to_human,'');
});

test('an escalation agent that dies still leaves an explanation behind', async () => {
  const root=project(); const events=[];
  const adapter={name:'mock',invoke(input){
    if(input.role==='escalation')throw new Error('escalation process died');
    if(input.role==='builder')return ok('builder');
    return {verdict:'repair',summary:'gap',reason:'not good enough',largest_gap:'gap',changed_files:[],blocking_slice:''};
  }};
  await assert.rejects(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter,onEvent:e=>events.push(e)}),/Repair limit exceeded/);
  assert.ok(events.some(e=>e.type==='blocker.degraded'));
  assert.match(fs.readFileSync(path.join(root,'.gauntlet/blocker.md'),'utf8'),/Repair limit exceeded/,'the recorded facts survive without the narrative');
});

test('creating the scoped file in a new directory is not a scope violation', async () => {
  const root=project();
  // src/ exists in the fixture; use a directory that does not, which is what makes
  // git collapse the untracked entry to "fresh/" and hide the real filename.
  fs.writeFileSync(path.join(root,'.gauntlet','execution-dag.yaml'),
    `slices:\n  - id: core\n    depends_on: []\n    builder: { scope: [fresh/thing.js] }\n    critic: { independent: true }\n    acceptance_tests: [unit-test]\n`);
  fs.writeFileSync(path.join(root,'.gauntlet','acceptance-tests.yaml'),
    `tests:\n  - id: unit-test\n    slice_id: core\n    cwd: ..\n    command: ["node","-e","import('node:fs').then(fs=>process.exit(fs.existsSync('fresh/thing.js')?0:1))"]\n`);
  spawnSync('git',['add','-A'],{cwd:root});
  spawnSync('git',['-c','user.name=T','-c','user.email=t@e.test','commit','-qm','scoped'],{cwd:root});
  const adapter={name:'mock',invoke(input){
    if(input.role==='builder'){fs.mkdirSync(path.join(input.cwd,'fresh'),{recursive:true});fs.writeFileSync(path.join(input.cwd,'fresh/thing.js'),'export const a=1;\n');}
    return ok(input.role);
  }};
  const result=await runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter});
  assert.equal(result.completed,true,'the builder wrote exactly its declared scope');
  assert.equal(result.status.slices.find(s=>s.id==='core').repairs,0,'and was not charged a repair for it');
  assert.ok(fs.existsSync(path.join(root,'fresh/thing.js')),'the work integrated');
});

test('a critic that writes into the worktree is caught', async () => {
  const root=project();
  // The scope is the directory itself, so the builder's file is legitimate and the
  // critic's sibling is the only mutation.
  fs.writeFileSync(path.join(root,'.gauntlet','execution-dag.yaml'),
    `slices:\n  - id: core\n    depends_on: []\n    builder: { scope: [scratch/] }\n    critic: { independent: true }\n    acceptance_tests: [unit-test]\n`);
  fs.writeFileSync(path.join(root,'.gauntlet','acceptance-tests.yaml'),
    `tests:\n  - id: unit-test\n    slice_id: core\n    cwd: ..\n    command: ["node","-e","import('node:fs').then(fs=>process.exit(fs.existsSync('scratch/a.txt')?0:1))"]\n`);
  spawnSync('git',['add','-A'],{cwd:root});
  spawnSync('git',['-c','user.name=T','-c','user.email=t@e.test','commit','-qm','scoped'],{cwd:root});
  const adapter={name:'mock',invoke(input){
    if(input.role==='builder'){fs.mkdirSync(path.join(input.cwd,'scratch'),{recursive:true});fs.writeFileSync(path.join(input.cwd,'scratch/a.txt'),'from builder');}
    if(input.role==='critic')fs.writeFileSync(path.join(input.cwd,'scratch/smuggled.txt'),'from critic');
    return ok(input.role);
  }};
  await assert.rejects(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter}),e=>e.code==='CRITIC_MUTATION');
});

// Two slices with no dependency on each other, so the only thing deciding whether
// they overlap is the scheduler.
function parallelProject(limit){
  const root=project(),manifestPath=path.join(root,'.gauntlet','manifest.yaml');
  fs.writeFileSync(manifestPath,fs.readFileSync(manifestPath,'utf8')
    .replace('  maximum_repairs_per_slice: 3',`  maximum_repairs_per_slice: 3\n  maximum_parallel_builders: ${limit}`));
  fs.writeFileSync(path.join(root,'.gauntlet','execution-dag.yaml'),
    `slices:\n  - id: alpha\n    depends_on: []\n    builder: { scope: [alpha/thing.js] }\n    critic: { independent: true }\n    acceptance_tests: [alpha-test]\n  - id: beta\n    depends_on: []\n    builder: { scope: [beta/thing.js] }\n    critic: { independent: true }\n    acceptance_tests: [beta-test]\n`);
  const exists=dir=>`["node","-e","import('node:fs').then(fs=>process.exit(fs.existsSync('${dir}/thing.js')?0:1))"]`;
  fs.writeFileSync(path.join(root,'.gauntlet','acceptance-tests.yaml'),
    `tests:\n  - id: alpha-test\n    slice_id: alpha\n    cwd: ..\n    command: ${exists('alpha')}\n  - id: beta-test\n    slice_id: beta\n    cwd: ..\n    command: ${exists('beta')}\n`);
  fs.writeFileSync(path.join(root,'.gauntlet','final-verification.yaml'),'clean_room: true\nruns: 2\n');
  spawnSync('git',['add','-A'],{cwd:root});
  spawnSync('git',['-c','user.name=T','-c','user.email=t@e.test','commit','-qm','parallel'],{cwd:root});
  return root;
}
const sliceOf=input=>input.prompt.includes('"id": "alpha"')?'alpha':'beta';
function writerAdapter(onBuilder){
  return {name:'mock',async invoke(input){
    if(input.role==='builder'){
      const slice=sliceOf(input);
      if(onBuilder)await onBuilder(slice);
      fs.mkdirSync(path.join(input.cwd,slice),{recursive:true});
      fs.writeFileSync(path.join(input.cwd,slice,'thing.js'),`export const ${slice}=1;\n`);
    }
    return ok(input.role);
  }};
}
// Counts how many builder turns are open simultaneously. The await is what lets the
// scheduler start a sibling; without it the peak can only ever be one.
function concurrencyProbe(){
  const state={live:0,peak:0};
  return {state,hold:async()=>{state.live++;state.peak=Math.max(state.peak,state.live);await new Promise(r=>setTimeout(r,60));state.live--;}};
}

test('independent slices build concurrently up to the declared limit', async () => {
  const root=parallelProject(2),probe=concurrencyProbe();
  const result=await runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter:writerAdapter(probe.hold)});
  assert.equal(result.completed,true);
  assert.equal(probe.state.peak,2,'both builders were in flight at the same time');
  assert.ok(fs.existsSync(path.join(root,'alpha/thing.js'))&&fs.existsSync(path.join(root,'beta/thing.js')),'both slices integrated');
});

test('a pack that declares one builder never runs two at once', async () => {
  const root=parallelProject(1),probe=concurrencyProbe();
  const result=await runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter:writerAdapter(probe.hold)});
  assert.equal(result.completed,true);
  assert.equal(probe.state.peak,1,'the declared limit is a ceiling, not a hint');
});

test('a pack cannot declare a builder fleet larger than the runtime cap', async () => {
  const root=parallelProject(12);
  await assert.rejects(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter:writerAdapter()}),
    e=>e.code==='PACK_INVALID'&&e.details.errors.some(x=>x.code==='PARALLEL_LIMIT'));
});

test('a sibling that integrates first sends the other slice back through the clean room', async () => {
  const root=parallelProject(2),events=[];
  const result=await runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),
    adapter:writerAdapter(async()=>{await new Promise(r=>setTimeout(r,30));}),onEvent:e=>events.push(e)});
  assert.equal(result.completed,true);
  assert.ok(events.some(e=>e.type==='integration.rebased'),'the later slice replayed onto the base its sibling moved');
  assert.ok(events.filter(e=>e.type==='clean_room').length>4,'it was verified again rather than integrated on a stale verdict');
  assert.ok(fs.existsSync(path.join(root,'alpha/thing.js'))&&fs.existsSync(path.join(root,'beta/thing.js')));
});

test('a run that stops waits for its in-flight siblings before reporting', async () => {
  const root=parallelProject(2);let slowFinished=false;
  const adapter={name:'mock',async invoke(input){
    const slice=sliceOf(input);
    if(input.role==='builder'&&slice==='beta')
      return {verdict:'blocked',summary:'x',reason:'an external impossibility',largest_gap:'x',changed_files:[],blocking_slice:''};
    if(input.role==='builder'){
      await new Promise(r=>setTimeout(r,150));slowFinished=true;
      fs.mkdirSync(path.join(input.cwd,slice),{recursive:true});
      fs.writeFileSync(path.join(input.cwd,slice,'thing.js'),`export const ${slice}=1;\n`);
    }
    return ok(input.role);
  }};
  await assert.rejects(()=>runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter}),e=>e.code==='RUN_TERMINAL');
  assert.equal(slowFinished,true,'the sibling was awaited, not orphaned mid-write');
});

test('an upstream reopen requested while the owner is mid-step is applied, not lost', async () => {
  const root=project(),manifestPath=path.join(root,'.gauntlet','manifest.yaml'),events=[];
  fs.writeFileSync(manifestPath,fs.readFileSync(manifestPath,'utf8')
    .replace('  maximum_repairs_per_slice: 3','  maximum_repairs_per_slice: 3\n  maximum_parallel_builders: 2'));
  spawnSync('git',['add','-A'],{cwd:root});
  spawnSync('git',['-c','user.name=T','-c','user.email=t@e.test','commit','-qm','concurrent'],{cwd:root});
  let started,released;
  const verifierStarted=new Promise(r=>{started=r;}),verifierHeld=new Promise(r=>{released=r;});
  let heldOnce=false,blamed=false;
  const adapter={name:'mock',async invoke(input){
    const isCore=input.prompt.includes('"id": "core"');
    // Pin the core verifier open, then have the dependent blame core while it is still
    // the live step — the exact moment a reopen must not delete core's worktree.
    if(input.role==='verifier'&&isCore&&!heldOnce){heldOnce=true;started();await verifierHeld;}
    if(input.role==='builder'&&!isCore&&!blamed){
      blamed=true;await verifierStarted;released();
      return {verdict:'blocked',summary:'x',reason:'core exports the wrong shape',largest_gap:'x',changed_files:[],blocking_slice:'core'};
    }
    return ok(input.role);
  }};
  const result=await runGauntlet({manifest:manifestPath,adapter,onEvent:e=>events.push(e)});
  assert.equal(result.completed,true);
  assert.ok(events.some(e=>e.type==='upstream.deferred'&&e.owner==='core'),'the reopen was queued under the live step');
  assert.ok(events.some(e=>e.type==='upstream.repair'&&e.owner==='core'),'and applied once that step settled');
  assert.equal(result.status.slices.find(s=>s.id==='core').repairs,1,'the owning slice paid exactly one repair');
});

test('the blind panel dispatches its judges concurrently', async () => {
  const root=qualitativeProject();let live=0,peak=0;
  const adapter={name:'mock',async invoke(input){
    if(input.role!=='judge')return ok(input.role);
    live++;peak=Math.max(peak,live);
    await new Promise(r=>setTimeout(r,40));
    live--;
    const a=input.prompt.match(/A: (\S+)/)[1];
    return {winner:fs.readFileSync(a,'utf8').includes('candidate')?'A':'B',decisive_difference:'crisper wording'};
  }};
  const result=await runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter});
  assert.equal(result.completed,true);
  assert.equal(peak,3,'all three seats were open at once');
});

test('every commit the runtime creates carries its own identity', async () => {
  // cherry-pick and rebase create commits. Relying on an ambient git identity works on
  // a developer machine, where git derives one from the OS, and fails on a bare CI
  // runner or container where it cannot — at integration, after every builder, critic,
  // and clean room has already been paid for. Asserting the committer is portable;
  // reproducing an underivable identity is not.
  const root=parallelProject(2);
  const result=await runGauntlet({manifest:path.join(root,'.gauntlet/manifest.yaml'),adapter:writerAdapter()});
  assert.equal(result.completed,true);
  // Select by the runtime's own commit subject, so the harness's seed commits and their
  // identities cannot influence the result.
  const committers=spawnSync('git',['log','--format=%s\t%cn <%ce>'],{cwd:root,encoding:'utf8'})
    .stdout.trim().split('\n').filter(line=>line.startsWith('gauntlet(')).map(line=>line.split('\t')[1]);
  assert.ok(committers.length>=2,'both slices produced integrated commits');
  for(const committer of committers)
    assert.equal(committer,'Agent Gauntlet <gauntlet@local>','a runtime commit must not depend on an ambient identity');
});
