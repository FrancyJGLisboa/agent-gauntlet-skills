import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(process.argv[2]??'.');
const required=['AGENTS.md','CLAUDE.md','.github/copilot-instructions.md','docs/architecture.md'];
const failures=[];
for(const file of required)if(!fs.existsSync(path.join(root,file)))failures.push(`missing ${file}`);
if(!failures.length){
  const agents=fs.readFileSync(path.join(root,'AGENTS.md'),'utf8');
  const packageRoot=fs.existsSync(path.join(root,'packages/gauntlet-cli/src/cli.js'))?path.join(root,'packages/gauntlet-cli'):root;
  const cli=fs.readFileSync(path.join(packageRoot,'src/cli.js'),'utf8');
  const architecture=fs.readFileSync(path.join(root,'docs/architecture.md'),'utf8');
  // Derived from package.json rather than hardcoded: this check exists to catch a
  // command that stops being documented, not to pin the published name in place.
  const published=JSON.parse(fs.readFileSync(path.join(packageRoot,'package.json'),'utf8')).name;
  for(const command of ['deliver','run','validate','explain'])if(!agents.includes(`${published} ${command}`))failures.push(`AGENTS.md does not describe ${command} as \`${published} ${command}\``);
  for(const command of ['deliver','run','explain'])if(!cli.includes(`command==='${command}'`))failures.push(`CLI does not expose documented command ${command}`);
  for(const file of ['engine.js','orchestrator.js','adapters.js','workspaces.js'])if(!agents.includes(file))failures.push(`AGENTS.md omits ${file}`);
  for(const state of ['pending','building','critiquing','repairing','passed','final_verification','verified','blocked'])if(!architecture.includes(state))failures.push(`architecture omits state ${state}`);
  for(const entry of ['CLAUDE.md','.github/copilot-instructions.md'])if(!fs.readFileSync(path.join(root,entry),'utf8').includes('AGENTS.md'))failures.push(`${entry} does not delegate to AGENTS.md`);
}
if(failures.length){for(const failure of failures)console.error(failure);process.exit(1);}
console.log('Agent documentation is complete and aligned');
