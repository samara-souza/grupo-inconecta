import { randomUUID } from 'node:crypto';
import { one,query,transaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { todayBR,plusDays,nextDueAtLeast30Days,nextMonthDue } from '../lib/dates.js';
import { AppError,fail } from '../lib/errors.js';
import { dateOnly } from '../lib/validation.js';
import { SYNC_CANDIDATE_SQL, SYNC_INSERT_SQL, SYNC_SUSPEND_SQL } from './syncSql.js';

const OPEN="('PENDENTE','AGUARDANDO_CONFIRMACAO')";
export async function getSettings(){return one('SELECT * FROM configuracoes_financeiras WHERE id=1');}
export async function ensureCharge(memberId){
 const m=await one('SELECT * FROM membros WHERE id=?',[memberId]);if(!m || m.status!=='ATIVO' || !m.proximo_vencimento)return;
 const today=todayBR();if(m.proximo_vencimento.slice(0,7)>today.slice(0,7))return;
 const open=await one(`SELECT id FROM cobrancas WHERE membro_id=? AND status IN ${OPEN} LIMIT 1`,[memberId]);if(open)return;
 const c=await getSettings();
 await transaction(async tx=>{
  const member=(await tx.execute({sql:'SELECT * FROM membros WHERE id=?',args:[memberId]})).rows[0];
  if(!member || member.status!=='ATIVO' || member.proximo_vencimento!==m.proximo_vencimento)return;
  const pending=(await tx.execute({sql:`SELECT id FROM cobrancas WHERE membro_id=? AND status IN ${OPEN} LIMIT 1`,args:[memberId]})).rows[0];if(pending)return;
  await tx.execute({sql:`INSERT OR IGNORE INTO cobrancas (id,membro_id,tipo,competencia,valor_centavos,vencimento,link_pagamento) VALUES (?,?,?,?,?,?,?)`,
    args:[randomUUID(),memberId,'MENSALIDADE',m.proximo_vencimento.slice(0,7),c.mensalidade_centavos,m.proximo_vencimento,c.link_mensalidade]});
 });
}
export async function syncMemberStatus(memberId){
 await ensureCharge(memberId);
 const m=await one('SELECT status FROM membros WHERE id=?',[memberId]);if(!m)return null;
 if(m.status!=='ATIVO')return m.status;
 const conf=await getSettings(),today=todayBR();
 const due=await one(`SELECT id FROM cobrancas WHERE membro_id=? AND status IN ${OPEN} AND vencimento < ?
 AND (status='PENDENTE' OR informado_em IS NULL OR substr(informado_em,1,10) > ?) ORDER BY vencimento LIMIT 1`,
 [memberId,plusDays(today,-Number(conf.tolerancia_dias)),plusDays(today,-Number(conf.tolerancia_dias))]);
 if(due){await transaction(async tx=>{
  const r=await tx.execute({sql:"UPDATE membros SET status='SUSPENSO' WHERE id=? AND status='ATIVO'",args:[memberId]});
  if(Number(r.rowsAffected))await audit(tx,null,'SUSPENSAO_AUTOMATICA','membros',memberId,{cobrancaId:due.id});
 });return 'SUSPENSO';}
 return 'ATIVO';
}
export async function syncAllMembers(){
 const today=todayBR();
 const cfg=await getSettings();
 const limite=plusDays(today,-Number(cfg.tolerancia_dias));
 // Consulta leve e sem escrita no caminho comum (nenhuma situação a atualizar).
 const candidate=await one(SYNC_CANDIDATE_SQL,[today.slice(0,7),limite,limite]);
 if(!candidate)return;
 // Uma única transação gera cobranças vencendo neste mês e suspende inadimplentes.
 // Em vez de uma ida ao Turso por membro, usa SQL em lote.
 await transaction(async tx=>{
  await tx.execute({sql:SYNC_INSERT_SQL,args:[today.slice(0,7)]});
  const suspensos=await tx.execute({sql:SYNC_SUSPEND_SQL,args:[limite,limite]});
  for(const item of suspensos.rows){
   await audit(tx,null,'SUSPENSAO_AUTOMATICA','membros',String(item.id));
  }
 });
}
export async function getOwnCharge(memberId){await syncMemberStatus(memberId);const [m,c]=await Promise.all([
 one('SELECT status,proximo_vencimento FROM membros WHERE id=?',[memberId]),
 one(`SELECT id,tipo,competencia,valor_centavos,vencimento,link_pagamento,status,informado_em FROM cobrancas WHERE membro_id=? AND status IN ${OPEN} ORDER BY criado_em DESC LIMIT 1`,[memberId])]);
 const settings=await getSettings();return {statusMembro:m?.status,proximoVencimento:m?.proximo_vencimento,nomeRecebedor:settings?.nome_recebedor,cobranca:c || null};
}
export async function informPayment(memberId,chargeId){
 return transaction(async tx=>{
  const charge=(await tx.execute({sql:'SELECT status FROM cobrancas WHERE id=? AND membro_id=?',args:[chargeId,memberId]})).rows[0];
  fail(charge,'Cobrança não encontrada.',404);fail(charge.status==='PENDENTE','Somente cobranças pendentes podem ser informadas.',409);
  await tx.execute({sql:"UPDATE cobrancas SET status='AGUARDANDO_CONFIRMACAO',informado_em=? WHERE id=?",args:[new Date().toISOString(),chargeId]});
  return {message:'Pagamento informado. Aguarde a confirmação administrativa.'};
 });
}
export async function confirmPayment(actor,chargeId,receiptDay){
 const now=new Date().toISOString(),received=receiptDay?dateOnly(receiptDay,'Data de recebimento'):todayBR();
 fail(received<=todayBR(),'O recebimento não pode ter data futura.');
 return transaction(async tx=>{
  const r=(await tx.execute({sql:'SELECT * FROM cobrancas WHERE id=?',args:[chargeId]})).rows[0];fail(r,'Cobrança não encontrada.',404);
  fail(r.status==='PENDENTE' || r.status==='AGUARDANDO_CONFIRMACAO','Esta cobrança já foi finalizada.',409);
  const m=(await tx.execute({sql:'SELECT * FROM membros WHERE id=?',args:[r.membro_id]})).rows[0];
  fail(m && m.status!=='INATIVO','Membro inativo; regularize o cadastro antes da confirmação.',409);
  await tx.execute({sql:"UPDATE cobrancas SET status='PAGO',confirmado_em=?,recebido_em=?,confirmado_por=? WHERE id=?",args:[now,received,actor,chargeId]});
  const settings=(await tx.execute('SELECT * FROM configuracoes_financeiras WHERE id=1')).rows[0];
  if(r.tipo==='ADESAO' || r.tipo.startsWith('REATIVACAO_')){
   // Substitui dívidas anteriores no retorno, sem contabilizá-las como receita.
   await tx.execute({sql:`UPDATE cobrancas SET status='CANCELADA' WHERE membro_id=? AND id<>? AND status IN ${OPEN}`,args:[m.id,chargeId]});
   await tx.execute({sql:"UPDATE membros SET status='ATIVO',proximo_vencimento=?,adesao_confirmada_em=COALESCE(adesao_confirmada_em,?),desativado_em=NULL,motivo_desativacao=NULL WHERE id=?",args:[nextDueAtLeast30Days(received,Number(settings.dia_vencimento)),now,m.id]});
  }else if(r.tipo==='MENSALIDADE'){
   const next=nextMonthDue(r.vencimento,Number(settings.dia_vencimento));
   await tx.execute({sql:"UPDATE membros SET status='ATIVO',proximo_vencimento=? WHERE id=?",args:[next,m.id]});
  }
  await audit(tx,actor,'PAGAMENTO_CONFIRMADO','cobrancas',chargeId,{valorCentavos:Number(r.valor_centavos),recebidoEm:received});
  return {message:'Pagamento confirmado.',proximoVencimento:r.tipo==='MENSALIDADE'?nextMonthDue(r.vencimento,Number(settings.dia_vencimento)):nextDueAtLeast30Days(received,Number(settings.dia_vencimento))};
 });
}
export async function rejectPayment(actor,chargeId){
 return transaction(async tx=>{
 const r=(await tx.execute({sql:'SELECT * FROM cobrancas WHERE id=?',args:[chargeId]})).rows[0];
 fail(r,'Cobrança não encontrada.',404);fail(r.status==='AGUARDANDO_CONFIRMACAO','Apenas pagamentos informados podem ser rejeitados.',409);
 await tx.execute({sql:"UPDATE cobrancas SET status='PENDENTE',informado_em=NULL WHERE id=?",args:[chargeId]});
 await audit(tx,actor,'PAGAMENTO_REJEITADO','cobrancas',chargeId);return {message:'Pagamento rejeitado; cobrança disponível para nova informação.'};
 });
}
export async function beginReactivation(actor,memberId,mode){
 fail(['ADESAO','MENSALIDADE'].includes(mode),'Escolha ADESAO ou MENSALIDADE.');
 return transaction(async tx=>{
 const m=(await tx.execute({sql:'SELECT * FROM membros WHERE id=?',args:[memberId]})).rows[0];fail(m,'Membro não encontrado.',404);
 fail(['SUSPENSO','INATIVO'].includes(m.status),'Somente membros suspensos ou inativos podem ser reativados.',409);
 const c=(await tx.execute('SELECT * FROM configuracoes_financeiras WHERE id=1')).rows[0];const day=todayBR();
 await tx.execute({sql:`UPDATE cobrancas SET status='CANCELADA' WHERE membro_id=? AND status IN ${OPEN}`,args:[memberId]});
 const id=randomUUID();await tx.execute({sql:`INSERT INTO cobrancas (id,membro_id,tipo,competencia,valor_centavos,vencimento,link_pagamento) VALUES (?,?,?,?,?,?,?)`,
 args:[id,memberId,mode==='ADESAO'?'REATIVACAO_ADESAO':'REATIVACAO_MENSALIDADE',day.slice(0,7),mode==='ADESAO'?c.adesao_centavos:c.mensalidade_centavos,day,mode==='ADESAO'?c.link_adesao:c.link_mensalidade]});
 await tx.execute({sql:"UPDATE membros SET status='AGUARDANDO_REATIVACAO',desativado_em=NULL WHERE id=?",args:[memberId]});
 await tx.execute({sql:"UPDATE usuarios SET ativo=1,versao_autenticacao=versao_autenticacao+1 WHERE id=?",args:[m.usuario_id]});
 await audit(tx,actor,'REATIVACAO_INICIADA','membros',memberId,{modalidade:mode,cobrancaId:id});return {cobrancaId:id};
 });
}
export async function deactivateMember(actor,memberId,motivo='Desativado pela administração'){
 return transaction(async tx=>{
 const m=(await tx.execute({sql:'SELECT * FROM membros WHERE id=?',args:[memberId]})).rows[0];fail(m,'Membro não encontrado.',404);fail(m.status!=='INATIVO','Membro já está inativo.',409);
 await tx.execute({sql:"UPDATE membros SET status='INATIVO',desativado_em=?,motivo_desativacao=? WHERE id=?",args:[new Date().toISOString(),motivo,memberId]});
 await tx.execute({sql:`UPDATE cobrancas SET status='CANCELADA' WHERE membro_id=? AND status IN ${OPEN}`,args:[memberId]});
 await tx.execute({sql:'UPDATE usuarios SET ativo=0,versao_autenticacao=versao_autenticacao+1 WHERE id=?',args:[m.usuario_id]});
 await audit(tx,actor,'MEMBRO_DESATIVADO','membros',memberId,{motivo});return {message:'Membro desativado.'};
 });
}
