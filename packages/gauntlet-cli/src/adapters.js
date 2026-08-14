import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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
function invoke(command,args,{cwd,timeoutMs=900000}) {
  const result=spawnSync(command,args,{cwd,encoding:'utf8',timeout:timeoutMs,maxBuffer:16*1024*1024,env:process.env});
  if(result.error)throw new AdapterError(result.error.code==='ETIMEDOUT'?'AGENT_TIMEOUT':'AGENT_LAUNCH_FAILED',result.error.message,{command});
  if(result.status!==0)throw new AdapterError('AGENT_FAILED',`${command} exited with ${result.status}`,{stderr:String(result.stderr??'').slice(-4000)});
  return result.stdout;
}
const RESULT_SCHEMA={type:'object',additionalProperties:false,properties:{verdict:{type:'string',enum:['complete','pass','repair','blocked']},summary:{type:'string'},reason:{type:'string'},largest_gap:{type:'string'},changed_files:{type:'array',items:{type:'string'}}},required:['verdict','summary','reason','largest_gap','changed_files']};
class CodexAdapter {
  constructor(){this.name='codex';}
  invoke({prompt,cwd,runtimeDir,timeoutMs}) {
    fs.mkdirSync(runtimeDir,{recursive:true});
    const schema=path.join(runtimeDir,`schema-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
    const output=path.join(runtimeDir,`result-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
    fs.writeFileSync(schema,JSON.stringify(RESULT_SCHEMA));
    try{invoke('codex',['exec','--ephemeral','--sandbox','workspace-write','--output-schema',schema,'-o',output,prompt],{cwd,timeoutMs});return parseJsonText(fs.readFileSync(output,'utf8'));}
    finally{fs.rmSync(schema,{force:true});fs.rmSync(output,{force:true});}
  }
}
class ClaudeAdapter {
  constructor(){this.name='claude';}
  invoke({prompt,cwd,timeoutMs}) {
    const out=invoke('claude',['-p',prompt,'--bare','--allowedTools','Read,Edit,Write,Bash','--permission-mode','acceptEdits','--output-format','json','--json-schema',JSON.stringify(RESULT_SCHEMA)],{cwd,timeoutMs});
    const envelope=parseJsonText(out);return envelope.structured_output??parseJsonText(envelope.result);
  }
}
class CopilotAdapter {
  constructor(){this.name='copilot';}
  invoke({prompt,cwd,timeoutMs}) {
    const constrained=`${prompt}\nReturn exactly one JSON object matching this schema, without Markdown:\n${JSON.stringify(RESULT_SCHEMA)}`;
    return parseJsonText(invoke('copilot',['-p',constrained,'-s','--no-ask-user','--allow-tool=read,write,shell'],{cwd,timeoutMs}));
  }
}
export function resolveAdapter(host='auto') {
  const choices={codex:CodexAdapter,claude:ClaudeAdapter,copilot:CopilotAdapter};
  if(host!=='auto'){if(!choices[host])throw new AdapterError('HOST_UNSUPPORTED',`Unsupported agent host: ${host}`);if(!executable(host))throw new AdapterError('HOST_NOT_FOUND',`${host} CLI is not installed or not authenticated`);return new choices[host]();}
  for(const name of ['codex','claude','copilot'])if(executable(name))return new choices[name]();
  throw new AdapterError('HOST_NOT_FOUND','No supported CLI found. Install and authenticate Codex, Claude Code, or Copilot CLI.');
}
export { RESULT_SCHEMA };
