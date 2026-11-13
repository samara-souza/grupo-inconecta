import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// Exercita a consulta SQL real do relatório sem dependências externas/Turso.
const source=readFileSync('src/controllers/routes.js','utf8');
const prefix='()=>query(`WITH situacao AS (';
const start=source.indexOf(prefix);
const end=source.indexOf('ORDER BY u.nome`,params));',start);
assert.ok(start>=0 && end>start,'Consulta de relatório encontrada no backend');
const baseSQL='WITH situacao AS ('+source.slice(start+prefix.length,end)+'ORDER BY u.nome';
const conditionToken="${conditions.length?'WHERE '+conditions.join(' AND '):''}";
assert.ok(baseSQL.includes(conditionToken));
const db=new DatabaseSync(':memory:');
db.exec(readFileSync('migrations/001_initial.sql','utf8'));
const insert=(sql,...args)=>db.prepare(sql).run(...args);
for(const [n,due] of [['A','2026-10-10'],['B','2026-10-10'],['C','2027-01-10']]){
 insert("INSERT INTO usuarios (id,nome,email,senha_hash,perfil) VALUES (?,?,?,?,?)",n,'Membro '+n,n+'@teste.example','hash','MEMBRO');
 insert("INSERT INTO membros (id,usuario_id,telefone,status,proximo_vencimento) VALUES (?,?,?,?,?)",n,n,'41999999999','ATIVO',due);
 insert('INSERT INTO empresas (id,membro_id,nome) VALUES (?,?,?)','e'+n,n,'Empresa '+n);
}
insert("INSERT INTO cobrancas (id,membro_id,tipo,competencia,valor_centavos,vencimento,status) VALUES (?,?,?,?,?,?,?)",'ca','A','MENSALIDADE','2026-10',10000,'2026-10-10','PENDENTE');
insert("INSERT INTO cobrancas (id,membro_id,tipo,competencia,valor_centavos,vencimento,status,informado_em) VALUES (?,?,?,?,?,?,?,?)",'cb','B','MENSALIDADE','2026-10',10000,'2026-10-10','AGUARDANDO_CONFIRMACAO','2026-10-11T12:00:00');

test('relatório de membros projeta suspensão e preserva análise pendente',()=>{
 const query=baseSQL.replace(conditionToken,'');
 const items=db.prepare(query).all('2026-11-02','2026-11-02');
 assert.deepEqual(Object.fromEntries(items.map(r=>[r.id,r.status])),{A:'SUSPENSO',B:'ATIVO',C:'ATIVO'});
 assert.equal(items[0].total_pago_centavos,0);
 assert.ok(!Object.hasOwn(items[0],'email'),'não expõe e-mail do membro no relatório financeiro');
});

test('filtro de situação usa mesma projeção, sem alterar registros',()=>{
 const query=baseSQL.replace(conditionToken,'WHERE s.status_efetivo=?');
 const suspensos=db.prepare(query).all('2026-11-02','2026-11-02','SUSPENSO');
 assert.deepEqual(suspensos.map(r=>r.id),['A']);
 assert.equal(db.prepare("SELECT status FROM membros WHERE id='A'").get().status,'ATIVO');
});
