import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { connectionReportQueries, formatConnectionReport, addMonths } from '../src/services/conexoesReportSql.js';

function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`
 CREATE TABLE usuarios(id TEXT PRIMARY KEY,nome TEXT);
 CREATE TABLE membros(id TEXT PRIMARY KEY,usuario_id TEXT);
 CREATE TABLE empresas(membro_id TEXT,nome TEXT);
 CREATE TABLE conexoes_convertidas(id TEXT PRIMARY KEY,empresa_membro_id TEXT,visitante_membro_id TEXT,data_fechamento TEXT,valor_centavos INTEGER);
 CREATE INDEX conexoes_empresa_data_idx ON conexoes_convertidas(empresa_membro_id,data_fechamento);
 CREATE INDEX conexoes_data_empresa_idx ON conexoes_convertidas(data_fechamento,empresa_membro_id);
 CREATE INDEX conexoes_visitante_data_idx ON conexoes_convertidas(visitante_membro_id,data_fechamento);
 `);
 for(const [id,nome,empresa] of [['a','Ana','Empresa Ana'],['b','Bruno','Empresa Bruno'],['c','Carla','Empresa Carla']]){
  db.prepare('INSERT INTO usuarios VALUES(?,?)').run('u'+id,nome);
  db.prepare('INSERT INTO membros VALUES(?,?)').run(id,'u'+id);
  db.prepare('INSERT INTO empresas VALUES(?,?)').run(id,empresa);
 }
 for(const row of [
  ['1','a','b','2026-09-12',null],
  ['2','a','c','2026-10-05',12000],
  ['3','b','a','2026-10-12',30000],
  ['4','a','b','2026-10-20',null],
  ['5','c','b','2026-11-02',5000]
 ])db.prepare('INSERT INTO conexoes_convertidas VALUES(?,?,?,?,?)').run(...row);
 const run=sql=>db.prepare(sql.sql).all(...sql.args);
 const report=(params)=>{
  const q=connectionReportQueries({referencia:'2026-11',...params});
  return formatConnectionReport({overview:run(q.overview)[0],byCompany:q.byCompany?run(q.byCompany):[],byVisitor:q.byVisitor?run(q.byVisitor):[],evolution:run(q.evolution),referencia:'2026-11',...params});
 };
 return {db,run,report};
}

test('mês selecionado retorna valores declarados, sem transformar campos ausentes em zero',()=>{
 const {db,report}=fixture();
 try{
  const r=report({mes:'2026-10',papel:'empresa',membro:''});
  assert.equal(r.resumo.total,3);
  assert.equal(r.resumo.comValor,2);
  assert.equal(r.resumo.semValor,1);
  assert.equal(r.resumo.valorTotalCentavos,42000);
  assert.equal(r.resumo.ticketMedioCentavos,21000);
  assert.equal(r.resumo.mediaPorEmpresa,1.5);
  assert.equal(r.resumo.empresasComConexoes,2);
  assert.equal(r.resumo.visitantesUnicos,3);
  assert.equal(r.resumo.percentualComValor,66.7);
  assert.equal(r.rankingEmpresas[0].membroId,'a');
  assert.equal(r.evolucao.find(x=>x.mes==='2026-10').total,3);
 }finally{db.close();}
});
test('filtro por membro diferencia empresa vendedora de visitante',()=>{
 const {db,report}=fixture();
 try{
  const company=report({mes:'2026-10',papel:'empresa',membro:'a'});
  assert.equal(company.resumo.total,2);
  assert.equal(company.resumo.valorTotalCentavos,null);
  assert.equal(company.resumo.ticketMedioCentavos,null);
  assert.equal(company.resumo.empresasComConexoes,null);
  assert.deepEqual(company.rankingEmpresas,[]);
  assert.deepEqual(company.rankingVisitantes,[]);
  assert.equal(company.evolucao.find(x=>x.mes==='2026-10').total,2);
  const visitor=report({mes:'2026-10',papel:'visitante',membro:'a'});
  assert.equal(visitor.resumo.total,1);
  assert.equal(visitor.resumo.valorTotalCentavos,null);
  assert.deepEqual(visitor.rankingEmpresas,[]);
  assert.deepEqual(visitor.rankingVisitantes,[]);
  assert.equal(visitor.evolucao.find(x=>x.mes==='2026-10').total,1);
  assert.equal(report({mes:'2026-10',papel:'visitante',membro:'inexistente'}).resumo.total,0);
  assert.equal(report({mes:'2026-01',papel:'empresa'}).resumo.ticketMedioCentavos,null);
 }finally{db.close();}
});
test('histórico sem mês e janela de evolução mantêm parâmetros indexáveis',()=>{
 const {db,report}=fixture();
 try{
  const result=report({papel:'empresa'});
  assert.equal(result.resumo.total,5);
  assert.equal(result.resumo.comValor,3);
  assert.equal(result.resumo.valorTotalCentavos,47000);
  assert.equal(result.resumo.ticketMedioCentavos,15667);
  assert.deepEqual(result.rankingEmpresas.map(x=>x.total),[3,1,1]);
  assert.equal(result.rankingEmpresas[0].total,3);
  assert.equal(result.rankingEmpresas[0].valorTotalCentavos,undefined);
  assert.equal(result.evolucao.length,6);
  assert.deepEqual(result.evolucao.map(x=>x.mes),['2026-06','2026-07','2026-08','2026-09','2026-10','2026-11']);
  assert.equal(addMonths('2026-01',-5),'2025-08');
  const q=connectionReportQueries({mes:'2026-10',membro:'b',papel:'visitante',referencia:'2026-11'});
  // Filtro individual só executa COUNT(*) e evolução mensal.
  assert.doesNotMatch(q.overview.sql,/SUM\(|valor_centavos|DISTINCT/);
  assert.equal(q.byCompany,null);
  assert.equal(q.byVisitor,null);
  assert.doesNotMatch(q.evolution.sql,/SUM\(|valor_centavos/);
  const full=connectionReportQueries({mes:'2026-10',referencia:'2026-11'});
  assert.match(full.overview.sql,/SUM\(c\.valor_centavos\)/);
  assert.match(full.byCompany.sql,/LIMIT 5/);
  assert.match(full.byVisitor.sql,/LIMIT 5/);
  const explain=db.prepare('EXPLAIN QUERY PLAN '+q.overview.sql).all(...q.overview.args).map(x=>x.detail).join(' ');
  assert.match(explain,/conexoes_visitante_data_idx/);
  assert.doesNotMatch(explain,/SCAN c\b/);
  assert.ok(!q.overview.sql.includes('substr(c.data_fechamento,1,7)=?'));
 }finally{db.close();}
});

test('sem filtro de membro, rankings continuam com 5 posições e incluem participantes sem empresa',()=>{
 const {db,report}=fixture();
 try{
  db.prepare('DELETE FROM empresas WHERE membro_id=?').run('b');
  const full=report({mes:'2026-10',papel:'empresa'});
  assert.equal(full.resumo.total,3);
  assert.equal(full.rankingEmpresas.length,2);
  assert.equal(full.rankingVisitantes.find(x=>x.membroId==='b').empresa,null);
  const q=connectionReportQueries({mes:'2026-10',papel:'empresa',referencia:'2026-11'});
  assert.match(q.byCompany.sql,/LIMIT 5/);
  assert.match(q.byVisitor.sql,/LIMIT 5/);
  const filtered=report({mes:'2026-10',papel:'empresa',membro:'a'});
  assert.equal(filtered.resumo.total,2);
  assert.equal(filtered.rankingEmpresas.length,0);
  assert.equal(filtered.rankingVisitantes.length,0);
  const sellerPlan=db.prepare('EXPLAIN QUERY PLAN '+connectionReportQueries({mes:'2026-10',papel:'empresa',membro:'a',referencia:'2026-11'}).overview.sql).all('a','2026-10-01','2026-11-01').map(x=>x.detail).join(' ');
  assert.match(sellerPlan,/conexoes_empresa_data_idx/);
  const visitorQ=connectionReportQueries({mes:'2026-10',papel:'visitante',membro:'b',referencia:'2026-11'});
  const visitorPlan=db.prepare('EXPLAIN QUERY PLAN '+visitorQ.overview.sql).all(...visitorQ.overview.args).map(x=>x.detail).join(' ');
  assert.match(visitorPlan,/conexoes_visitante_data_idx/);
 }finally{db.close();}
});
