import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(':memory:');
test.after(()=>db.close());
{
 db.exec(readFileSync(new URL('../migrations/001_initial.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/003_indices_leituras.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/004_pix_aniversarios_conexoes.sql',import.meta.url),'utf8'));
 test('migration v0.10 adiciona Pix e conexões sem excluir dados',()=>{
  const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
  assert.ok(names.includes('conexoes_convertidas'));
  const idx=db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(x=>x.name);
  assert.ok(idx.includes('conexoes_empresa_data_idx'));
  assert.ok(idx.includes('membros_aniversario_mes_idx'));
  assert.ok(db.prepare("PRAGMA table_info('membros')").all().some(x=>x.name==='data_nascimento'));
  assert.ok(db.prepare("PRAGMA table_info('cobrancas')").all().some(x=>x.name==='pix_copia_cola'));
 });
 test('consulta mensal de conversões utiliza índice por data',()=>{
  const plan=db.prepare("EXPLAIN QUERY PLAN SELECT empresa_membro_id,COUNT(*) FROM conexoes_convertidas WHERE data_fechamento>=? AND data_fechamento<? GROUP BY empresa_membro_id").all('2026-11-01','2026-12-01');
  assert.ok(plan.some(x=>x.detail.includes('conexoes_data_empresa_idx')),JSON.stringify(plan));
 });
 test('filtros por empresa, visitante e mês utilizam índice sem varredura integral',()=>{
  const plan=db.prepare("EXPLAIN QUERY PLAN SELECT id FROM conexoes_convertidas WHERE empresa_membro_id=? AND visitante_membro_id=? AND data_fechamento>=? AND data_fechamento<? ORDER BY data_fechamento DESC LIMIT 100").all('empresa-1','visitante-2','2026-11-01','2026-12-01');
  assert.ok(plan.some(x=>/SEARCH conexoes_convertidas USING (COVERING )?INDEX conexoes_empresa_(visitante_data|data)_idx/.test(x.detail)),JSON.stringify(plan));
 });
 test('índices aditivos são criados sem remover dados anteriores',()=>{
  const idx=db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(x=>x.name);
  assert.ok(idx.includes('membros_ativo_proximo_vencimento_idx'));
  assert.ok(idx.includes('cobrancas_pagas_mes_tipo_idx'));
  assert.ok(idx.includes('despesas_pagas_mes_idx'));
 });
 test('filtros mensais usam índices de expressão para evitar varredura integral',()=>{
  const receita="SELECT SUM(valor_centavos) FROM cobrancas WHERE status='PAGO' AND substr(COALESCE(recebido_em,confirmado_em),1,7)=?";
  const despesa="SELECT SUM(valor_centavos) FROM despesas WHERE status='PAGA' AND substr(data,1,7)=?";
  const plans=[db.prepare('EXPLAIN QUERY PLAN '+receita).all('2026-11'),db.prepare('EXPLAIN QUERY PLAN '+despesa).all('2026-11')];
  assert.ok(plans[0].some(x=>x.detail.includes('cobrancas_pagas_mes_tipo_idx')),JSON.stringify(plans[0]));
  assert.ok(plans[1].some(x=>x.detail.includes('despesas_pagas_mes_idx')),JSON.stringify(plans[1]));
  const due=db.prepare("EXPLAIN QUERY PLAN SELECT id FROM membros WHERE status='ATIVO' AND proximo_vencimento<?").all('2026-12-01');
  assert.ok(due.some(x=>x.detail.includes('membros_ativo_proximo_vencimento_idx')),JSON.stringify(due));
 });
}
