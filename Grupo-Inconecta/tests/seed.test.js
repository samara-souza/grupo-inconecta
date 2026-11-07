import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

test('seed de demonstração: proteção, cenários, idempotência e isolamento',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'grupo-seed-test-'));
 const file=path.join(dir,'seed.db');
 const env={...process.env,NODE_ENV:'test',TURSO_AUTH_TOKEN:'',TURSO_DATABASE_URL:'file:'+file,
   JWT_SECRET:randomBytes(48).toString('hex'),ADMIN_NOME:'Admin Seed',ADMIN_EMAIL:'admin@seed.test',ADMIN_PASSWORD:'SenhaSeed2026!Segura'};
 function run(script,customEnv=env){return spawnSync(process.execPath,[script],{env:customEnv,cwd:process.cwd(),encoding:'utf8',timeout:12000});}
 try{
  assert.equal(run('scripts/migrate.js').status,0);
  assert.equal(run('scripts/bootstrap-admin.js').status,0);
  const first=run('scripts/seed-demo.js');assert.equal(first.status,0,first.stderr);
  const db=new DatabaseSync(file);try{
   const count=(table)=>db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
   assert.equal(count('membros'),10);assert.equal(count('empresas'),10);assert.equal(count('despesas'),6);
   const expected=['ATIVO','SUSPENSO','INATIVO','AGUARDANDO_ADESAO','AGUARDANDO_REATIVACAO'];
   for(const state of expected)assert.ok(db.prepare('SELECT id FROM membros WHERE status=?').get(state));
   assert.ok(db.prepare("SELECT id FROM cobrancas WHERE status='AGUARDANDO_CONFIRMACAO'").get());
   assert.ok(db.prepare("SELECT id FROM cobrancas WHERE status='PENDENTE'").get());
   assert.ok(db.prepare("SELECT id FROM cobrancas WHERE status='PAGO'").get());
   const before=[count('usuarios'),count('cobrancas'),count('despesas'),count('auditoria')];
   const second=run('scripts/seed-demo.js');assert.equal(second.status,0,second.stderr);assert.match(second.stdout,/Nenhum dado foi duplicado/);
   assert.deepEqual([count('usuarios'),count('cobrancas'),count('despesas'),count('auditoria')],before);
  }finally{db.close();}
  const forbidden=run('scripts/seed-demo.js',{...env,NODE_ENV:'production'});
  assert.notEqual(forbidden.status,0);assert.match(forbidden.stderr,/NODE_ENV=development/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
