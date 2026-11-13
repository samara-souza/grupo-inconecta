import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { one,query,execute,transaction } from '../db/client.js';
import { authenticate } from '../middlewares/authenticate.js';
import { adminOnly,passwordChanged,memberActive } from '../middlewares/authorize.js';
import { login,publicUser,updatePassword,registerMember,resetMemberPassword,signOut } from '../auth/authService.js';
import { getSettings,ensureCharge,syncAllMembers,getOwnCharge,informPayment,confirmPayment,rejectPayment,beginReactivation,deactivateMember,syncMemberStatus } from '../services/cobrancaService.js';
import { AppError,fail } from '../lib/errors.js';
import { str,email,posInt,dateOnly,urlOrBlank,phoneBR,instagramHandle,freeTextOrBlank,pixCopiaCola,birthdayDate,yearMonth,nextYearMonth } from '../lib/validation.js';
import { audit } from '../lib/audit.js';
import { clearSession } from '../auth/session.js';
import { todayBR,plusDays } from '../lib/dates.js';
import { cachedRead, cacheMetrics } from '../lib/readCache.js';
import { connectionReportQueries, formatConnectionReport } from '../services/conexoesReportSql.js';

const r=Router();
const route=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
r.post('/auth/login',route(login));
r.use(authenticate);
r.post('/auth/logout',route(signOut));
const sessionProfile=u=>({id:u.id,nome:u.nome,email:u.email,perfil:u.perfil,troca_senha_obrigatoria:u.troca_senha_obrigatoria,membro_id:u.membro_id,status_membro:u.status_membro,telefone:u.telefone,data_nascimento:u.data_nascimento});
r.get('/auth/me',route(async(req,res)=>res.json({user:sessionProfile(req.user)})));
r.post('/auth/alterar-senha',route(updatePassword));
r.use(passwordChanged);

r.get('/me',route(async(req,res)=>res.json({user:sessionProfile(req.user)})));
r.patch('/me',route(async(req,res)=>{
 const nome=str(req.body?.nome,'Nome',{min:2,max:150}),mail=email(req.body?.email);
 if(req.user.perfil==='MEMBRO'){
  const tel=phoneBR(req.body?.telefone,'Telefone',{required:true}),birth=birthdayDate(req.body?.dataNascimento);
  await transaction(async tx=>{
   await tx.execute({sql:'UPDATE usuarios SET nome=?,email=? WHERE id=?',args:[nome,mail,req.user.id]});
   await tx.execute({sql:'UPDATE membros SET telefone=?,data_nascimento=? WHERE id=?',args:[tel,birth,req.user.membro_id]});
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
r.get('/catalogos/ramos',route(async(req,res)=>res.json({items:await cachedRead('ramos:ativos',60_000,()=>query('SELECT id,nome FROM ramos_atividade WHERE ativo=1 ORDER BY nome'))})));
r.get('/diretorio',(req,res,next)=>req.user.perfil==='ADMIN'?next():memberActive(req,res,next),route(async(req,res)=>{
 // Exclui cobranças vencidas em aberto, a menos que informadas dentro da tolerância.
 const c=await getSettings(),lim=plusDays(todayBR(),-Number(c.tolerancia_dias));
 const mes=yearMonth(req.query.mes||todayBR().slice(0,7));
 const items=await cachedRead('diretorio:'+lim+':'+mes,30_000,()=>query(`SELECT u.nome AS membro,e.nome AS empresa,e.ramo,e.descricao,e.telefone,e.instagram,e.site,
 COALESCE(n.total,0) AS negocios_mes
 FROM membros m JOIN usuarios u ON u.id=m.usuario_id JOIN empresas e ON e.membro_id=m.id
 LEFT JOIN (SELECT empresa_membro_id,COUNT(*) AS total FROM conexoes_convertidas
 WHERE data_fechamento>=? AND data_fechamento<? GROUP BY empresa_membro_id) n ON n.empresa_membro_id=m.id
 WHERE m.status='ATIVO' AND u.ativo=1 AND trim(e.nome)<>'' AND NOT EXISTS (
 SELECT 1 FROM cobrancas c WHERE c.membro_id=m.id AND c.status IN ('PENDENTE','AGUARDANDO_CONFIRMACAO')
 AND c.vencimento<? AND (c.status='PENDENTE' OR c.informado_em IS NULL OR substr(c.informado_em,1,10)>?)) ORDER BY e.nome`,[mes+'-01',nextYearMonth(mes)+'-01',lim,lim]));
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


// Divulgação: somente dia/mês, nome e empresa; nunca ano de nascimento.
const activeOrAdmin=(req,res,next)=>req.user.perfil==='ADMIN'?next():memberActive(req,res,next);
r.get('/aniversariantes',activeOrAdmin,route(async(req,res)=>{
 const mes=yearMonth(req.query.mes||todayBR().slice(0,7));
 const items=await cachedRead('aniversarios:'+mes.slice(5),60_000,()=>query(`
  SELECT u.nome,e.nome AS empresa,substr(m.data_nascimento,9,2) AS dia,
  substr(m.data_nascimento,6,2) AS mes
  FROM membros m JOIN usuarios u ON u.id=m.usuario_id JOIN empresas e ON e.membro_id=m.id
  WHERE m.status='ATIVO' AND u.ativo=1 AND substr(m.data_nascimento,6,2)=?
  ORDER BY dia,u.nome`,[mes.slice(5)]));
 res.json({items,mes});
}));

r.get('/membros/ativos',memberActive,route(async(req,res)=>{
 const items=await cachedRead('membros:ativos:selecao',30_000,()=>query(`
 SELECT m.id,u.nome,e.nome AS empresa FROM membros m JOIN usuarios u ON u.id=m.usuario_id
 LEFT JOIN empresas e ON e.membro_id=m.id WHERE m.status='ATIVO' AND u.ativo=1 ORDER BY u.nome`));
 // Um participante não pode declarar um negócio realizado com ele próprio.
 res.json({items:items.filter(x=>x.id!==req.user.membro_id)});
}));

r.get('/me/conexoes',memberActive,route(async(req,res)=>{
 const mes=req.query.mes?yearMonth(req.query.mes):'';
 const visitante=req.query.visitante?str(req.query.visitante,'Membro',{min:1,max:64}):'';
 const pagina=posInt(req.query.pagina??'1','Página',1,100000);
 const where=['c.empresa_membro_id=?'],args=[req.user.membro_id];
 if(mes){where.push('c.data_fechamento>=? AND c.data_fechamento<?');args.push(mes+'-01',nextYearMonth(mes)+'-01');}
 if(visitante){where.push('c.visitante_membro_id=?');args.push(visitante);}
 const filter=where.join(' AND ');
 // Agrega quantidade e valores na mesma consulta: um único round-trip para os indicadores,
 // sem depender da paginação de 100 registros e sem consulta adicional ao Turso.
 const [summary,items]=await Promise.all([
  one(`SELECT COUNT(*) AS total, COUNT(c.valor_centavos) AS com_valor,
   COALESCE(SUM(c.valor_centavos),0) AS valor_total_centavos
   FROM conexoes_convertidas c WHERE ${filter}`,args),
  query(`SELECT c.id,c.data_fechamento,c.observacao,c.valor_centavos,c.visitante_membro_id,u.nome AS visitante,e.nome AS empresa_visitante
  FROM conexoes_convertidas c JOIN membros m ON m.id=c.visitante_membro_id
  JOIN usuarios u ON u.id=m.usuario_id LEFT JOIN empresas e ON e.membro_id=m.id
  WHERE ${filter} ORDER BY c.data_fechamento DESC,c.criado_em DESC,c.id DESC LIMIT 100 OFFSET ?`,[...args,(pagina-1)*100])
 ]);
 res.json({items,total:Number(summary?.total||0),resumo:{comValor:Number(summary?.com_valor||0),valorTotalCentavos:Number(summary?.valor_total_centavos||0)},pagina,porPagina:100});
}));

r.post('/me/conexoes',memberActive,route(async(req,res)=>{
 const visitante=str(req.body?.visitanteMembroId,'Membro visitante',{min:1,max:64});
 fail(visitante!==req.user.membro_id,'Não é possível registrar um negócio com sua própria empresa.');
 const data=dateOnly(req.body?.dataFechamento,'Data do negócio');
 fail(data<=todayBR(),'A data do negócio não pode ser futura.');
 const observacao=str(req.body?.observacao??'','Observação',{max:240});
 // NULL indica valor não declarado: negócios antigos não serão tratados como R$ 0.
 const value=req.body?.valorCentavos;
 const valorCentavos=value===undefined||value===null||value===''?null:posInt(value,'Valor do negócio',1,100000000000);
 const id=randomUUID();
 await transaction(async tx=>{
  const check=(await tx.execute({sql:`SELECT m.id FROM membros m JOIN usuarios u ON u.id=m.usuario_id
   WHERE m.id=? AND m.status='ATIVO' AND u.ativo=1`,args:[visitante]})).rows[0];
  fail(check,'Selecione um membro ativo válido.',409);
  await tx.execute({sql:'INSERT INTO conexoes_convertidas (id,empresa_membro_id,visitante_membro_id,data_fechamento,observacao,valor_centavos) VALUES (?,?,?,?,?,?)',args:[id,req.user.membro_id,visitante,data,observacao,valorCentavos]});
  await audit(tx,req.user.id,'CONEXAO_CONVERTIDA_REGISTRADA','conexoes_convertidas',id,{dataFechamento:data,valorDeclarado:valorCentavos!==null});
 });
 res.status(201).json({id,message:'Negócio registrado.'});
}));

r.delete('/me/conexoes/:id',memberActive,route(async(req,res)=>{
 const id=str(req.params.id,'Registro',{min:1,max:64});
 await transaction(async tx=>{
  const removed=await tx.execute({sql:'DELETE FROM conexoes_convertidas WHERE id=? AND empresa_membro_id=?',args:[id,req.user.membro_id]});
  fail(Number(removed.rowsAffected)>0,'Registro não encontrado em sua empresa.',404);
  await audit(tx,req.user.id,'CONEXAO_CONVERTIDA_REMOVIDA','conexoes_convertidas',id);
 });
 res.json({message:'Registro removido.'});
}));

r.use('/admin',adminOnly);
r.get('/admin/diagnostico/cache',route(async(req,res)=>res.json({cache:cacheMetrics(),observacao:'Contadores deste processo; não equivalem a linhas lidas do Turso.'})));
r.get('/admin/dashboard',route(async(req,res)=>{
 await syncAllMembers();const count=await cachedRead('dashboard:'+todayBR().slice(0,7),15_000,()=>one(`SELECT
 (SELECT COUNT(*) FROM membros WHERE status='ATIVO') AS ativos,
 (SELECT COUNT(*) FROM membros WHERE status='SUSPENSO') AS suspensos,
 (SELECT COUNT(*) FROM cobrancas WHERE status IN ('PENDENTE','AGUARDANDO_CONFIRMACAO')) AS pendencias,
 (SELECT COALESCE(SUM(valor_centavos),0) FROM cobrancas WHERE status='PAGO' AND substr(COALESCE(recebido_em,confirmado_em),1,7)=?) AS receitas_mes,
 (SELECT COALESCE(SUM(valor_centavos),0) FROM despesas WHERE status='PAGA' AND substr(data,1,7)=?) AS despesas_mes`,[todayBR().slice(0,7),todayBR().slice(0,7)]));
 res.json({indicadores:count});
}));
r.get('/admin/membros',route(async(req,res)=>{
 await syncAllMembers();const items=await cachedRead('admin:membros',15_000,()=>query(`SELECT m.id,u.nome,u.email,m.telefone,m.data_nascimento,m.status,m.proximo_vencimento,e.nome AS empresa,e.ramo
 FROM membros m JOIN usuarios u ON u.id=m.usuario_id JOIN empresas e ON e.membro_id=m.id ORDER BY u.nome`));
 res.json({items});
}));
r.post('/admin/membros',route(async(req,res)=>res.status(201).json(await registerMember(req.user.id,req.body||{}))));
r.patch('/admin/membros/:id/aniversario',route(async(req,res)=>{
 const data=birthdayDate(req.body?.dataNascimento);
 await transaction(async tx=>{
  const result=await tx.execute({sql:'UPDATE membros SET data_nascimento=? WHERE id=?',args:[data,req.params.id]});
  fail(Number(result.rowsAffected)>0,'Membro não encontrado.',404);
  await audit(tx,req.user.id,'ANIVERSARIO_ATUALIZADO','membros',req.params.id,{preenchido:Boolean(data)});
 });
 res.json({message:'Aniversário atualizado.'});
}));
r.post('/admin/membros/:id/redefinir-senha',route(async(req,res)=>res.json(await resetMemberPassword(req.user.id,req.params.id))));
r.post('/admin/membros/:id/reativar',route(async(req,res)=>res.json(await beginReactivation(req.user.id,req.params.id,req.body?.modalidade))));
r.post('/admin/membros/:id/desativar',route(async(req,res)=>res.json(await deactivateMember(req.user.id,req.params.id,str(req.body?.motivo??'Desativação administrativa','Motivo',{min:3,max:300})))));
r.get('/admin/pendencias',route(async(req,res)=>{
 await syncAllMembers();const c=await getSettings(),today=todayBR();const items=await cachedRead('pendencias:'+today,10_000,()=>query(`SELECT c.id,c.membro_id,c.tipo,c.competencia,c.valor_centavos,c.vencimento,c.status,c.informado_em,u.nome,e.nome AS empresa
 FROM cobrancas c JOIN membros m ON c.membro_id=m.id JOIN usuarios u ON m.usuario_id=u.id JOIN empresas e ON e.membro_id=m.id
 WHERE c.status IN ('PENDENTE','AGUARDANDO_CONFIRMACAO') ORDER BY CASE WHEN c.status='AGUARDANDO_CONFIRMACAO' THEN 0 ELSE 1 END, c.vencimento, u.nome`));
 res.json({items:items.map(x=>({...x,atrasado:today>plusDays(x.vencimento,Number(c.tolerancia_dias))}))});
}));
r.post('/admin/cobrancas/:id/confirmar',route(async(req,res)=>res.json(await confirmPayment(req.user.id,req.params.id,req.body?.recebidoEm))));
r.post('/admin/cobrancas/:id/rejeitar',route(async(req,res)=>res.json(await rejectPayment(req.user.id,req.params.id))));
r.get('/admin/configuracoes',route(async(req,res)=>res.json({configuracoes:await getSettings()})));
r.patch('/admin/configuracoes',route(async(req,res)=>{
 const b=req.body||{};const vals=[posInt(b.mensalidadeCentavos,'Mensalidade',1),posInt(b.adesaoCentavos,'Adesão',1),posInt(b.diaVencimento,'Dia de vencimento',1,28),posInt(b.toleranciaDias,'Tolerância',0,90),str(b.nomeRecebedor??'','Recebedor',{min:2,max:180}),pixCopiaCola(b.pixMensalidade??'','Pix mensalidade'),pixCopiaCola(b.pixAdesao??'','Pix adesão')];
 fail(Boolean(vals[5] && vals[6]),'Cadastre os dois códigos Pix Copia e Cola para salvar a configuração financeira.');
 await transaction(async tx=>{
 await tx.execute({sql:`UPDATE configuracoes_financeiras SET mensalidade_centavos=?,adesao_centavos=?,dia_vencimento=?,tolerancia_dias=?,nome_recebedor=?,pix_mensalidade=?,pix_adesao=?,atualizado_em=CURRENT_TIMESTAMP,configurado=1 WHERE id=1`,args:vals});
 await tx.execute({sql:"UPDATE cobrancas SET pix_copia_cola=CASE WHEN tipo IN ('ADESAO','REATIVACAO_ADESAO') THEN ? ELSE ? END WHERE status='PENDENTE'",args:[vals[6],vals[5]]});
  await audit(tx,req.user.id,'CONFIG_FINANCEIRA_ALTERADA','configuracoes_financeiras','1',{mensalidadeCentavos:vals[0],adesaoCentavos:vals[1],diaVencimento:vals[2],toleranciaDias:vals[3]});
 });res.json({configuracoes:await getSettings(),alerta:'Os códigos Pix foram atualizados nas cobranças pendentes; valores, vencimentos e pagamentos já informados foram preservados. Confira os dados no aplicativo do banco.'});
}));
// Catálogos de escolha controlados pela administração.
const catalogTables={ramos:'ramos_atividade',categorias:'categorias_despesa'};
const catalogTable=req=>{const table=catalogTables[req.params.tipo];fail(Boolean(table),'Catálogo desconhecido.',404);return table;};
r.get('/admin/catalogos/:tipo',route(async(req,res)=>{const table=catalogTable(req);res.json({items:await cachedRead('catalogo:'+table,60_000,()=>query(`SELECT id,nome,ativo FROM ${table} ORDER BY nome`))});}));
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
r.get('/admin/despesas',route(async(req,res)=>res.json({items:await cachedRead('despesas:300',30_000,()=>query('SELECT * FROM despesas ORDER BY data DESC LIMIT 300'))})));
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
 const receitas=await cachedRead('caixa:receitas:'+mes,30_000,()=>query(`SELECT substr(COALESCE(recebido_em,confirmado_em),1,7) AS mes, tipo,SUM(valor_centavos) AS total, COUNT(*) AS quantidade FROM cobrancas WHERE status='PAGO' ${whereMes} GROUP BY mes,tipo ORDER BY mes DESC`,params));
 const despParams=mes?[mes]:[];
 const despesas=await cachedRead('caixa:despesas:'+mes,30_000,()=>query(`SELECT substr(data,1,7) AS mes,SUM(valor_centavos) AS total, COUNT(*) AS quantidade FROM despesas WHERE status='PAGA' ${mes?` AND substr(data,1,7)=?`:''} GROUP BY mes ORDER BY mes DESC`,despParams));
 const meses=new Map();
 const ensure=mesKey=>{if(!meses.has(mesKey))meses.set(mesKey,{mes:mesKey,receitasCentavos:0,despesasCentavos:0,adesoesCentavos:0,mensalidadesCentavos:0,reativacoesCentavos:0});return meses.get(mesKey);};
 for(const x of receitas){const m=ensure(x.mes);m.receitasCentavos+=Number(x.total);if(x.tipo==='ADESAO')m.adesoesCentavos+=Number(x.total);else if(x.tipo==='MENSALIDADE')m.mensalidadesCentavos+=Number(x.total);else m.reativacoesCentavos+=Number(x.total);}
 for(const x of despesas)ensure(x.mes).despesasCentavos+=Number(x.total);
 const items=[...meses.values()].map(m=>({...m,resultadoCentavos:m.receitasCentavos-m.despesasCentavos})).sort((a,b)=>b.mes.localeCompare(a.mes));
 res.json({items,filtros:{mes}});
}));
// Relatório exclusivamente administrativo: somente totais agrupados, sem observações privadas.
r.get('/admin/relatorios/conexoes/membros',route(async(req,res)=>{
 const items=await cachedRead('relatorio:conexoes:membros',60_000,()=>query(`
 SELECT m.id,u.nome,e.nome AS empresa FROM membros m
 JOIN usuarios u ON u.id=m.usuario_id LEFT JOIN empresas e ON e.membro_id=m.id
 ORDER BY u.nome`));
 res.json({items});
}));
r.get('/admin/relatorios/conexoes',route(async(req,res)=>{
 const mes=req.query.mes?yearMonth(req.query.mes):'';
 const papel=req.query.papel||'empresa';
 fail(['empresa','visitante'].includes(papel),'Tipo de participação inválido.');
 const membro=req.query.membro?str(req.query.membro,'Membro',{min:1,max:64}):'';
 const referencia=todayBR().slice(0,7);
 const result=await cachedRead(`relatorio:conexoes:${mes}:${papel}:${membro}:${referencia}`,30_000,async()=>{
  const q=connectionReportQueries({mes,papel,membro,referencia});
  const [overview,byCompany,byVisitor,evolution]=await Promise.all([
   one(q.overview.sql,q.overview.args),
   q.byCompany?query(q.byCompany.sql,q.byCompany.args):[],
   q.byVisitor?query(q.byVisitor.sql,q.byVisitor.args):[],
   query(q.evolution.sql,q.evolution.args)
  ]);
  return formatConnectionReport({overview,byCompany,byVisitor,evolution,mes,papel,membro,referencia});
 });
 res.json(result);
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
 const items=await cachedRead('relatorio:membros:'+status+':'+mes+':'+limite,30_000,()=>query(`WITH situacao AS (
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
 ORDER BY u.nome`,params));
 const resumo={total:items.length,ativos:items.filter(x=>x.status==='ATIVO').length,
  suspensos:items.filter(x=>x.status==='SUSPENSO').length,recebidoCentavos:items.reduce((acc,x)=>acc+Number(x.total_pago_centavos),0)};
 res.json({items,resumo});
}));
export default r;
