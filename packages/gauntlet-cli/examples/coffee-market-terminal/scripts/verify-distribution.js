import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..'); const out=fs.mkdtempSync(path.join(os.tmpdir(),'coffee-terminal-'));
const tarball=path.join(out,'coffee-market-terminal-1.0.0.tar.gz');
const packed=spawnSync('tar',['-czf',tarball,'package.json','src','data','test','scripts','Dockerfile'],{cwd:root,encoding:'utf8'});
assert.equal(packed.status,0,packed.stderr); assert.ok(fs.statSync(tarball).size>0);
const install=path.join(out,'install'); fs.mkdirSync(install);
const installed=spawnSync('tar',['-xzf',tarball,'-C',install],{encoding:'utf8'});
assert.equal(installed.status,0,installed.stderr);
const test=spawnSync('node',['--test'],{cwd:install,encoding:'utf8'});
assert.equal(test.status,0,test.stderr); console.log(JSON.stringify({clean_install:true,artifact:tarball,tests_passed:true}));
