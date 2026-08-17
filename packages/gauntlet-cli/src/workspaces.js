import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function failure(code,message,details={}){const e=new Error(message);e.code=code;e.details=details;return e;}
// Applied to every invocation rather than to the commands that happen to need it
// today. cherry-pick and rebase create commits, so without an identity they fail on
// any machine with no global git config — a fresh container, a CI runner — and they
// fail at integration, after every builder, critic, and clean room has already been
// paid for. Callers that want a different identity pass their own -c later in argv,
// where git's last-wins rule gives it precedence.
const IDENTITY=['-c','user.name=Agent Gauntlet','-c','user.email=gauntlet@local'];
function git(args,cwd,{allowFailure=false}={}) {
  const r=spawnSync('git',[...IDENTITY,...args],{cwd,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
  if(!allowFailure&&r.status!==0)throw failure('GIT_OPERATION_FAILED',`git ${args[0]} failed`,{stderr:r.stderr?.trim(),cwd});
  return r;
}
function safe(id){return id.replace(/[^a-zA-Z0-9_.-]/g,'-');}
export class WorkspaceManager {
  constructor(validation,store){
    this.validation=validation;this.store=store;this.repo=path.resolve(validation.root,'..');
    if(git(['rev-parse','--show-toplevel'],this.repo,{allowFailure:true}).status!==0)throw failure('GIT_REQUIRED','Autonomous execution requires a Git repository');
    const tracked=git(['status','--porcelain','--untracked-files=no'],this.repo).stdout.trim();
    if(tracked)throw failure('WORKTREE_DIRTY','Tracked files must be committed before starting the Gauntlet',{files:tracked.split('\n')});
  }
  key(id,name){return `workspace_${id}_${name}`;}
  get(id){const dir=this.store.getMeta(this.key(id,'dir'));return dir?{dir,base:this.store.getMeta(this.key(id,'base')),branch:this.store.getMeta(this.key(id,'branch'))}:null;}
  ensure(id){
    const existing=this.get(id);if(existing&&fs.existsSync(existing.dir))return existing;
    const base=git(['rev-parse','HEAD'],this.repo).stdout.trim(),nonce=crypto.randomBytes(5).toString('hex'),branch=`gauntlet/${safe(id)}/${nonce}`;
    const dir=path.join(os.tmpdir(),`agent-gauntlet-${safe(id)}-${nonce}`);
    git(['worktree','add','-b',branch,dir,base],this.repo);
    this.store.setMeta(this.key(id,'dir'),dir);this.store.setMeta(this.key(id,'base'),base);this.store.setMeta(this.key(id,'branch'),branch);
    return {dir,base,branch};
  }
  // A detached checkout of the slice's committed head. It holds exactly what an
  // outsider would receive — no untracked builder scratch, no installed dependencies,
  // no caches — which is the only sense in which "clean room" is checkable.
  cleanRoom(id){
    const workspace=this.get(id);
    if(!workspace)throw failure('CLEAN_ROOM_UNAVAILABLE','No workspace exists for this slice',{slice:id});
    const commit=git(['rev-parse','HEAD'],workspace.dir).stdout.trim();
    const dir=path.join(os.tmpdir(),`agent-gauntlet-cleanroom-${safe(id)}-${crypto.randomBytes(5).toString('hex')}`);
    git(['worktree','add','--detach',dir,commit],this.repo);
    return {dir,commit};
  }
  removeCleanRoom(room){ if(room?.dir&&fs.existsSync(room.dir)) git(['worktree','remove','--force',room.dir],this.repo,{allowFailure:true}); }
  // --untracked-files=all is load-bearing twice over. Without it git collapses a new
  // untracked directory to "src/", so a builder that creates exactly the file its
  // scope declares is reported as working outside it; and a read-only agent could
  // add a file inside an already-untracked directory without changing the output at
  // all, which would pass the mutation check.
  changed(workspace){return git(['status','--porcelain','--untracked-files=all'],workspace.dir).stdout.trimEnd().split('\n').filter(Boolean).map(l=>l.slice(3).trim());}
  assertScope(workspace,spec){
    const changed=this.changed(workspace),scope=Array.isArray(spec.builder?.scope)?spec.builder.scope:[];
    if(!scope.length||!changed.length)return changed;
    const outside=changed.filter(file=>!scope.some(s=>file===s||file.startsWith(`${s.replace(/\/$/,'')}/`)));
    if(outside.length)throw failure('SCOPE_VIOLATION','Builder changed files outside its declared scope',{outside,scope});
    return changed;
  }
  // Restores paths a builder touched outside its slice scope so the worktree can
  // carry a bounded repair instead of wedging on the same violation forever.
  revert(workspace,paths){
    const reverted=[];
    for(const file of paths??[]){
      const tracked=git(['ls-files','--error-unmatch','--',file],workspace.dir,{allowFailure:true}).status===0;
      if(tracked)git(['checkout','--',file],workspace.dir,{allowFailure:true});
      else git(['clean','-fdx','--',file],workspace.dir,{allowFailure:true});
      reverted.push(file);
    }
    return reverted;
  }
  checkpoint(workspace,spec){
    const changed=this.assertScope(workspace,spec);if(!changed.length)return null;
    git(['add','--all'],workspace.dir);git(['-c','user.name=Agent Gauntlet','-c','user.email=gauntlet@local','commit','-m',`gauntlet(${spec.id}): builder checkpoint`],workspace.dir);
    return git(['rev-parse','HEAD'],workspace.dir).stdout.trim();
  }
  assertReadOnly(workspace,before){const after=git(['status','--porcelain','--untracked-files=all'],workspace.dir).stdout;if(after!==before)throw failure('CRITIC_MUTATION','Read-only agent modified the isolated workspace');}
  snapshot(workspace){return git(['status','--porcelain','--untracked-files=all'],workspace.dir).stdout;}
  // With concurrent slices the target branch moves under a slice that was verified
  // against an older base, and integrating anyway would merge work no clean room ever
  // saw in combination. Replaying the slice onto the new base is the recovery; the
  // caller must then re-run final verification, because the tree being verified has
  // changed. Every git call here is spawnSync, which blocks the event loop for its
  // duration — that is what keeps concurrent slices from interleaving git operations
  // on the same repository. Converting these to async spawn requires adding a mutex.
  rebase(id){
    const workspace=this.get(id);if(!workspace)return null;
    const base=git(['rev-parse','HEAD'],this.repo).stdout.trim();
    if(base===workspace.base)return null;
    const replay=git(['rebase','--onto',base,workspace.base],workspace.dir,{allowFailure:true});
    if(replay.status!==0){
      git(['rebase','--abort'],workspace.dir,{allowFailure:true});
      throw failure('INTEGRATION_REBASE_CONFLICT','Slice work conflicts with a sibling that integrated first',{slice:id,base,stderr:replay.stderr?.trim()});
    }
    this.store.setMeta(this.key(id,'base'),base);
    return base;
  }
  integrate(id){
    const workspace=this.get(id);if(!workspace)return;
    const current=git(['rev-parse','HEAD'],this.repo).stdout.trim();
    if(current!==workspace.base)throw failure('INTEGRATION_BASE_MOVED','Target branch changed while slice was isolated',{expected:workspace.base,observed:current});
    const commits=git(['rev-list','--reverse',`${workspace.base}..${workspace.branch}`],this.repo).stdout.trim().split('\n').filter(Boolean);
    for(const commit of commits)git(['cherry-pick',commit],this.repo);
    this.cleanup(id);
  }
  cleanup(id){const w=this.get(id);if(!w)return;if(fs.existsSync(w.dir))git(['worktree','remove','--force',w.dir],this.repo);git(['branch','-D',w.branch],this.repo,{allowFailure:true});for(const n of ['dir','base','branch'])this.store.db.prepare('DELETE FROM meta WHERE key=?').run(this.key(id,n));}
}
