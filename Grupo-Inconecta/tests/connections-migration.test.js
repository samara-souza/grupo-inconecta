import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

test('migration 005 preserva conexões anteriores e permite o valor opcional',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  for(const filename of ['001_initial.sql','002_catalogos.sql','003_indices_leituras.sql','004_pix_aniversarios_conexoes.sql']){
   db.exec(readFileSync(new URL('../migrations/'+filename,import.meta.url),'utf8'));
  }
  for(const [id,nome] of [['a','Ana'],['b','Bruno']]){
   db.prepare("INSERT INTO usuarios(id,nome,email,senha_hash,perfil) VALUES(?,?,?,'hash','MEMBRO')").run('u'+id,nome,id+'@exemplo.test');
   db.prepare("INSERT INTO membros(id,usuario_id,telefone,status) VALUES(?,?,?,'ATIVO')").run(id,'u'+id,'41999999999');
  }
  db.prepare("INSERT INTO conexoes_convertidas (id,empresa_membro_id,visitante_membro_id,data_fechamento,observacao) VALUES('antigo','a','b','2026-11-10','Descrição preservada')").run();
  db.exec(readFileSync(new URL('../migrations/005_relatorio_conexoes_valores.sql',import.meta.url),'utf8'));
  const old=db.prepare("SELECT * FROM conexoes_convertidas WHERE id='antigo'").get();
  assert.equal(old.valor_centavos,null);
  assert.equal(old.observacao,'Descrição preservada');
  db.prepare("INSERT INTO conexoes_convertidas (id,empresa_membro_id,visitante_membro_id,data_fechamento,valor_centavos) VALUES('novo','a','b','2026-11-11',?)").run(99990);
  assert.equal(db.prepare("SELECT valor_centavos FROM conexoes_convertidas WHERE id='novo'").get().valor_centavos,99990);
  assert.throws(()=>db.prepare("UPDATE conexoes_convertidas SET valor_centavos=0 WHERE id='antigo'").run(),/CHECK constraint/);
  const index=db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='conexoes_visitante_data_idx'").get();
  assert.equal(index.name,'conexoes_visitante_data_idx');
 }finally{db.close();}
});
