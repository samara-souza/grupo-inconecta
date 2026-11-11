import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { SYNC_CANDIDATE_SQL, SYNC_INSERT_SQL, SYNC_SUSPEND_SQL } from '../src/services/syncSql.js';

test('100 membros: gera uma cobrança por membro, sem duplicar, e suspende somente quem atrasou',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../migrations/001_initial.sql',import.meta.url),'utf8'));
 const insertUser=db.prepare("INSERT INTO usuarios (id,nome,email,senha_hash,perfil) VALUES (?,?,?,?,?)");
 const insertMember=db.prepare("INSERT INTO membros (id,usuario_id,telefone,status,proximo_vencimento) VALUES (?,?,?,?,?)");
 for(let i=0;i<100;i++){
  const id='m'+i;
  insertUser.run(id,'Membro '+i,`${id}@teste.example`,'hash','MEMBRO');
  insertMember.run(id,id,'41999999999','ATIVO','2026-11-10');
 }
 const candidate=db.prepare(SYNC_CANDIDATE_SQL);
 const insert=db.prepare(SYNC_INSERT_SQL);
 const suspend=db.prepare(SYNC_SUSPEND_SQL);
 assert.ok(candidate.get('2026-12-01','2026-11-05','2026-11-05'));
 assert.equal(insert.run('2026-12-01').changes,100);
 assert.equal(insert.run('2026-12-01').changes,0);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cobrancas WHERE tipo='MENSALIDADE'").get().n,100);
 assert.equal(candidate.get('2026-12-01','2026-11-05','2026-11-05'),undefined);
 assert.equal(suspend.all('2026-11-10','2026-11-10').length,0);
 const charge=db.prepare("SELECT id FROM cobrancas WHERE membro_id='m0'").get().id;
 db.prepare("UPDATE cobrancas SET status='AGUARDANDO_CONFIRMACAO', informado_em='2026-11-09T10:00:00' WHERE id=?").run(charge);
 const suspended=suspend.all('2026-11-11','2026-11-11');
 assert.equal(suspended.length,99);
 assert.equal(db.prepare("SELECT status FROM membros WHERE id='m0'").get().status,'ATIVO');
 assert.equal(db.prepare("SELECT status FROM membros WHERE id='m1'").get().status,'SUSPENSO');
 assert.equal(suspend.all('2026-11-11','2026-11-11').length,0);
 assert.equal(candidate.get('2026-12-01','2026-11-11','2026-11-11'),undefined);
 db.close();
});
