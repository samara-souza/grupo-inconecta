import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { one,query,execute,transaction } from '../db/client.js';
import { authenticate } from '../middlewares/authenticate.js';
import { adminOnly,passwordChanged,memberActive } from '../middlewares/authorize.js';
import { login,publicUser,updatePassword,registerMember,resetMemberPassword,signOut } from '../auth/authService.js';
import { getSettings,ensureCharge,syncAllMembers,getOwnCharge,informPayment,confirmPayment,rejectPayment,beginReactivation,deactivateMember,syncMemberStatus } from '../services/cobrancaService.js';
import { AppError,fail } from '../lib/errors.js';
import { str,email,posInt,dateOnly,urlOrBlank,phoneBR,instagramHandle,freeTextOrBlank,paymentLink } from '../lib/validation.js';
import { audit } from '../lib/audit.js';
import { clearSession } from '../auth/session.js';
import { todayBR,plusDays } from '../lib/dates.js';

const r=Router();
const route=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
r.post('/auth/login',route(login));
r.use(authenticate);
r.post('/auth/logout',route(signOut));
r.get('/auth/me',route(async(req,res)=>res.json({user:await publicUser(req.user.id)})));
r.post('/auth/alterar-senha',route(updatePassword));
r.use(passwordChanged);

r.get('/me',route(async(req,res)=>res.json({user:await publicUser(req.user.id)})));
r.patch('/me',route(async(req,res)=>{
 const nome=str(req.body?.nome,'Nome',{min:2,max:150}),mail=email(req.body?.email);
 if(req.user.perfil==='MEMBRO'){
  const tel=phoneBR(req.body?.telefone,'Telefone',{required:true});
  await transaction(async tx=>{
   await tx.execute({sql:'UPDATE usuarios SET nome=?,email=? WHERE id=?',args:[nome,mail,req.user.id]});
   await tx.execute({sql:'UPDATE membros SET telefone=? WHERE id=?',args:[tel,req.user.membro_id]});
  });
 }else await execute('UPDATE usuarios SET nome=?,email=? WHERE id=?',[nome,mail,req.user.id]);
 res.json({user:await publicUser(req.user.id)});
}));
r.get('/me/empresa',route(async(req,res)=>{
 fail(req.user.perfil==='MEMBRO','Apenas membros possuem empresa.',403);
 const empresa=await one('SELECT id,nome,ramo,descricao,telefone,instagram,site FROM empresas WHERE membro_id=?',[req.user.membro_id]);res.json({empresa});
}));
r.put('/me/empresa',route(async(req,res)=>{
 fail(req.user.perfil==='MEMBRO','Apenas membros possuem empresa.',403);
 const b=req.body||{};const ramo=str(b.ramo,'Ramo de atividade',{min:2,max:120});fail(await one('SELECT id FROM ramos_atividade WHERE nome=? COLLATE NOCASE AND ativo=1',[ramo]),'Selecione um ramo cadastrado.');const v=[str(b.nome,'Empresa',{min:2,max:180}),ramo,str(b.descricao??'','Descrição da empresa',{max:120}),phoneBR(b.telefone,'Telefone comercial'),instagramHandle(b.instagram),freeTextOrBlank(b.site??'','Site'),req.user.membro_id];
 await execute('UPDATE empresas SET nome=?,ramo=?,descricao=?,telefone=?,instagram=?,site=? WHERE membro_id=?',v);res.json({message:'Empresa atualizada.'});
}));
r.get('/catalogos/ramos',route(async(req,res)=>res.json({items:await query('SELECT id,nome FROM ramos_atividade WHERE ativo=1 ORDER BY nome')})));
r.get('/diretorio',(req,res,next)=>req.user.perfil==='ADMIN'?next():memberActive(req,res,next),route(async(req,res)=>{
 // Exclui cobranças vencidas em aberto, a menos que informadas dentro da tolerância.
 const c=await getSettings(),lim=plusDays(todayBR(),-Number(c.tolerancia_dias));
 const items=await query(`SELECT u.nome AS membro,e.nome AS empresa,e.ramo,e.descricao,e.telefone,e.instagram,e.site
 FROM membros m JOIN usuarios u ON u.id=m.usuario_id JOIN empresas e ON e.membro_id=m.id
 WHERE m.status='ATIVO' AND u.ativo=1 AND trim(e.nome)<>'' AND NOT EXISTS (
 SELECT 1 FROM cobrancas c WHERE c.membro_id=m.id AND c.status IN ('PENDENTE','AGUARDANDO_CONFIRMACAO')
 AND c.vencimento<? AND (c.status='PENDENTE' OR c.informado_em IS NULL OR substr(c.informado_em,1,10)>?)) ORDER BY e.nome`,[lim,lim]);
 res.json({items});
}));
r.get('/me/cobranca',route(async(req,res)=>{
 fail(req.user.perfil==='MEMBRO','Somente membros.',403);res.json(await getOwnCharge(req.user.membro_id));
}));
r.post('/me/cobrancas/:id/informar',route(async(req,res)=>{
 fail(req.user.perfil==='MEMBRO','Somente membros.',403);
 res.json(await informPayment(req.user.membro_id,req.params.id));
}));
r.post('/me/cancelar',route(async(req,res)=>{
 fail(req.user.perfil==='MEMBRO','Somente membros.',403);
 fail(req.body?.confirmacao==='CANCELAR','Digite CANCELAR para confirmar a saída.');
 await deactivateMember(req.user.id,req.user.membro_id,'Cancelamento solicitado pelo membro');
 clearSession(res);res.json({message:'Participação cancelada e acesso desativado.'});
}));

r.use('/admin',adminOnly);
r.get('/admin/dashboard',route(async(req,res)=>{
 await syncAllMembers();const count=await one(`SELECT
 (SELECT COUNT(*) FROM membros WHERE status='ATIVO') AS ativos,
 (SELECT COUNT(*) FROM membros WHERE status='SUSPENSO') AS suspensos,
 (SELECT COUNT(*) FROM cobrancas WHERE status IN ('PENDENTE','AGUARDANDO_CONFIRMACAO')) AS pendencias,
 (SELECT COALESCE(SUM(valor_centavos),0) FROM cobrancas WHERE status='PAGO' AND substr(COALESCE(recebido_em,confirmado_em),1,7)=?) AS receitas_mes,
 (SELECT COALESCE(SUM(valor_centavos),0) FROM despesas WHERE status='PAGA' AND substr(data,1,7)=?) AS despesas_mes`,[todayBR().slice(0,7),todayBR().slice(0,7)]);
 res.json({indicadores:count});
}));
r.get('/admin/membros',route(async(req,res)=>{
 await syncAllMembers();const items=await query(`SELECT m.id,u.nome,u.email,m.telefone,m.status,m.proximo_vencimento,e.nome AS empresa,e.ramo
 FROM membros m JOIN usuarios u ON u.id=m.usuario_id JOIN empresas e ON e.membro_id=m.id ORDER BY u.nome`);
 res.json({items});
}));
r.post('/admin/membros',route(async(req,res)=>res.status(201).json(await registerMember(req.user.id,req.body||{}))));
r.post('/admin/membros/:id/redefinir-senha',route(async(req,res)=>res.json(await resetMemberPassword(req.user.id,req.params.id))));
r.post('/admin/membros/:id/reativar',route(async(req,res)=>res.json(await beginReactivation(req.user.id,req.params.id,req.body?.modalidade))));
r.post('/admin/membros/:id/desativar',route(async(req,res)=>res.json(await deactivateMember(req.user.id,req.params.id,str(req.body?.motivo??'Desativação administrativa','Motivo',{min:3,max:300})))));
r.get('/admin/pendencias',route(async(req,res)=>{
 await syncAllMembers();const c=await getSettings(),today=todayBR();const items=await query(`SELECT c.id,c.membro_id,c.tipo,c.competencia,c.valor_centavos,c.vencimento,c.status,c.informado_em,u.nome,e.nome AS empresa
 FROM cobrancas c JOIN membros m ON c.membro_id=m.id JOIN usuarios u ON m.usuario_id=u.id JOIN empresas e ON e.membro_id=m.id
 WHERE c.status IN ('PENDENTE','AGUARDANDO_CONFIRMACAO') ORDER BY CASE WHEN c.status='AGUARDANDO_CONFIRMACAO' THEN 0 ELSE 1 END, c.vencimento, u.nome`);
 res.json({items:items.map(x=>({...x,atrasado:today>plusDays(x.vencimento,Number(c.tolerancia_dias))}))});
}));
r.post('/admin/cobrancas/:id/confirmar',route(async(req,res)=>res.json(await confirmPayment(req.user.id,req.params.id,req.body?.recebidoEm))));
r.post('/admin/cobrancas/:id/rejeitar',route(async(req,res)=>res.json(await rejectPayment(req.user.id,req.params.id))));
r.get('/admin/configuracoes',route(async(req,res)=>res.json({configuracoes:await getSettings()})));
r.patch('/admin/configuracoes',route(async(req,res)=>{
 const b=req.body||{};const vals=[posInt(b.mensalidadeCentavos,'Mensalidade',1),posInt(b.adesaoCentavos,'Adesão',1),posInt(b.diaVencimento,'Dia de vencimento',1,28),posInt(b.toleranciaDias,'Tolerância',0,90),str(b.nomeRecebedor??'','Recebedor',{min:2,max:180}),paymentLink(b.linkMensalidade??'','Link mensalidade'),paymentLink(b.linkAdesao??'','Link adesão')];
 fail(Boolean(vals[5] && vals[6]),'Cadastre os dois links HTTPS para salvar a configuração financeira.');
 await transaction(async tx=>{
 await tx.execute({sql:`UPDATE configuracoes_financeiras SET mensalidade_centavos=?,adesao_centavos=?,dia_vencimento=?,tolerancia_dias=?,nome_recebedor=?,link_mensalidade=?,link_adesao=?,atualizado_em=CURRENT_TIMESTAMP,configurado=1 WHERE id=1`,args:vals});
 await audit(tx,req.user.id,'CONFIG_FINANCEIRA_ALTERADA','configuracoes_financeiras','1',{mensalidadeCentavos:vals[0],adesaoCentavos:vals[1],diaVencimento:vals[2],toleranciaDias:vals[3]});
 });res.json({configuracoes:await getSettings(),alerta:'Cobranças já criadas preservam valores e links anteriores. Revise os links no banco e as datas dos membros ativos.'});
}));
// Catálogos de escolha controlados pela administração.
const catalogTables={ramos:'ramos_atividade',categorias:'categorias_despesa'};
const catalogTable=req=>{const table=catalogTables[req.params.tipo];fail(Boolean(table),'Catálogo desconhecido.',404);return table;};
r.get('/admin/catalogos/:tipo',route(async(req,res)=>res.json({items:await query(`SELECT id,nome,ativo FROM ${catalogTable(req)} ORDER BY nome`)})));
r.post('/admin/catalogos/:tipo',route(async(req,res)=>{
 const table=catalogTable(req),nome=str(req.body?.nome,'Nome',{min:2,max:90}),id=randomUUID();
 fail(!(await one(`SELECT id FROM ${table} WHERE nome=? COLLATE NOCASE`,[nome])),'Este nome já está cadastrado.',409);
 await transaction(async tx=>{
  await tx.execute({sql:`INSERT INTO ${table} (id,nome,ativo) VALUES (?,?,1)`,args:[id,nome]});
  await audit(tx,req.user.id,'CATALOGO_CRIADO',table,id,{nome});
 });res.status(201).json({id,nome});
}));
r.patch('/admin/catalogos/:tipo/:id',route(async(req,res)=>{
 const table=catalogTable(req),current=await one(`SELECT * FROM ${table} WHERE id=?`,[req.params.id]);fail(current,'Registro não encontrado.',404);
 const nome=str(req.body?.nome,'Nome',{min:2,max:90});const ativo=req.body?.ativo===false?0:1;
 fail(!(await one(`SELECT id FROM ${table} WHERE nome=? COLLATE NOCASE AND id<>?`,[nome,req.params.id])),'Este nome já está cadastrado.',409);
 const used=await one(`SELECT COUNT(*) AS total FROM ${table==='ramos_atividade'?'empresas':'despesas'} WHERE ${table==='ramos_atividade'?'ramo':'categoria'}=? COLLATE NOCASE`,[current.nome]);
 fail(!Number(used.total)|| (nome.toLocaleLowerCase('pt-BR')===current.nome.toLocaleLowerCase('pt-BR') && ativo===1),
  'Este item possui registros vinculados. Para preservar os dados, mantenha o nome e a opção ativa.',409);
 await transaction(async tx=>{
  await tx.execute({sql:`UPDATE ${table} SET nome=?,ativo=? WHERE id=?`,args:[nome,ativo,req.params.id]});
  await audit(tx,req.user.id,'CATALOGO_EDITADO',table,req.params.id,{nome,ativo:!!ativo});
 });res.json({id:req.params.id,nome,ativo:!!ativo});
}));
r.get('/admin/despesas',route(async(req,res)=>res.json({items:await query('SELECT * FROM despesas ORDER BY data DESC LIMIT 300')})));
r.post('/admin/despesas',route(async(req,res)=>{
 const b=req.body||{},id=randomUUID();const categoria=str(b.categoria,'Categoria',{min:2,max:90});fail(await one('SELECT id FROM categorias_despesa WHERE nome=? COLLATE NOCASE AND ativo=1',[categoria]),'Selecione uma categoria cadastrada.');const vals=[id,str(b.descricao,'Descrição',{min:3,max:240}),categoria,posInt(b.valorCentavos,'Valor',1),dateOnly(b.data,'Data'),b.status];
 fail(['PAGA','PREVISTA'].includes(b.status),'Situação inválida.');
 await transaction(async tx=>{await tx.execute({sql:'INSERT INTO despesas (id,descricao,categoria,valor_centavos,data,status,criado_por) VALUES (?,?,?,?,?,?,?)',args:[...vals,req.user.id]});await audit(tx,req.user.id,'DESPESA_CRIADA','despesas',id,{valorCentavos:vals[3]});});res.status(201).json({id});
}));
r.patch('/admin/despesas/:id',route(async(req,res)=>{
 const b=req.body||{},categoria=str(b.categoria,'Categoria',{min:2,max:90});fail(await one('SELECT id FROM categorias_despesa WHERE nome=? COLLATE NOCASE AND ativo=1',[categoria]),'Selecione uma categoria cadastrada.');const vals=[str(b.descricao,'Descrição',{min:3,max:240}),categoria,posInt(b.valorCentavos,'Valor',1),dateOnly(b.data,'Data'),b.status];fail(['PAGA','PREVISTA'].includes(b.status),'Situação inválida.');
 await transaction(async tx=>{const result=await tx.execute({sql:'UPDATE despesas SET descricao=?,categoria=?,valor_centavos=?,data=?,status=? WHERE id=?',args:[...vals,req.params.id]});fail(Number(result.rowsAffected)>0,'Despesa não encontrada.',404);await audit(tx,req.user.id,'DESPESA_EDITADA','despesas',req.params.id);});res.json({message:'Despesa atualizada.'});
}));
// Relatórios por data efetiva de recebimento, não por data de criação da cobrança.
r.get('/admin/relatorios/caixa',route(async(req,res)=>{
 const mes=req.query.mes?String(req.query.mes):'';
 fail(!mes||/^\d{4}-(0[1-9]|1[0-2])$/.test(mes),'Mês inválido.');
 const params=[];
 const whereMes=mes?` AND substr(COALESCE(recebido_em,confirmado_em),1,7)=?`:'';
 if(mes)params.push(mes);
 const receitas=await query(`SELECT substr(COALESCE(recebido_em,confirmado_em),1,7) AS mes, tipo,SUM(valor_centavos) AS total, COUNT(*) AS quantidade FROM cobrancas WHERE status='PAGO' ${whereMes} GROUP BY mes,tipo ORDER BY mes DESC`,params);
 const despParams=mes?[mes]:[];
 const despesas=await query(`SELECT substr(data,1,7) AS mes,SUM(valor_centavos) AS total, COUNT(*) AS quantidade FROM despesas WHERE status='PAGA' ${mes?` AND substr(data,1,7)=?`:''} GROUP BY mes ORDER BY mes DESC`,despParams);
 const meses=new Map();
 const ensure=mesKey=>{if(!meses.has(mesKey))meses.set(mesKey,{mes:mesKey,receitasCentavos:0,despesasCentavos:0,adesoesCentavos:0,mensalidadesCentavos:0,reativacoesCentavos:0});return meses.get(mesKey);};
 for(const x of receitas){const m=ensure(x.mes);m.receitasCentavos+=Number(x.total);if(x.tipo==='ADESAO')m.adesoesCentavos+=Number(x.total);else if(x.tipo==='MENSALIDADE')m.mensalidadesCentavos+=Number(x.total);else m.reativacoesCentavos+=Number(x.total);}
 for(const x of despesas)ensure(x.mes).despesasCentavos+=Number(x.total);
 const items=[...meses.values()].map(m=>({...m,resultadoCentavos:m.receitasCentavos-m.despesasCentavos})).sort((a,b)=>b.mes.localeCompare(a.mes));
 res.json({items,filtros:{mes}});
}));
r.get('/admin/relatorios/membros',route(async(req,res)=>{
 // Consulta de leitura: não executa syncAllMembers() (N+1 consultas remotas no Turso).
 // A situação efetiva é projetada no SQL com a mesma tolerância utilizada no login.
 const status=req.query.status?String(req.query.status):'';
 fail(!status||['ATIVO','SUSPENSO','INATIVO','AGUARDANDO_ADESAO','AGUARDANDO_REATIVACAO'].includes(status),'Situação inválida.');
 const mes=req.query.mes?String(req.query.mes):'';
 fail(!mes||/^\d{4}-(0[1-9]|1[0-2])$/.test(mes),'Mês inválido.');
 const settings=await getSettings();const limite=plusDays(todayBR(),-Number(settings.tolerancia_dias));
 const conditions=[];const params=[limite,limite];
 if(status){conditions.push('s.status_efetivo=?');params.push(status);}
 if(mes){const [year,month]=mes.split('-').map(Number);const next=month===12?`${year+1}-01`:`${year}-${String(month+1).padStart(2,'0')}`;
  conditions.push('s.criado_em>=? AND s.criado_em<?');params.push(mes+'-01',next+'-01');}
 const items=await query(`WITH situacao AS (
  SELECT m.id,m.usuario_id,m.criado_em,m.proximo_vencimento,
   CASE WHEN m.status='ATIVO' AND m.proximo_vencimento < ?
      AND NOT EXISTS (SELECT 1 FROM cobrancas cp WHERE cp.membro_id=m.id
       AND cp.status='AGUARDANDO_CONFIRMACAO' AND cp.informado_em IS NOT NULL
       AND substr(cp.informado_em,1,10)<=?) THEN 'SUSPENSO'
    ELSE m.status END AS status_efetivo
  FROM membros m
 ), pagamentos AS (
  SELECT c.membro_id,
   SUM(CASE WHEN c.status='PAGO' THEN 1 ELSE 0 END) AS pagamentos_confirmados,
   SUM(CASE WHEN c.status='PAGO' THEN c.valor_centavos ELSE 0 END) AS total_pago_centavos,
   SUM(CASE WHEN c.status IN ('PENDENTE','AGUARDANDO_CONFIRMACAO') THEN 1 ELSE 0 END) AS cobrancas_em_aberto
  FROM cobrancas c GROUP BY c.membro_id
 )
 SELECT s.id,u.nome,e.nome AS empresa,e.ramo,s.status_efetivo AS status,
 s.criado_em AS cadastrado_em,s.proximo_vencimento,
 COALESCE(p.pagamentos_confirmados,0) AS pagamentos_confirmados,
 COALESCE(p.total_pago_centavos,0) AS total_pago_centavos,
 COALESCE(p.cobrancas_em_aberto,0) AS cobrancas_em_aberto
 FROM situacao s JOIN usuarios u ON u.id=s.usuario_id
 JOIN empresas e ON e.membro_id=s.id LEFT JOIN pagamentos p ON p.membro_id=s.id
 ${conditions.length?'WHERE '+conditions.join(' AND '):''}
 ORDER BY u.nome`,params);
 const resumo={total:items.length,ativos:items.filter(x=>x.status==='ATIVO').length,
  suspensos:items.filter(x=>x.status==='SUSPENSO').length,recebidoCentavos:items.reduce((acc,x)=>acc+Number(x.total_pago_centavos),0)};
 res.json({items,resumo});
}));
export default r;
