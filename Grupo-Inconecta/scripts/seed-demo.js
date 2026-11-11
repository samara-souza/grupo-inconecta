import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { getClient, closeTursoClient, testTursoConnection } from '../src/db/client.js';
import { todayBR, plusDays, nextMonthDue } from '../src/lib/dates.js';

const SEED_MARKER = 'SEED_DEMO_V03';
const DEMO_PASSWORD = 'Demo@2026!GrupoNegocios';
const DEMO_LINK = 'https://example.com/pagamento-ficticio';
const DEMOS = [
  ['Marina Albuquerque','Marina Marketing','Marketing','ATIVO','pago'],
  ['Rafael Costa','RC Engenharia','Engenharia','ATIVO','informado'],
  ['Beatriz Martins','B. Martins Contábil','Contabilidade','ATIVO','pendente'],
  ['Lucas Ferreira','LF Tecnologia','Tecnologia','ATIVO','pago'],
  ['Camila Ribeiro','Camila Arquitetura','Arquitetura','ATIVO','proximo'],
  ['Eduardo Barros','EB Consultoria','Consultoria','AGUARDANDO_ADESAO','adesao'],
  ['Fernanda Melo','FM Design','Design','AGUARDANDO_ADESAO','adesao-informada'],
  ['Gustavo Lima','GL Construções','Construção Civil','SUSPENSO','atrasado'],
  ['Patrícia Souza','PS Eventos','Eventos','AGUARDANDO_REATIVACAO','reativacao'],
  ['Thiago Nunes','TN Soluções','Serviços','INATIVO','inativo'],
];
function assertAllowed(){
 const url = process.env.TURSO_DATABASE_URL || '';
 if(process.env.NODE_ENV==='test' && url.startsWith('file:'))return;
 if(process.env.NODE_ENV!=='development')throw Error('Seed permitido somente com NODE_ENV=development.');
 if(!/^libsql:\/\/[^/]*?(?:dev|test)[^/]*\.turso\.io(?:\/|$)/i.test(url)){
  throw Error('Proteção: a URL deve apontar explicitamente para um banco Turso de desenvolvimento (nome contendo dev ou test).');
 }
}
function firstOfMonth(d){return d.slice(0,7)+'-01';}
function monthOffset(day,delta){const [y,m]=day.slice(0,7).split('-').map(Number);const date=new Date(Date.UTC(y,m-1+delta,10,12));return date.toISOString().slice(0,7);}
function dueOfMonth(month,due){return month+'-'+String(due).padStart(2,'0');}

async function seed(){
 assertAllowed();await testTursoConnection();const db=getClient();
 const admin=(await db.execute("SELECT id FROM usuarios WHERE perfil='ADMIN' ORDER BY criado_em LIMIT 1")).rows[0];
 if(!admin)throw Error('Crie primeiro o administrador: npm run db:bootstrap.');
 const seeded=(await db.execute({sql:'SELECT id FROM auditoria WHERE acao=? LIMIT 1',args:[SEED_MARKER]})).rows[0];
 if(seeded){console.log('Seed já aplicado anteriormente. Nenhum dado foi duplicado.');return;}
 const duplicates=(await db.execute("SELECT COUNT(*) AS n FROM usuarios WHERE email LIKE 'demo.%.teste@example.com'")).rows[0];
 if(Number(duplicates.n))throw Error('Há usuários demo anteriores sem marcador de seed. Verifique o banco manualmente.');
 const passHash=await bcrypt.hash(DEMO_PASSWORD,12),today=todayBR();
 const tx=await db.transaction('write');
 try{
  const read=async(sql,args=[])=> (await tx.execute({sql,args})).rows[0];
  const write=async(sql,args=[])=>tx.execute({sql,args});
  const original=await read('SELECT * FROM configuracoes_financeiras WHERE id=1');
  if(!original)throw Error('Aplique as migrations antes do seed.');
  if(Number(original.configurado)!==1){
   await write(`UPDATE configuracoes_financeiras SET mensalidade_centavos=10000,adesao_centavos=15000,dia_vencimento=10,tolerancia_dias=5,nome_recebedor='ESTELA — DEMONSTRAÇÃO',link_mensalidade=?,link_adesao=?,configurado=1,atualizado_em=CURRENT_TIMESTAMP WHERE id=1`,[DEMO_LINK,DEMO_LINK]);
  }
  const settings=await read('SELECT * FROM configuracoes_financeiras WHERE id=1');
  const dueDay=Number(settings.dia_vencimento),grace=Number(settings.tolerancia_dias);
  const thisMonth=today.slice(0,7),nextMonth=monthOffset(today,1);
  const thisDue=dueOfMonth(thisMonth,dueDay);
  const nextDue=dueOfMonth(nextMonth,dueDay);
  // Não suspendemos imediatamente membros de demonstração que ainda aguardam conferência.
  const openDue=today>plusDays(thisDue,grace)?nextDue:thisDue;
  let countCharges=0;
  async function charge(mid,type,month,value,status,due,reported=null){
   const id=randomUUID();const paid=status==='PAGO';
   const received=paid?(plusDays(due,-2)>today?today:plusDays(due,-2)):null;
   await write(`INSERT INTO cobrancas (id,membro_id,tipo,competencia,valor_centavos,vencimento,link_pagamento,status,informado_em,confirmado_em,recebido_em,confirmado_por) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id,mid,type,month,value,due,DEMO_LINK,status,reported,paid?`${received}T14:00:00.000Z`:null,received,paid?admin.id:null]);
   countCharges++;return id;
  }
  let exampleEmail='';
  for(let i=0;i<DEMOS.length;i++){
   const [name,company,segment,status,scenario]=DEMOS[i];
   const email=`demo.${String(i+1).padStart(2,'0')}.teste@example.com`;
   if(i===0)exampleEmail=email;
   const uid=randomUUID(),mid=randomUUID(),eid=randomUUID();
   await write(`INSERT INTO usuarios (id,nome,email,senha_hash,perfil,ativo,troca_senha_obrigatoria) VALUES (?,?,?,?,?,?,0)`,
    [uid,name,email,passHash,'MEMBRO',status==='INATIVO'?0:1]);
   const activationDate=plusDays(today,-120);
   const next=status==='ATIVO'?(scenario==='pago'?nextDue:scenario==='proximo'?nextDue:openDue):null;
   await write(`INSERT INTO membros (id,usuario_id,telefone,status,proximo_vencimento,adesao_confirmada_em,desativado_em,motivo_desativacao) VALUES (?,?,?,?,?,?,?,?)`,
    [mid,uid,`4199900${String(i+1).padStart(4,'0')}`,status,next,status==='AGUARDANDO_ADESAO'?null:`${activationDate}T14:00:00.000Z`,status==='INATIVO'?today:null,status==='INATIVO'?'Saída de demonstração':null]);
   await write(`INSERT INTO empresas (id,membro_id,nome,ramo,descricao,telefone,instagram,site) VALUES (?,?,?,?,?,?,?,?)`,
    [eid,mid,company+' (Demo)',segment,`Empresa fictícia para testar o diretório de ${segment.toLocaleLowerCase('pt-BR')}.`,`4199900${String(i+1).padStart(4,'0')}`,`demo_empresa_${i+1}`,'']);
   if(status==='AGUARDANDO_ADESAO'){
    await charge(mid,'ADESAO',thisMonth,settings.adesao_centavos,scenario==='adesao-informada'?'AGUARDANDO_CONFIRMACAO':'PENDENTE',today,scenario==='adesao-informada'?`${today}T12:00:00.000Z`:null);
    continue;
   }
   await charge(mid,'ADESAO',monthOffset(today,-4),settings.adesao_centavos,'PAGO',dueOfMonth(monthOffset(today,-4),dueDay));
   for(let delta=-3;delta<=-1;delta++){
    if(scenario==='atrasado' && monthOffset(today,delta)===plusDays(today,-(grace+4)).slice(0,7))continue;
    await charge(mid,'MENSALIDADE',monthOffset(today,delta),settings.mensalidade_centavos,'PAGO',dueOfMonth(monthOffset(today,delta),dueDay));
   }
   if(scenario==='pago')await charge(mid,'MENSALIDADE',thisMonth,settings.mensalidade_centavos,'PAGO',thisDue);
   else if(scenario==='informado'||scenario==='pendente')await charge(mid,'MENSALIDADE',openDue.slice(0,7),settings.mensalidade_centavos,scenario==='informado'?'AGUARDANDO_CONFIRMACAO':'PENDENTE',openDue,scenario==='informado'?`${today}T12:00:00.000Z`:null);
   else if(scenario==='atrasado'){const overdue=plusDays(today,-(grace+4));await charge(mid,'MENSALIDADE',overdue.slice(0,7),settings.mensalidade_centavos,'PENDENTE',overdue);}
   else if(scenario==='reativacao')await charge(mid,'REATIVACAO_MENSALIDADE',thisMonth,settings.mensalidade_centavos,'PENDENTE',today);
  }
  const expenses=[
    ['Aluguel do espaço','Infraestrutura',68000,-2,'PAGA'],
    ['Coffee break encontro','Eventos',21000,-1,'PAGA'],
    ['Material de divulgação','Marketing',13500,-1,'PAGA'],
    ['Hospedagem da apresentação','Tecnologia',4500,0,'PAGA'],
    ['Reserva do próximo encontro','Eventos',30000,7,'PREVISTA'],
    ['Serviços de apoio','Serviços',9000,10,'PREVISTA']
  ];
  for(const [description,category,value,dayOffset,status] of expenses){
   await write(`INSERT INTO despesas (id,descricao,categoria,valor_centavos,data,status,criado_por) VALUES (?,?,?,?,?,?,?)`,
    [randomUUID(),`${description} (Demo)`,category,value,plusDays(today,dayOffset),status,admin.id]);
  }
  await write(`INSERT INTO auditoria (id,usuario_id,acao,entidade,entidade_id,detalhes_json) VALUES (?,?,?,?,?,?)`,
   [randomUUID(),admin.id,SEED_MARKER,'sistema','v0.3',JSON.stringify({membros:DEMOS.length,cobrancas:countCharges,despesas:expenses.length,conta:'DADOS FICTÍCIOS'})]);
  await tx.commit();
  console.log(`Seed concluído: ${DEMOS.length} membros, ${countCharges} cobranças e ${expenses.length} despesas fictícias.`);
  console.log(`Acesso de demonstração: ${exampleEmail} / ${DEMO_PASSWORD}`);
  console.log('Os links example.com são demonstrativos. NÃO realize pagamentos reais.');
 }catch(e){await tx.rollback().catch(()=>{});throw e;}
}
try{await seed();}catch(e){console.error('Erro no seed:',e.message);process.exitCode=1;}finally{await closeTursoClient();}
