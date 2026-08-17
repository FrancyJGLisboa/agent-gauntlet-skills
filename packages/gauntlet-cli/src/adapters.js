import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

export class AdapterError extends Error {
  constructor(code, message, details = {}) { super(message); this.name='AdapterError'; this.code=code; this.details=details; }
}
function executable(name) { return spawnSync(name,['--version'],{encoding:'utf8',timeout:10000}).status===0; }
function parseJsonText(text) {
  const value=String(text??'').trim();
  try{return JSON.parse(value);}catch{}
  const fenced=value.match(/```(?:json)?\s*([\s\S]*?)```/i); if(fenced)try{return JSON.parse(fenced[1]);}catch{}
  const start=value.indexOf('{'),end=value.lastIndexOf('}'); if(start>=0&&end>start)try{return JSON.parse(value.slice(start,end+1));}catch{}
  throw new AdapterError('AGENT_OUTPUT_INVALID','Agent did not return valid JSON',{output:value.slice(0,2000)});
}
const OUTPUT_CAP=16*1024*1024;
// Asynchronous on purpose: spawnSync blocks the event loop for the whole agent turn,
// which makes concurrent builders and a parallel judge panel impossible. The failure
// codes are the ones the sync version produced, so callers see no behavioral change.
function invoke(command,args,{cwd,timeoutMs=900000}) {
  return new Promise((resolve,reject)=>{
    let child;
    try{ child=spawn(command,args,{cwd,env:process.env}); }
    catch(error){ reject(new AdapterError('AGENT_LAUNCH_FAILED',error.message,{command})); return; }
    let stdout='',stderr='',settled=false;
    const done=fn=>{ if(settled)return; settled=true; clearTimeout(timer); fn(); };
    const abort=(code,message)=>done(()=>{ child.kill('SIGKILL'); reject(new AdapterError(code,message,{command})); });
    const timer=setTimeout(()=>abort('AGENT_TIMEOUT',`${command} exceeded ${timeoutMs}ms`),timeoutMs);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    // Capping both streams reproduces spawnSync's maxBuffer: an agent that streams
    // without bound must fail rather than exhaust this process's memory.
    child.stdout.on('data',chunk=>{ stdout+=chunk; if(stdout.length>OUTPUT_CAP)abort('AGENT_LAUNCH_FAILED',`${command} exceeded the ${OUTPUT_CAP} byte output cap`); });
    child.stderr.on('data',chunk=>{ stderr+=chunk; if(stderr.length>OUTPUT_CAP)abort('AGENT_LAUNCH_FAILED',`${command} exceeded the ${OUTPUT_CAP} byte output cap`); });
    child.on('error',error=>done(()=>reject(new AdapterError('AGENT_LAUNCH_FAILED',error.message,{command}))));
    child.on('close',status=>done(()=>{
      if(status===0)resolve(stdout);
      else reject(new AdapterError('AGENT_FAILED',`${command} exited with ${status}`,{stderr:stderr.slice(-4000)}));
    }));
  });
}
const RESULT_SCHEMA={type:'object',additionalProperties:false,properties:{verdict:{type:'string',enum:['complete','pass','repair','blocked']},summary:{type:'string'},reason:{type:'string'},largest_gap:{type:'string'},changed_files:{type:'array',items:{type:'string'}},blocking_slice:{type:'string',description:'Id of an upstream slice that owns the defect, when the failure cannot be fixed inside this slice. Empty otherwise.'}},required:['verdict','summary','reason','largest_gap','changed_files','blocking_slice']};
class CodexAdapter {
  constructor(){this.name='codex';}
  async invoke({prompt,cwd,runtimeDir,timeoutMs,role,schema:shape=RESULT_SCHEMA}) {
    fs.mkdirSync(runtimeDir,{recursive:true});
    const schema=path.join(runtimeDir,`schema-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
    const output=path.join(runtimeDir,`result-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
    fs.writeFileSync(schema,JSON.stringify(shape));
    try{await invoke('codex',['exec','--ephemeral','--sandbox',role==='builder'||role==='compiler'?'workspace-write':'read-only','--output-schema',schema,'-o',output,prompt],{cwd,timeoutMs});return parseJsonText(fs.readFileSync(output,'utf8'));}
    finally{fs.rmSync(schema,{force:true});fs.rmSync(output,{force:true});}
  }
}
// `--bare` is intentionally absent: it restricts Anthropic authentication to
// ANTHROPIC_API_KEY or apiKeyHelper and never reads an existing interactive
// login, which makes every role fail for subscription users.
export function claudeArgs({prompt,role,schema=RESULT_SCHEMA}) {
  const writable=role==='builder'||role==='compiler';
  const args=['-p',prompt,'--allowedTools',writable?'Read,Edit,Write,Bash':'Read'];
  if(writable) args.push('--permission-mode','acceptEdits');
  args.push('--output-format','json','--json-schema',JSON.stringify(schema));
  return args;
}
class ClaudeAdapter {
  constructor(){this.name='claude';}
  async invoke({prompt,cwd,timeoutMs,role,schema}) {
    const out=await invoke('claude',claudeArgs({prompt,role,schema}),{cwd,timeoutMs});
    const envelope=parseJsonText(out);return envelope.structured_output??parseJsonText(envelope.result);
  }
}
class CopilotAdapter {
  constructor(){this.name='copilot';}
  async invoke({prompt,cwd,timeoutMs,role,schema=RESULT_SCHEMA}) {
    const constrained=`${prompt}\nReturn exactly one JSON object matching this schema, without Markdown:\n${JSON.stringify(schema)}`;
    const permissions=role==='builder'||role==='compiler'?'read,write,shell':'read';
    return parseJsonText(await invoke('copilot',['-p',constrained,'-s','--no-ask-user',`--allow-tool=${permissions}`],{cwd,timeoutMs}));
  }
}
export function resolveAdapter(host='auto') {
  const choices={codex:CodexAdapter,claude:ClaudeAdapter,copilot:CopilotAdapter};
  if(host!=='auto'){if(!choices[host])throw new AdapterError('HOST_UNSUPPORTED',`Unsupported agent host: ${host}`);if(!executable(host))throw new AdapterError('HOST_NOT_FOUND',`${host} CLI is not installed or not authenticated`);return new choices[host]();}
  for(const name of ['codex','claude','copilot'])if(executable(name))return new choices[name]();
  throw new AdapterError('HOST_NOT_FOUND','No supported CLI found. Install and authenticate Codex, Claude Code, or Copilot CLI.');
}
// What a stopped run owes the person who started it. `human_dependency` is a closed
// set on purpose: the escalation rule is that a human may be asked for authority,
// access, money, or a value call, and never for a technical verdict. `none` means no
// answer of theirs can unblock this.
export const BLOCKER_SCHEMA={type:'object',additionalProperties:false,properties:{
  classification:{type:'string',enum:['REPAIRABLE','STAGNANT','BLOCKED_ACCESS','BLOCKED_SEMANTICS','BLOCKED_AUTHORITY','PACK_DEFECT']},
  what_was_attempted:{type:'string'},
  what_stopped_it:{type:'string',description:'Plain language a subject-matter expert can read. No stack traces, no jargon.'},
  recommendation:{type:'string'},
  tradeoff:{type:'string',description:'What the recommendation costs, measured where possible.'},
  safe_default:{type:'string',description:'What happens if nobody decides anything.'},
  human_dependency:{type:'string',enum:['credentials','access','spending','authority','legal','value_conflict','none']},
  request_to_human:{type:'string',description:'The single question to ask. Must be empty when human_dependency is none.'}
},required:['classification','what_was_attempted','what_stopped_it','recommendation','tradeoff','safe_default','human_dependency','request_to_human']};
// A judge reports only what it saw between two anonymous artifacts. It is never
// told which is the candidate, and it has no field in which to declare consensus.
export const JUDGE_SCHEMA={type:'object',additionalProperties:false,properties:{winner:{type:'string',enum:['A','B','tie']},decisive_difference:{type:'string'}},required:['winner','decisive_difference']};
export { RESULT_SCHEMA };
