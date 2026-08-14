#!/usr/bin/env node
import { RunStore, validatePack } from './engine.js';
import { explainGauntlet, runGauntlet } from './orchestrator.js';

function usage() {
  console.log(`gauntlet <command> [options]

Commands:
  validate [manifest]
  init [manifest]
  status [manifest]
  next [manifest]
  assign <slice> --role <builder|critic|verifier>
  execute <slice> <test-id> --token <capability>
  transition <slice> <state> --token <capability> [--evidence <id>]
  authorize-release --target <registry> --version <version> --approval <hmac>
  release-check [manifest]
  run [manifest] [--host auto|codex|claude|copilot]
  explain [manifest]

All state-changing commands accept --manifest <path>. Capability tokens are
bound to one role, slice, pack fingerprint, and expiration time.`);
}
function print(value) { console.log(JSON.stringify(value, null, 2)); }
function option(args, name, fallback = '') { const i=args.indexOf(name); return i>=0 ? args[i+1] : fallback; }
function repeated(args,name) { const out=[]; for(let i=0;i<args.length;i++) if(args[i]===name&&args[i+1]) out.push(args[++i]); return out; }
function positional(args) { const out=[]; for(let i=0;i<args.length;i++) { if(args[i].startsWith('--')) i++; else out.push(args[i]); } return out; }
function manifest(args) { return option(args,'--manifest',positional(args)[0]??'.gauntlet/manifest.yaml'); }
function checked(args) { const v=validatePack(manifest(args)); if(!v.valid){print({valid:false,errors:v.errors});process.exit(1);} return v; }

const [command,...args]=process.argv.slice(2);
if(!command||['help','--help','-h'].includes(command)){usage();process.exit(0);}
try {
  if(command==='run') { print(runGauntlet({manifest:manifest(args),host:option(args,'--host','auto'),maxTurns:Number(option(args,'--max-turns','100')),timeoutMs:Number(option(args,'--timeout-ms','900000')),onEvent:e=>process.stderr.write(`${JSON.stringify(e)}\n`)})); process.exit(0); }
  if(command==='explain') { print(explainGauntlet(manifest(args))); process.exit(0); }
  if(command==='validate') { const v=validatePack(manifest(args)); print({valid:v.valid,fingerprint:v.fingerprint,errors:v.errors,warnings:v.warnings}); process.exit(v.valid?0:1); }
  const v=checked(args); const store=new RunStore(v.root);
  try {
    if(command==='init') print({initialized:true,...store.initialize(v)});
    else if(command==='status') { store.assertFingerprint(v.fingerprint); print(store.status()); }
    else if(command==='next') { store.assertFingerprint(v.fingerprint); print({ready:store.ready(v)}); }
    else if(command==='assign') { const [slice]=positional(args); print(store.assign({validation:v,sliceId:slice,role:option(args,'--role'),ttlSeconds:Number(option(args,'--ttl','3600'))})); }
    else if(command==='execute') { const [slice,testId]=positional(args); print(store.recordExecution({validation:v,token:option(args,'--token'),sliceId:slice,testId})); }
    else if(command==='transition') { const [slice,target]=positional(args); print({transitioned:true,event:store.transition({validation:v,token:option(args,'--token'),sliceId:slice,target,evidenceIds:repeated(args,'--evidence'),reason:option(args,'--reason','')})}); }
    else if(command==='authorize-release') print(store.authorizeRelease({target:option(args,'--target'),version:option(args,'--version'),approval:option(args,'--approval'),authoritySecret:process.env.GAUNTLET_AUTHORITY_SECRET}));
    else if(command==='release-check') {
      store.assertFingerprint(v.fingerprint); const d=v.documents['distribution-contract.yaml'];
      const ready=['clean_install','upgrade','rollback','checksums'].every(k=>d.requirements?.[k]===true);
      print({ready,artifacts:d.artifacts,fingerprint:v.fingerprint}); process.exit(ready?0:1);
    } else { usage(); process.exit(2); }
  } finally { store.close(); }
} catch(error) { console.error(JSON.stringify({error:{code:error.code??'GAUNTLET_ERROR',message:error.message,details:error.details??{}}},null,2)); process.exit(1); }
