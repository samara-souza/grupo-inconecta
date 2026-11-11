import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(':memory:');
test.after(()=>db.close());
{
 db.exec(readFileSync(new URL('../migrations/001_initial.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/003_indices_leituras.sql',import.meta.url),'utf8'));
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
