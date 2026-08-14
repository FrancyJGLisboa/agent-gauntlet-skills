import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.argv[2]??'skills');let failures=0;
for(const entry of fs.existsSync(root)?fs.readdirSync(root,{withFileTypes:true}):[]){
  if(!entry.isDirectory())continue;const skill=path.join(root,entry.name,'SKILL.md');if(!fs.existsSync(skill))continue;
  const text=fs.readFileSync(skill,'utf8');
  if(!/^---\n[\s\S]*?\nname:\s*[a-z0-9-]+\n[\s\S]*?\ndescription:\s*.+\n[\s\S]*?\n---\n/.test(text)){console.error(`${skill}: invalid frontmatter`);failures++;}
  for(const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g))if(!/^[a-z]+:/i.test(match[1])&&!fs.existsSync(path.resolve(path.dirname(skill),match[1]))){console.error(`${skill}: missing reference ${match[1]}`);failures++;}
}
if(failures)process.exit(1);console.log('Skills valid');
