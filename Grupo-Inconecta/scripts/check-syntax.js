import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function files(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())out.push(...await files(p));else if(p.endsWith('.js'))out.push(p);}return out;}
let fail=false;for(const f of [...await files('src'),...await files('scripts'),...await files('public/assets/js'),'server.js']){const r=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(r.status!==0){console.error(f,r.stderr);fail=true;}}
console.log(fail?'Erros de sintaxe.':'Sintaxe JS validada.');if(fail)process.exitCode=1;
