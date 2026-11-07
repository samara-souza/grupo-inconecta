import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const directory=await mkdtemp(path.join(tmpdir(),'grupo-negocios-test-'));
const env={...process.env,NODE_ENV:'test',TURSO_AUTH_TOKEN:'',TURSO_DATABASE_URL:'file:'+path.join(directory,'integration.db'),JWT_SECRET:randomBytes(48).toString('hex'),ADMIN_NOME:'Admin Integração',ADMIN_EMAIL:'admin@integracao.test',ADMIN_PASSWORD:'SenhaAdmin2026!Sim'};
function script(p){const r=spawnSync(process.execPath,[p],{cwd:process.cwd(),env,encoding:'utf8'});assert.equal(r.status,0,r.stderr+'\n'+r.stdout);}
script('scripts/migrate.js');script('scripts/bootstrap-admin.js');
Object.assign(process.env,env);
const { createApp }=await import('../server.js');
const server=createApp().listen(0);
await new Promise(resolve=>server.once('listening',resolve));
const root='http://127.0.0.1:'+server.address().port;
async function call(session,method,url,body,expected=200){
 const headers={};if(session.cookie)headers.Cookie=session.cookie;
 if(method!=='GET')headers['Content-Type']='application/json';
 const response=await fetch(root+'/api'+url,{method,headers,body:method==='GET'?undefined:JSON.stringify(body??{})});
 const cookie=response.headers.get('set-cookie');if(cookie)session.cookie=cookie.split(';')[0];
 const data=await response.json();assert.equal(response.status,expected,method+' '+url+': '+JSON.stringify(data));return data;
}
try{
 await test('fluxo completo de adesão, pendências, reativação e permissões',async()=>{
  const a={},m={};
  await call(a,'POST','/auth/login',{email:env.ADMIN_EMAIL,senha:env.ADMIN_PASSWORD});
  await call(a,'POST','/admin/membros',{nome:'Nome A',email:'na@a.test',telefone:'41999999999',empresa:'Empresa A',ramo:'Tecnologia'},409); // configurar antes
  await call(a,'PATCH','/admin/configuracoes',{mensalidadeCentavos:10000,adesaoCentavos:20000,diaVencimento:10,toleranciaDias:5,nomeRecebedor:'Grupo X',linkMensalidade:'https://example.com/m',linkAdesao:'https://example.com/a'});
  const catalogs=await call(a,'GET','/admin/catalogos/ramos');assert.ok(catalogs.items.some(i=>i.nome==='Tecnologia'));
  const cat=await call(a,'POST','/admin/catalogos/categorias',{nome:'Transporte'},201);
  await call(a,'PATCH','/admin/catalogos/categorias/'+cat.id,{nome:'Transporte e viagens',ativo:true});
  const created=await call(a,'POST','/admin/membros',{nome:'Nome A',email:'na@a.test',telefone:'41999999999',empresa:'Empresa A',ramo:'Tecnologia'},201);
  const semEmpresa=await call(a,'POST','/admin/membros',{nome:'Membro Sem Empresa',email:'semempresa@a.test',telefone:'(41) 99999-2222',empresa:null,ramo:null},201);
  assert.ok(semEmpresa.id);
  await call(m,'POST','/auth/login',{email:'na@a.test',senha:created.senhaTemporaria});
  await call(a,'GET','/diretorio');
  await call(m,'GET','/diretorio',undefined,403);
  await call(m,'GET','/me/cobranca',undefined,403);
  await call(m,'POST','/auth/alterar-senha',{senhaAtual:created.senhaTemporaria,novaSenha:'NovaSenha123!abcd'});
  let x=await call(m,'GET','/me/cobranca');assert.equal(x.cobranca.tipo,'ADESAO');assert.equal(x.cobranca.valor_centavos,20000);
  await call(m,'GET','/diretorio',undefined,403);
  await call(m,'POST',`/me/cobrancas/${x.cobranca.id}/informar`);
  await call(a,'POST',`/admin/cobrancas/${x.cobranca.id}/rejeitar`);
  x=await call(m,'GET','/me/cobranca');assert.equal(x.cobranca.status,'PENDENTE');
  await call(m,'POST',`/me/cobrancas/${x.cobranca.id}/informar`);
  await call(a,'POST',`/admin/cobrancas/${x.cobranca.id}/confirmar`);
  await call(a,'POST',`/admin/cobrancas/${x.cobranca.id}/confirmar`,{},409);
  x=await call(m,'GET','/me/cobranca');assert.equal(x.statusMembro,'ATIVO');
  await call(m,'PUT','/me/empresa',{nome:'Empresa A',ramo:'Tecnologia',telefone:'(41) 99999-9999',instagram:'https://www.instagram.com/empresa.a/',site:'https://example.com',descricao:'Tecnologia e serviços'});
  const empresaCorrigida=(await call(m,'GET','/me/empresa')).empresa;
  assert.equal(empresaCorrigida.telefone,'41999999999');
  assert.equal(empresaCorrigida.instagram,'@empresa.a');
  await call(m,'PUT','/me/empresa',{nome:'Empresa A',ramo:'Tecnologia',telefone:'41999999999',instagram:'@empresa.a',site:'minhaempresa.com/servicos',descricao:'Site preservado'});
  assert.equal((await call(m,'GET','/me/empresa')).empresa.site,'minhaempresa.com/servicos');
  await call(m,'PUT','/me/empresa',{nome:'Empresa A',ramo:'Tecnologia',descricao:'A'.repeat(120),telefone:'41999999999',instagram:'@empresa.a',site:'minhaempresa.com/servicos'});
  assert.equal((await call(m,'GET','/diretorio')).items[0].descricao,'A'.repeat(120));
  await call(m,'PUT','/me/empresa',{nome:'Empresa A',ramo:'Tecnologia',descricao:'B'.repeat(121),telefone:'41999999999',instagram:'@empresa.a',site:'minhaempresa.com/servicos'},400);
  assert.equal((await call(m,'GET','/me/empresa')).empresa.descricao,'A'.repeat(120));
  await call(m,'PUT','/me/empresa',{nome:'Empresa A',ramo:'Tecnologia',telefone:'9999',instagram:'@empresa.a',site:'https://example.com'},400);
  assert.equal((await call(m,'GET','/diretorio')).items.length,1);
  assert.equal((await call(a,'GET','/diretorio')).items.length,1);
  const memberReport=await call(a,'GET','/admin/relatorios/membros');
  assert.ok(memberReport.items.length>=2);
  const activeReport=await call(a,'GET','/admin/relatorios/membros?status=ATIVO');
  assert.equal(activeReport.items.length,1);
  const notActiveReport=await call(a,'GET','/admin/relatorios/membros?status=INATIVO');
  assert.equal(notActiveReport.items.length,0);
  await call(a,'GET','/admin/relatorios/membros?mes=2026-99',undefined,400);
  assert.equal(memberReport.items.find(x=>x.id===created.id).status,'ATIVO');
  await call(m,'GET','/admin/pendencias',undefined,403);
  await call(a,'POST','/admin/despesas',{descricao:'Café no evento',categoria:'Eventos',valorCentavos:5000,data:'2026-11-07',status:'PAGA'},201);
  const catEvento=(await call(a,'GET','/admin/catalogos/categorias')).items.find(x=>x.nome==='Eventos');
  await call(a,'PATCH','/admin/catalogos/categorias/'+catEvento.id,{nome:'Eventos novos',ativo:true},409);
  await call(m,'POST','/auth/alterar-senha',{senhaAtual:'senha incorreta',novaSenha:'OutraSenha123!abcd'},403);
  const report=await call(a,'GET','/admin/relatorios/caixa');
  await call(a,'GET','/admin/relatorios/caixa?mes=2026-99',undefined,400);
  const noMoney=await call(a,'GET','/admin/relatorios/caixa?mes=2020-01');
  assert.equal(noMoney.items.length,0);assert.equal(report.items.some(i=>i.adesoesCentavos===20000),true);
  await call(m,'POST','/me/cancelar',{confirmacao:'CANCELAR'});
  await call(m,'GET','/auth/me',undefined,401);
  await call(a,'POST',`/admin/membros/${created.id}/reativar`,{modalidade:'MENSALIDADE'});
  await call(m,'POST','/auth/login',{email:'na@a.test',senha:'NovaSenha123!abcd'});
  x=await call(m,'GET','/me/cobranca');assert.equal(x.cobranca.tipo,'REATIVACAO_MENSALIDADE');
  await call(a,'POST',`/admin/cobrancas/${x.cobranca.id}/confirmar`);
  x=await call(m,'GET','/me/cobranca');assert.equal(x.statusMembro,'ATIVO');
 });
}finally{
 await new Promise(resolve=>server.close(resolve));
 const { getClient }=await import('../src/db/client.js');getClient().close();
 await rm(directory,{recursive:true,force:true});
}
