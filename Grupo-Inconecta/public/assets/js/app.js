import { MONTHS_PT, birthdayFilterOptions } from './filterOptions.js';
import { filterMembers, memberDisplay, isBirthdayToday } from './memberSearch.js';
import { parseAppRoute, buildAppHash } from './navigation.js';
// Grupo Inconecta · ESTELA Tecnologia · interface sem dependências de terceiros
const $ = (selector, root = document) => root.querySelector(selector);
const app = $('#app');
let user = null;
const initialRoute = parseAppRoute(window.location.hash);
let view = initialRoute.view;
let reportTab = initialRoute.reportTab;
let configTab = initialRoute.configTab;
let lastObservedHash = window.location.hash;
let navigating = false;
let currentCompany = null;
let currentExpenses = [];
let currentMembers = [];
let reportMonth = '';
let memberReportStatus = '';
let memberReportMonth = '';
let memberReportCache = null;
let reportConnectionsMonth = ''; // visão geral: histórico completo até selecionar um mês
let reportConnectionsRole = 'empresa';
let reportConnectionsMember = '';
let reportConnectionsMemberListCache = null;
let lastUserRefresh = 0;
const currentMonthBR = () => {const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return `${p.year}-${p.month}`;};
const currentDateBR=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;};
let directoryMonth=currentMonthBR();
let directorySearch='';
let directoryBranch='';
let birthdayMonth=currentMonthBR();
let connectionsMonth=currentMonthBR();
let connectionsVisitor='';
let connectionsPage=1;
let activeMemberListCache=null;


const MAX_COMPANY_DESCRIPTION = 120;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = v => (Number(v || 0) / 100).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
const dateBR = value => value ? new Date(String(value).slice(0,10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const toForm = form => Object.fromEntries(new FormData(form));
const initials = text => String(text || '?').trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toLocaleUpperCase('pt-BR');
const norm = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
const LABELS = {
  ATIVO:'Ativo',INATIVO:'Inativo',SUSPENSO:'Suspenso',AGUARDANDO_ADESAO:'Aguardando adesão',
  AGUARDANDO_REATIVACAO:'Aguardando reativação', PAGO:'Pago',PENDENTE:'Pendente',
  AGUARDANDO_CONFIRMACAO:'Aguardando confirmação', CANCELADA:'Cancelada',
  PREVISTA:'Prevista',PAGA:'Paga',ATRASADO:'Atrasado',ADESAO:'Adesão',MENSALIDADE:'Mensalidade',
  REATIVACAO_ADESAO:'Reativação · adesão',REATIVACAO_MENSALIDADE:'Reativação · mensalidade'
};
const badge = type => `<span class="badge ${esc(type)}">${esc(LABELS[type] || String(type || '—').replaceAll('_',' '))}</span>`;
const input = (name,label,value='',type='text',attrs='') => `<div class="field"><label for="${esc(name)}">${esc(label)}</label><div class="${type==='password'?'password-field':''}"><input id="${esc(name)}" name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${attrs}>${type==='password'?`<button type="button" class="password-toggle" data-action="toggle-password" data-field="${esc(name)}" aria-label="Mostrar senha" title="Mostrar senha">${icon('eye')}</button>`:''}</div></div>`;
const phoneInput = (name,label,value='',required=false) => input(name,label,formatPhone(value),'tel',`inputmode="tel" autocomplete="tel" placeholder="(41) 99999-9999" maxlength="15" data-format="phone" ${required?'required':''}`);
const instagramInput = (value='') => input('instagram','Instagram',value,'text','placeholder="@suaempresa" maxlength="180" autocapitalize="off" spellcheck="false" data-format="instagram"');
const siteInput = (value='') => input('site','Site',value,'text','placeholder="Digite o site como desejar" maxlength="2048" autocapitalize="off" spellcheck="false" data-format="site"');
const formatPhone = value => { const digits=String(value||'').replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,'').slice(0,11); if(digits.length<=2)return digits.length?'('+digits:''; if(digits.length<=6)return `(${digits.slice(0,2)}) ${digits.slice(2)}`; return `(${digits.slice(0,2)}) ${digits.slice(2,-4)}-${digits.slice(-4)}`; };
const normalizeInstagram = value => {let raw=String(value||'').trim(); if(!raw)return '';raw=raw.replace(/^https?:\/\/(?:www\.)?instagram\.com\//i,'').split(/[/?#]/)[0].replace(/^@/,'');return raw?'@'+raw:'';};
const linkTarget = value => { const raw=String(value||'').trim(); if(!raw) return ''; return /^https?:\/\//i.test(raw) ? raw : 'https://' + raw; };
const validInstagram = value => !value || /^@[a-zA-Z0-9._]{1,30}$/.test(value) && !value.includes('..') && !value.endsWith('.');
const validateFields = form => {for(const f of form.querySelectorAll('[data-format]')) {if(f.dataset.format==='phone'){f.value=formatPhone(f.value);const d=f.value.replace(/\D/g,'');if(d.length && ![10,11].includes(d.length)) {f.setCustomValidity('Informe DDD e telefone válido (10 ou 11 dígitos).');f.reportValidity();return false;}f.setCustomValidity('');}if(f.dataset.format==='instagram'){f.value=normalizeInstagram(f.value);if(!validInstagram(f.value)){f.setCustomValidity('Instagram inválido: use @usuario (letras, números, pontos ou _).');f.reportValidity();return false;}f.setCustomValidity('');}if(f.dataset.format==='site'){f.value=f.value.trim();f.setCustomValidity('');}}return form.reportValidity();};

const textArea = (name,label,value='',attrs='') => `<div class="field"><label for="${esc(name)}">${esc(label)}</label><textarea name="${esc(name)}" id="${esc(name)}" ${attrs}>${esc(value)}</textarea></div>`;
const select = (name,label,options,selected='',attrs='required') => `<div class="field"><label for="${esc(name)}">${esc(label)}</label><select id="${esc(name)}" name="${esc(name)}" ${attrs}><option value="">Selecione...</option>${options.map(x=>`<option value="${esc(x.value ?? x.nome)}" ${(x.value ?? x.nome)===selected?'selected':''}>${esc(x.label ?? x.nome)}</option>`).join('')}</select></div>`;
const button = (act,label,cls='') => `<button type="button" class="btn ${cls}" data-action="${esc(act)}">${esc(label)}</button>`;
const iconData = {
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  dashboard:'<path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z"/>',
  users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>',
  building:'<path d="M3 21h18M5 21V6l7-3 7 3v15M9 9h2m2 0h2M9 13h2m2 0h2M9 17h6"/>',
  receipt:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  wallet:'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
  chart:'<path d="M5 19V9M12 19V5M19 19v-8"/>',
  config:'<circle cx="12" cy="12" r="3.1"/><path d="M10.3 2.6h3.4l.6 2.1a8 8 0 0 1 1.8.8l1.9-1 2.4 2.4-1 1.9c.4.6.6 1.2.8 1.9l2.1.6v3.4l-2.1.6c-.2.7-.4 1.3-.8 1.9l1 1.9-2.4 2.4-1.9-1a8 8 0 0 1-1.8.8l-.6 2.1h-3.4l-.6-2.1a8 8 0 0 1-1.8-.8l-1.9 1-2.4-2.4 1-1.9a8 8 0 0 1-.8-1.9l-2.1-.6v-3.4l2.1-.6c.2-.7.4-1.3.8-1.9l-1-1.9L6 4.5l1.9 1a8 8 0 0 1 1.8-.8z"/>',
  account:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  logout:'<path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M14 8l4 4-4 4M8 12h10"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  edit:'<path d="M4 20h4l12-12-4-4L4 16zM14 6l4 4"/>',
  external:'<path d="M13 5h6v6M19 5l-9 9M19 13v6H5V5h6"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 6-5 12 0 18M12 3c5 6 5 12 0 18"/>',
  whatsapp:'<path d="M20 11.6a8.3 8.3 0 0 1-12.3 7.3L3 20l1.2-4.5a8.3 8.3 0 1 1 15.8-3.9Z"/><path d="M8 9c.5 3 3 5.5 6 6l1.6-1.6-2.4-1.4-1.2 1-2-2 1-1.2L9.6 7.4Z"/>',
  instagram:'<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1"/>',
  lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff:'<path d="m3 3 18 18M10.6 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a15 15 0 0 1-3 3.8M6.2 6.2C3.3 8.2 2 12 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.8-.8M10 10a3 3 0 0 0 4 4"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  handshake:'<path d="m2 10 4-4 5 2 4-2 7 4-5 7-4 1-3-2-3 1-5-7Z"/><path d="m10 13 3 3m0-6 4 3"/>'
};
const icon = key => `<svg viewBox="0 0 24 24" aria-hidden="true">${key==='instagram'?'<defs><linearGradient id="ig-gradient" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FEDA75"/><stop offset=".35" stop-color="#FA7E1E"/><stop offset=".7" stop-color="#D62976"/><stop offset="1" stop-color="#4F5BD5"/></linearGradient></defs>':''}${iconData[key] || iconData.account}</svg>`;
function toast(text, error=false){const t=$('#toast'); t.textContent=text;t.className='show'+(error?' error':'');clearTimeout(toast.timer);toast.timer=setTimeout(()=>{t.className='';},4500);}
async function api(path,{method='GET',body}={}){
 const opts={method,headers:{},credentials:'same-origin'};
 if(method!=='GET'){opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(body??{});}
 const response=await fetch('/api'+path,opts);
 const result=await response.json().catch(()=>({}));
 if(!response.ok){const err=new Error(result.error || `Erro HTTP ${response.status}`);err.status=response.status;throw err;}
 if(method!=='GET'){memberReportCache=null;reportConnectionsMemberListCache=null;}
 return result;
}
async function refreshUser(force=false){
 if(!force&&user&&Date.now()-lastUserRefresh<45_000)return;
 try{user=(await api('/auth/me')).user;lastUserRefresh=Date.now();}
 catch(error){if(error.status===401){user=null;lastUserRefresh=0;activeMemberListCache=null;}else throw error;}
}
function loginScreen(){
 app.innerHTML=`<div class="login-wrap"><section class="login-shell" aria-label="Acesso ao Grupo Inconecta">
  <div class="login-brand"><div class="login-identity centered"><img class="brand-wordmark brand-wordmark-uploaded" src="/assets/images/estela-login-logo.png" alt="ESTELA"></div>
  <div class="login-product centered"><h1>Grupo Inconecta</h1></div></div>
  <div class="login-form-column"><div class="login-card"><h2>Entrar</h2>
  <form id="login-form">${input('email','E-mail','','email','required autocomplete="username" placeholder="Digite seu email"')}${input('senha','Senha','','password','required autocomplete="current-password" placeholder="Digite sua senha"')}<button class="btn primary" type="submit">Entrar</button></form></div></div></section></div>`;
 $('#login-form').addEventListener('submit',async event=>{event.preventDefault();try{user=(await api('/auth/login',{method:'POST',body:toForm(event.target)})).user;lastUserRefresh=Date.now();activeMemberListCache=null;await render();}catch(err){toast(err.message,true);}});
}
function navItems(){
 if(user.troca_senha_obrigatoria)return [['senha','Alterar senha','lock']];
 if(user.perfil==='ADMIN')return [
  ['dashboard','Visão geral','dashboard'],['membros','Membros','users'],['diretorio','Empresas / Serviços','building'],['aniversariantes','Aniversariantes','calendar'],
  ['pendencias','Pendências','receipt'],['despesas','Despesas','wallet'],['relatorios','Relatórios','chart']];
 if(user.status_membro!=='ATIVO')return [['area','Minha Área','account']];
 return [['diretorio','Empresas / Serviços','building'],['aniversariantes','Aniversariantes','calendar'],['conexoes','Conexões Convertidas','handshake'],['area','Minha Área','account']];
}
const topAction=(key,label,action)=>`<button class="top-action" type="button" data-action="${action}" title="${esc(label)}" aria-label="${esc(label)}">${icon(key)}</button>`;
function closeMenu(){ $('.layout')?.classList.remove('menu-open'); }
function shell(){
 const items=navItems();const allowed=items.map(x=>x[0]).concat(user.troca_senha_obrigatoria?[]:['perfil','senha']);
 if(user.perfil==='ADMIN')allowed.push('config');
 if(user.troca_senha_obrigatoria)view='senha';
 else if(!allowed.includes(view))view=items[0][0];
 app.innerHTML=`<div class="layout"><aside class="sidebar" id="app-sidebar" aria-label="Navegação principal">
 <div class="brandmark"><img class="sidebar-wordmark" src="/assets/images/estela-wordmark.svg" alt="ESTELA"><strong class="sidebar-product">Grupo Inconecta</strong><button class="sidebar-close" data-action="menu-close" aria-label="Fechar menu">×</button></div>
 <nav class="menu">${items.map(([key,label,i])=>`<button type="button" class="navbtn ${key===view?'active':''}" data-nav="${key}" ${key===view?'aria-current="page"':''}>${icon(i)}<span>${esc(label)}</span></button>`).join('')}</nav>
 <div class="sidebar-foot">Desenvolvido por <strong>Estela</strong></div></aside>
 <button class="sidebar-overlay" data-action="menu-close" aria-label="Fechar menu"></button>
 <div class="main"><header class="topbar"><div class="topbar-left"><button class="menu-toggle" data-action="menu-toggle" aria-label="Abrir menu">${icon('menu')}</button><strong class="product-title">Grupo Inconecta</strong></div>
 <div class="topbar-right">${!user.troca_senha_obrigatoria?topAction('account','Minha conta','account'):''}${user.perfil==='ADMIN'&&!user.troca_senha_obrigatoria?topAction('config','Configurações','settings'):''}${topAction('logout','Sair','logout')}</div></header>
 <main id="content" class="page"><div class="loading">Carregando...</div></main></div></div>`;
}
function page(title,body){$('#content').innerHTML=`<div class="page-heading"><h2>${esc(title)}</h2></div>${body}`;}
function table(head,rows,klass='',rowClasses=[]){
 if(!rows.length)return '<div class="empty">Nenhum registro encontrado.</div>';
 return `<div class="table-scroll"><table class="${esc(klass)}"><thead><tr>${head.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row,index)=>`<tr class="${esc(rowClasses[index]||'')}">${row.map(cell=>`<td>${cell??''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function dialogForm(title,html,onSave,{submit='Salvar',wide=false}={}){
 $('#form-dialog')?.remove();
 const dialog=document.createElement('dialog');dialog.id='form-dialog';dialog.className='form-dialog'+(wide?' wide':'');
 dialog.innerHTML=`<div class="dialog-head"><h2>${esc(title)}</h2><button class="icon-close" type="button" data-dismiss aria-label="Fechar">×</button></div>
 <form><div class="dialog-body">${html}</div><div class="dialog-actions"><button class="btn" type="button" data-dismiss>Cancelar</button><button class="btn primary" type="submit">${esc(submit)}</button></div></form>`;
 document.body.append(dialog);dialog.querySelectorAll('[data-dismiss]').forEach(el=>el.onclick=()=>dialog.close());
 dialog.addEventListener('close',()=>dialog.remove());dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
 dialog.querySelector('form').addEventListener('submit',async event=>{
  event.preventDefault();if(!validateFields(event.target))return;const save=dialog.querySelector('[type="submit"]');save.disabled=true;
  try{await onSave(toForm(event.target));dialog.close();}catch(err){toast(err.message,true);}finally{if(dialog.isConnected)save.disabled=false;}
 });
 dialog.showModal();return dialog;
}
function secretDialog(secret){
 dialogForm('Senha temporária',`<p class="muted">Copie a senha abaixo. Ela não será exibida novamente.</p><div class="secret-value"><code>${esc(secret)}</code><button type="button" class="btn small" id="copy-secret">Copiar</button></div>`,async()=>{},{submit:'Fechar'});
 $('#copy-secret').onclick=async()=>{try{await navigator.clipboard.writeText(secret);toast('Senha copiada.');}catch{toast('Selecione e copie a senha exibida.',true);}};
}
// A rota da aplicação é registrada na URL, não apenas em memória.
// As URLs de seções e abas sobrevivem a F5, Ctrl+F5 e podem ser compartilhadas.
function syncNavigation(mode='replace'){
 const next=buildAppHash(view,{reportTab,configTab});
 if(window.location.hash===next){lastObservedHash=next;return;}
 if(mode==='push')window.history.pushState(null,'',next);
 else window.history.replaceState(null,'',next);
 lastObservedHash=next;
}
async function render(){
 if(user && !user.troca_senha_obrigatoria)await refreshUser();
 if(!user){loginScreen();return;}
 shell(); // Esta função também valida permissões e aplica o redirecionamento obrigatório de senha.
 syncNavigation('replace');
 try{await views[view]();}catch(error){page('Não foi possível carregar',`<div class="notice danger">${esc(error.message)}</div>`);}
}
async function go(target){
 if(navigating)return;
 navigating=true;closeMenu();
 if(target==='relatorios')memberReportCache=null;
 view=target;syncNavigation('push');
 try{await render();}finally{navigating=false;}
}
// Voltar/Avançar no navegador e alterações manuais do endereço.
async function restoreNavigation(){
 const hash=window.location.hash;
 if(hash===lastObservedHash)return;
 lastObservedHash=hash;
 const route=parseAppRoute(hash);
 view=route.view;reportTab=route.reportTab;configTab=route.configTab;
 try{await render();}catch(error){toast(error.message,true);}
}
window.addEventListener('popstate',restoreNavigation);
window.addEventListener('hashchange',restoreNavigation);
const metric=(label,value,tone='')=>`<div class="metric ${esc(tone)}"><div class="label">${esc(label)}</div><div class="value">${value}</div></div>`;
const toolbar=(left,right='')=>`<div class="toolbar"><div class="toolbar-left">${left}</div>${right}</div>`;
const searchField=(id,placeholder)=>`<div class="search-control">${icon('search')}<input id="${esc(id)}" class="search" type="search" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"></div>`;
// Seletor nativo de mês/ano: calendário do navegador com o visual dos demais filtros.
const monthPicker=(id,value,description)=>`<input id="${esc(id)}" type="month" class="inline-select calendar-month" value="${esc(value)}" aria-label="${esc(description)}" title="${esc(description)}">`;

// O navegador reutiliza por 30 s a lista carregada; digitar em um campo nunca consulta o Turso.
async function activeMembers(){
 if(activeMemberListCache && activeMemberListCache.expires>Date.now())return activeMemberListCache.promise;
 const entry={expires:Date.now()+30_000,promise:api('/membros/ativos').then(data=>data.items)};
 activeMemberListCache=entry;
 try{return await entry.promise;}catch(error){if(activeMemberListCache===entry)activeMemberListCache=null;throw error;}
}

async function reportMembers(){
 if(reportConnectionsMemberListCache && reportConnectionsMemberListCache.expires>Date.now())return reportConnectionsMemberListCache.promise;
 const entry={expires:Date.now()+60_000,promise:api('/admin/relatorios/conexoes/membros').then(r=>r.items)};
 reportConnectionsMemberListCache=entry;
 try{return await entry.promise;}catch(error){if(reportConnectionsMemberListCache===entry)reportConnectionsMemberListCache=null;throw error;}
}

function memberPickerHtml(id,label,members,selectedId='',{optional=false,inline=false}={}){
 const selected=members.find(x=>String(x.id)===String(selectedId));
 return `<div class="member-picker ${inline?'member-picker-inline':'field'}" data-member-picker="${esc(id)}" data-required="${optional?'false':'true'}">
  <label for="${esc(id)}-query" class="${inline?'visually-hidden':''}">${esc(label)}</label>
  <div class="member-picker-control">${icon('search')}
   <input id="${esc(id)}-query" type="search" class="member-picker-query" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-autocomplete="list" aria-controls="${esc(id)}-options" autocomplete="off" placeholder="${optional?'Todos os membros · pesquisar':'Digite o nome ou a empresa'}" value="${esc(selected?memberDisplay(selected):'')}" ${optional?'':'required'}>
  </div>
  <input id="${esc(id)}" type="hidden" name="${esc(id)}" value="${esc(selectedId)}">
  <div id="${esc(id)}-options" class="member-picker-options" role="listbox" hidden></div>
 </div>`;
}

function setupMemberPicker(id,members,onSelect=()=>{}){
 const root=document.querySelector(`[data-member-picker="${id}"]`);
 if(!root)return;
 const queryInput=root.querySelector('.member-picker-query');
 const hiddenInput=root.querySelector('input[type="hidden"]');
 const options=root.querySelector('.member-picker-options');
 const required=root.dataset.required==='true';
 let committed=members.find(m=>String(m.id)===hiddenInput.value)||null;
 let shown=[];let activeIndex=-1;
 const labelFor=m=>memberDisplay(m);
 const close=()=>{options.hidden=true;queryInput.setAttribute('aria-expanded','false');queryInput.removeAttribute('aria-activedescendant');activeIndex=-1;};
 const show=()=>{
  shown=filterMembers(members,queryInput.value,20);
  options.innerHTML=shown.length?shown.map((m,index)=>`<button type="button" class="member-picker-option" role="option" id="${esc(id)}-choice-${index}" data-index="${index}" aria-selected="false"><strong>${esc(m.nome)}</strong><small>${esc(m.empresa||'Empresa não cadastrada')}</small></button>`).join(''):'<span class="member-picker-empty">Nenhum membro encontrado.</span>';
  options.hidden=false;queryInput.setAttribute('aria-expanded','true');activeIndex=-1;
 };
 const focusOption=index=>{
  if(!shown.length)return;
  activeIndex=Math.min(shown.length-1,Math.max(0,index));
  options.querySelectorAll('[role="option"]').forEach((option,i)=>{option.classList.toggle('active',i===activeIndex);option.setAttribute('aria-selected',String(i===activeIndex));});
  queryInput.setAttribute('aria-activedescendant',`${id}-choice-${activeIndex}`);
  options.querySelectorAll('[role="option"]')[activeIndex]?.scrollIntoView({block:'nearest'});
 };
 const commit=member=>{
  const nextId=member?String(member.id):'';
  const changed=String(committed?.id||'')!==nextId;
  committed=member||null;hiddenInput.value=nextId;queryInput.value=member?labelFor(member):'';
  queryInput.setCustomValidity(required&&!member?'Selecione um membro da lista.':'');
  close();if(changed)Promise.resolve(onSelect(nextId)).catch(err=>toast(err.message,true));
 };
 queryInput.addEventListener('focus',show);
 queryInput.addEventListener('click',()=>{if(options.hidden)show();});
 queryInput.addEventListener('input',()=>{
  if(required)queryInput.setCustomValidity('Selecione um membro da lista.');
  if(!required && queryInput.value==='' && committed){commit(null);return;}
  show();
 });
 queryInput.addEventListener('keydown',event=>{
  if(event.key==='Escape'){close();queryInput.value=committed?labelFor(committed):'';queryInput.setCustomValidity('');return;}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();if(options.hidden)show();focusOption(event.key==='ArrowDown'?activeIndex+1:(activeIndex<0?shown.length-1:activeIndex-1));
  }else if(event.key==='Enter'&&!options.hidden){event.preventDefault();if(shown.length)commit(shown[Math.max(0,activeIndex)]);}
 });
 options.addEventListener('pointerdown',event=>{
  const option=event.target.closest('[data-index]');if(!option)return;
  event.preventDefault();commit(shown[Number(option.dataset.index)]);
 });
 options.addEventListener('click',event=>{
  const option=event.target.closest('[data-index]');if(option)commit(shown[Number(option.dataset.index)]);
 });
 root.addEventListener('focusout',()=>setTimeout(()=>{
  if(root.contains(document.activeElement))return;
  close();queryInput.value=committed?labelFor(committed):'';queryInput.setCustomValidity('');
 },0));
}

const paymentUrl = raw => { try {const parsed=new URL(String(raw||''));if(parsed.protocol!=='https:' || parsed.username || parsed.password || !parsed.hostname || !parsed.hostname.includes('.') || parsed.hostname==='localhost' || /\.(?:local|localhost|internal)$/i.test(parsed.hostname) || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(parsed.hostname) || parsed.hostname.startsWith('[')) return null;return parsed;}catch{return null;} };
const iconLink=(url,key,label)=>`<a href="${esc(url)}" class="icon-link ${esc(key)}" aria-label="${esc(label)}" title="${esc(label)}" rel="noopener noreferrer" target="_blank">${icon(key)}</a>`;
const tabs=(group,active,items)=>`<div class="report-tabs" role="tablist" aria-label="${esc(group)}">${items.map(([key,label])=>`<button type="button" class="report-tab ${key===active?'is-active':''}" role="tab" aria-selected="${key===active}" data-tab="${esc(key)}" data-group="${esc(group)}">${esc(label)}</button>`).join('')}</div>`;
async function activeRamos(){return (await api('/catalogos/ramos')).items;}
async function activeCategorias(){return (await api('/admin/catalogos/categorias')).items.filter(x=>Number(x.ativo)===1);}
function memberName(name,secondary){return `<div class="identity-cell"><span class="identity-avatar">${esc(initials(name))}</span><span class="identity-info"><strong>${esc(name)}</strong><small>${esc(secondary||'')}</small></span></div>`;}
function companyName(name,area){return `<div class="identity-info"><strong>${esc(name)}</strong><small>${esc(area||'—')}</small></div>`;}

const views={
 async senha(){
  const temporary=!!user.troca_senha_obrigatoria;
  page('Alterar senha',`<div class="panel slim-panel"><form id="password-form">${input('senhaAtual',temporary?'Senha temporária':'Senha atual','','password','required autocomplete="current-password"')}${input('novaSenha','Nova senha','','password','required minlength="12" autocomplete="new-password"')}<p class="helper">Mínimo de 12 caracteres, com letra maiúscula, minúscula, número e símbolo.</p><button class="btn primary">Salvar senha</button></form></div>`);
  $('#password-form').onsubmit=async event=>{event.preventDefault();try{user=(await api('/auth/alterar-senha',{method:'POST',body:toForm(event.target)})).user;view='';await render();toast('Senha alterada.');}catch(err){toast(err.message,true);}};
 },
 async perfil(){
  page('Minha conta',`<div class="panel slim-panel"><form id="profile-form"><div class="form-grid">${input('nome','Nome completo',user.nome,'text','required')}${input('email','E-mail de acesso',user.email,'email','required')}${user.perfil==='MEMBRO'?phoneInput('telefone','Telefone',user.telefone||'',true)+input('dataNascimento','Data de nascimento (opcional)',user.data_nascimento||'','date','max="'+currentDateBR()+'"'):''}</div><div class="form-actions"><button class="btn primary">Salvar alterações</button>${button('change-password','Alterar senha')}</div></form></div>`);
  $('#profile-form').onsubmit=async e=>{e.preventDefault();if(!validateFields(e.target))return;try{user=(await api('/me',{method:'PATCH',body:toForm(e.target)})).user;toast('Conta atualizada.');}catch(err){toast(err.message,true);}};
 },
 async dashboard(){
  const d=(await api('/admin/dashboard')).indicadores;
  page('Visão geral',`<div class="grid">${metric('Membros ativos',d.ativos)}${metric('Suspensos',d.suspensos)}${metric('Pendências',d.pendencias)}${metric('Receitas do mês',money(d.receitas_mes))}${metric('Despesas do mês',money(d.despesas_mes))}${metric('Resultado do mês',money(Number(d.receitas_mes)-Number(d.despesas_mes)))}</div>`);
 },
 async diretorio(){
  const params=new URLSearchParams({mes:directoryMonth});
  const items=(await api('/diretorio?'+params)).items;
  const options=[...new Set(items.map(x=>x.ramo).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  page('Empresas / Serviços',`<div class="panel">${toolbar(`${searchField('company-search','Buscar por empresa, membro ou serviço')}<select id="company-filter" class="inline-select" aria-label="Filtrar ramo"><option value="">Todos os ramos</option>${options.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select>${monthPicker('directory-month',directoryMonth,'Filtrar conexões convertidas por mês')}`,`<span class="record-count" id="company-count"></span>`)}<div id="directory-table"></div></div>`);
  $('#company-search').value=directorySearch;
  $('#company-filter').value=directoryBranch;
  const draw=()=>{
   const t=norm($('#company-search').value),ramo=$('#company-filter').value;
   const filtered=items.filter(x=>(!ramo||x.ramo===ramo)&&norm([x.empresa,x.membro,x.ramo,x.descricao].join(' ')).includes(t));
   $('#company-count').textContent=`${filtered.length} empresa${filtered.length===1?'':'s'}`;
   $('#directory-table').innerHTML=table(['Empresa','Responsável','Atuação','Conexões Convertidas','Contato'],filtered.map(x=>[
    companyName(x.empresa,x.ramo),memberName(x.membro,''),`<span class="description-cell">${esc(x.descricao||'—')}</span>`,
    `<strong class="deal-count">${Number(x.negocios_mes||0)}</strong>`,
    `<div class="contact-actions">${x.telefone?iconLink('https://wa.me/'+(x.telefone.replace(/\D/g,'').startsWith('55')?x.telefone.replace(/\D/g,''):'55'+x.telefone.replace(/\D/g,'')),'whatsapp','WhatsApp de '+x.empresa):''}${x.instagram?iconLink('https://www.instagram.com/'+normalizeInstagram(x.instagram).replace(/^@/,'').replace(/[^a-zA-Z0-9._]/g,''),'instagram','Instagram de '+x.empresa):''}${x.site?iconLink(linkTarget(x.site),'globe','Site de '+x.empresa):''}${!x.telefone&&!x.instagram&&!x.site?'—':''}</div>`
   ]),'directory-table');
  };
  $('#company-search').oninput=event=>{directorySearch=event.target.value;draw();};$('#company-filter').onchange=event=>{directoryBranch=event.target.value;draw();};
  $('#directory-month').onchange=async event=>{if(!event.target.value){event.target.value=directoryMonth;return;}directoryMonth=event.target.value;await views.diretorio();};
  draw();
 },
 async aniversariantes(){
  const data=await api('/aniversariantes?'+new URLSearchParams({mes:birthdayMonth}));
  const label=MONTHS_PT[Number(birthdayMonth.slice(5))-1].toLocaleLowerCase('pt-BR');
  const today=currentDateBR();
  const todayBirthdays=data.items.filter(x=>isBirthdayToday(x,today));
  const spotlight=todayBirthdays.length?`<div class="birthday-spotlight"><div class="birthday-spotlight-icon">${icon('calendar')}</div><div><strong>${todayBirthdays.length===1?'Aniversariante do dia':'Aniversariantes do dia'}</strong><div class="birthday-spotlight-list">${todayBirthdays.map(x=>`<span><b>${esc(x.nome)}</b><small>${esc(x.empresa||'Empresa não cadastrada')}</small></span>`).join('')}</div></div></div>`:'';
  page('Aniversariantes',`<div class="panel"><div class="section-heading birthday-heading"><h3>Aniversários de ${esc(label)}</h3><select id="birthday-month" class="inline-select" aria-label="Filtrar aniversariantes por mês">${birthdayFilterOptions(birthdayMonth.slice(5))}</select></div>${spotlight}${table(['Dia','Membro','Empresa'],data.items.map(x=>[`<span class="birthday-day ${isBirthdayToday(x,today)?'is-today':''}">${esc(x.dia)}/${esc(x.mes)}</span>`,memberName(x.nome,''),esc(x.empresa||'—')]),'',data.items.map(x=>isBirthdayToday(x,today)?'birthday-row-today':''))}</div>`);
  $('#birthday-month').onchange=async event=>{birthdayMonth=`${birthdayMonth.slice(0,4)}-${event.target.value}`;await views.aniversariantes();};
 },
 async conexoes(){
  const params=new URLSearchParams({pagina:String(connectionsPage)});
  if(connectionsMonth)params.set('mes',connectionsMonth);
  if(connectionsVisitor)params.set('visitante',connectionsVisitor);
  const [data,members]=await Promise.all([api('/me/conexoes?'+params),activeMembers()]);
  page('Conexões Convertidas',`<div class="grid compact-metrics connections-summary">${metric('Conexões convertidas',data.total,'tone-green')}${metric('Valor total informado',data.resumo?.comValor?money(data.resumo.valorTotalCentavos):'—')}</div>
  <div class="panel top-gap">${toolbar(`${monthPicker('connections-month',connectionsMonth,'Filtrar mês do negócio')}${memberPickerHtml('connections-visitor','Filtrar membro visitante',members,connectionsVisitor,{optional:true,inline:true})}${button('clear-connections','Limpar filtros','small')}`,button('new-connection','Registrar negócio','primary'))}
  <div id="connections-table">${table(['Membro visitante','Data do negócio','Valor declarado','Observação',''],data.items.map(x=>[memberName(x.visitante,x.empresa_visitante),dateBR(x.data_fechamento),x.valor_centavos===null||x.valor_centavos===undefined?'<span class="muted">Não informado</span>':money(x.valor_centavos),`<span class="description-cell">${esc(x.observacao||'—')}</span>`,`<button class="btn small danger" data-action="delete-connection" data-id="${esc(x.id)}">Excluir</button>`]))}</div>
  <div class="pagination-actions">${data.pagina>1?`<button class="btn small" data-action="connections-prev">Anterior</button>`:''}<span>${data.total} negócio${data.total===1?'':'s'} encontrado${data.total===1?'':'s'}</span>${data.pagina*data.porPagina<data.total?`<button class="btn small" data-action="connections-next">Próxima</button>`:''}</div></div>`);
  $('#connections-month').onchange=async e=>{connectionsMonth=e.target.value;connectionsPage=1;await views.conexoes();};
  setupMemberPicker('connections-visitor',members,async id=>{connectionsVisitor=id;connectionsPage=1;await views.conexoes();});
 },
 async area(){
  const [pay,company]=await Promise.all([api('/me/cobranca'),api('/me/empresa')]);
  currentCompany=company.empresa;
  const charge=pay.cobranca;
  page('Minha Área',`<div class="area-summary">${metric('Situação',badge(pay.statusMembro))}${metric('Próximo vencimento',dateBR(pay.proximoVencimento))}${metric('Cobrança atual',charge?money(charge.valor_centavos):'Em dia')}</div>
  <div class="panel"><div class="section-heading"><h3>Minha empresa</h3>${button('edit-company','Editar empresa','small')}</div>
   <dl class="detail-grid"><div><dt>Empresa</dt><dd>${esc(currentCompany.nome||'—')}</dd></div><div><dt>Ramo</dt><dd>${esc(currentCompany.ramo||'—')}</dd></div><div><dt>Telefone</dt><dd>${esc(currentCompany.telefone?formatPhone(currentCompany.telefone):'—')}</dd></div><div><dt>Instagram</dt><dd>${esc(currentCompany.instagram||'—')}</dd></div><div class="full"><dt>Site</dt><dd>${esc(currentCompany.site||'—')}</dd></div><div class="full"><dt>Atuação</dt><dd>${esc(currentCompany.descricao||'—')}</dd></div></dl></div>
  <div class="panel"><div class="section-heading"><h3>Minha mensalidade</h3>${charge?badge(charge.status):badge('PAGO')}</div>
   ${charge?`<dl class="payment-details"><div><dt>Tipo</dt><dd>${esc(LABELS[charge.tipo]||charge.tipo)}</dd></div><div><dt>Valor</dt><dd>${money(charge.valor_centavos)}</dd></div><div><dt>Vencimento</dt><dd>${dateBR(charge.vencimento)}</dd></div><div><dt>Recebedor</dt><dd>${esc(pay.nomeRecebedor||'—')}</dd></div></dl><div class="actions">${charge.status==='PENDENTE'&&charge.pix_copia_cola?`<div class="pix-panel"><label for="pix-code"><strong>Pix Copia e Cola</strong></label><textarea id="pix-code" readonly rows="3" spellcheck="false" aria-label="Código Pix Copia e Cola">${esc(charge.pix_copia_cola)}</textarea><button type="button" class="btn primary" data-action="copy-pix">Copiar código Pix</button><p class="muted">Confira o nome do recebedor e o valor no aplicativo do banco antes de pagar. A confirmação é manual.</p></div>`:charge.status==='PENDENTE'?'<span class="notice warning">Pix ainda não configurado. Entre em contato com a administração.</span>':''}${charge.status==='AGUARDANDO_CONFIRMACAO'?'<div class="notice info inline-note">Pagamento informado. Aguarde a conferência da administração.</div>':''}${charge.status==='PENDENTE'?`<button class="btn" data-action="inform-payment" data-id="${esc(charge.id)}">Informar pagamento</button>`:''}</div>`:`<div class="notice success">Não há cobrança pendente.</div>`}</div>
  <div class="area-footer">${button('cancel-member','Sair do grupo','danger small')}</div>`);
 },
 async membros(){
  const rows=(await api('/admin/membros')).items;currentMembers=rows;
  const statuses=[...new Set(rows.map(x=>x.status))];
  page('Membros',`<div class="panel">${toolbar(`${searchField('member-search','Buscar membro ou empresa')}<select class="inline-select" id="member-status" aria-label="Filtrar situação"><option value="">Todas as situações</option>${statuses.map(s=>`<option value="${esc(s)}">${esc(LABELS[s]||s)}</option>`).join('')}</select>`,`<button class="btn primary" data-action="add-member">${icon('plus')} Novo membro</button>`)}<div class="list-overview" id="member-count"></div><div id="member-list"></div></div>`);
  const draw=()=>{
   const term=norm($('#member-search').value),status=$('#member-status').value;
   const shown=rows.filter(x=>(!status||x.status===status)&&norm([x.nome,x.empresa,x.email,x.ramo].join(' ')).includes(term));
   $('#member-count').textContent=`${shown.length} de ${rows.length} membro${rows.length===1?'':'s'}`;
   $('#member-list').innerHTML=table(['Membro','Empresa','Situação','Próximo vencimento',''],shown.map(x=>[
    memberName(x.nome,x.email),companyName(x.empresa||'Não cadastrada',x.ramo),badge(x.status),dateBR(x.proximo_vencimento),
    `<button class="btn icon-button" title="Gerenciar ${esc(x.nome)}" aria-label="Gerenciar ${esc(x.nome)}" data-action="manage-member" data-id="${esc(x.id)}">${icon('more')}</button>`
   ]),'members-table');
  };
  $('#member-search').oninput=draw;$('#member-status').onchange=draw;draw();
 },
 async pendencias(){
  const rows=(await api('/admin/pendencias')).items;
  const awaiting=rows.filter(x=>x.status==='AGUARDANDO_CONFIRMACAO');
  page('Pendências',`<div class="grid compact-metrics">${metric('Cobranças em aberto',rows.length)}${metric('Aguardando confirmação',awaiting.length)}${metric('Valor pendente',money(rows.reduce((a,x)=>a+Number(x.valor_centavos),0)))}</div>
   <div class="panel top-gap">${toolbar(`${searchField('pending-search','Buscar membro ou empresa')}`,`<select id="pending-filter" class="inline-select" aria-label="Filtrar pagamentos"><option value="">Todos</option><option value="AGUARDANDO_CONFIRMACAO">Aguardando confirmação</option><option value="PENDENTE">Pendentes</option><option value="ATRASADO">Atrasados</option></select>`)}<div id="pending-table"></div></div>`);
  const draw=()=>{
   const text=norm($('#pending-search').value),status=$('#pending-filter').value;
   const filtered=rows.filter(x=>norm([x.nome,x.empresa,x.tipo].join(' ')).includes(text) && (!status || (status==='ATRASADO'?x.atrasado:x.status===status)));
   $('#pending-table').innerHTML=table(['Membro','Cobrança','Valor','Vencimento','Situação','Ações'],filtered.map(x=>[
    memberName(x.nome,x.empresa),esc(LABELS[x.tipo]||x.tipo),money(x.valor_centavos),dateBR(x.vencimento),
    `<div class="status-stack">${badge(x.status)}${x.atrasado?badge('ATRASADO'):''}</div>`,
    `<div class="actions compact-actions"><button class="btn small primary" data-action="confirm" data-id="${esc(x.id)}" data-name="${esc(x.nome)}" data-value="${Number(x.valor_centavos)}">Marcar como pago</button>${x.status==='AGUARDANDO_CONFIRMACAO'?`<button class="btn small" data-action="reject" data-id="${esc(x.id)}">Rejeitar</button>`:''}</div>`
   ]));
  };
  $('#pending-search').oninput=draw;$('#pending-filter').onchange=draw;draw();
 },
 async despesas(){
  const rows=(await api('/admin/despesas')).items;currentExpenses=rows;
  page('Despesas',`<div class="panel">${toolbar(`${searchField('expense-search','Buscar despesa')}`,`<button class="btn primary" data-action="add-expense">${icon('plus')} Nova despesa</button>`)}<div class="list-overview">${rows.length} registros</div><div id="expense-list"></div></div>`);
  const draw=()=>{$('#expense-list').innerHTML=table(['Descrição','Categoria','Valor','Data','Situação',''],rows.filter(x=>norm([x.descricao,x.categoria,x.status].join(' ')).includes(norm($('#expense-search').value))).map(x=>[
   `<strong>${esc(x.descricao)}</strong>`,esc(x.categoria),money(x.valor_centavos),dateBR(x.data),badge(x.status),
   `<button class="btn icon-button" title="Editar despesa" aria-label="Editar despesa ${esc(x.descricao)}" data-action="edit-expense" data-id="${esc(x.id)}">${icon('edit')}</button>`
  ]));};$('#expense-search').oninput=draw;draw();
 },
 async relatorios(){
  const heads=tabs('relatorios',reportTab,[['caixa','Caixa'],['membros','Membros'],['conexoes','Conexões Convertidas']]);
  if(reportTab==='caixa'){
   const params=new URLSearchParams();if(reportMonth)params.set('mes',reportMonth);
   const arr=(await api('/admin/relatorios/caixa'+(params.size?'?'+params:''))).items||[];
   const allIn=arr.reduce((sum,x)=>sum+Number(x.receitasCentavos),0);
   const allOut=arr.reduce((sum,x)=>sum+Number(x.despesasCentavos),0);
   const selected=reportMonth?arr.find(x=>x.mes===reportMonth):null;
   const filter=`<div class="filter-header inline-filters"><div class="filter-inline"><label for="report-month">Mês</label><input id="report-month" type="month" value="${esc(reportMonth)}"></div><button class="btn small" type="button" data-action="clear-cash-filters">Limpar filtro</button></div>`;
   const cards=`<div class="grid compact-metrics report-summary">${metric(reportMonth?'Receitas do mês':'Receitas totais',money(allIn),'tone-green')}${metric(reportMonth?'Despesas do mês':'Despesas totais',money(allOut),'tone-rose')}${metric(reportMonth?'Resultado do mês':'Resultado acumulado',money(allIn-allOut),'tone-blue')}</div>`;
   const details=reportMonth?`<div class="grid compact-metrics report-summary">${metric('Adesões',money(selected?.adesoesCentavos||0),'tone-violet')}${metric('Mensalidades',money(selected?.mensalidadesCentavos||0),'tone-blue')}${metric('Reativações',money(selected?.reativacoesCentavos||0),'tone-green')}</div>`:'';
   page('Relatórios',heads+`<div class="panel report-filter-panel"><div class="section-heading"><h3>Filtrar caixa</h3></div>${filter}</div>${cards}${details}`);
   $('#report-month').onchange=async event=>{reportMonth=event.target.value;await views.relatorios();};
   return;
  }
  if(reportTab==='conexoes'){
   const params=new URLSearchParams({papel:reportConnectionsRole});
   if(reportConnectionsMonth)params.set('mes',reportConnectionsMonth);
   if(reportConnectionsMember)params.set('membro',reportConnectionsMember);
   const [data,members]=await Promise.all([api('/admin/relatorios/conexoes?'+params),reportMembers()]);
   const k=data.resumo;
   const number=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:2});
   const moneyOrDash=(cents,hasValue)=>hasValue?money(cents):'—';
   const filteredByMember=Boolean(reportConnectionsMember);
   const periodLabel=reportConnectionsMonth?`${MONTHS_PT[Number(reportConnectionsMonth.slice(5,7))-1]} de ${reportConnectionsMonth.slice(0,4)}`:'';
   const summaryCard=(label,value,kind,iconName,note='')=>`<div class="connection-summary-card ${kind}">
    <div class="connection-summary-top"><span>${esc(label)}</span><span class="connection-summary-icon">${icon(iconName)}</span></div>
    <strong class="connection-summary-number">${esc(value)}</strong>
    ${note?`<small>${esc(note)}</small>`:''}
   </div>`;
   const insight=(label,value)=>`<div class="connection-insight"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
   const ranking=(items,kind)=>{
    if(!items.length)return '<div class="connection-empty">Nenhuma conexão neste período.</div>';
    const max=Math.max(1,...items.map(x=>Number(x.total||0)));
    const item=(x,i)=>{
     const company=kind==='empresa';
     const name=company?(x.empresa||x.membro):(x.membro||x.empresa);
     const subtitle=company?x.membro:(x.empresa||'Empresa não cadastrada');
     const ratio=Math.max(0,Math.min(100,Number(x.total||0)/max*100));
     return `<div class="connection-rank-row">
      <span class="connection-rank-position">${i+1}</span>
      <div class="connection-rank-description"><strong title="${esc(name)}">${esc(name)}</strong><span title="${esc(subtitle)}">${esc(subtitle)}</span><div class="connection-rank-track"><div style="width:${ratio.toFixed(2)}%"></div></div></div>
      <div class="connection-rank-result"><strong>${number(x.total)} <small>${Number(x.total)===1?'conexão':'conexões'}</small></strong></div>
     </div>`;
    };
    return `<div class="connection-rank-list">${items.slice(0,5).map(item).join('')}</div>`;
   };
   const peak=Math.max(1,...data.evolucao.map(x=>x.total));
   const trends=data.evolucao.map(x=>{
    const month=MONTHS_PT[Number(x.mes.slice(5,7))-1]?.slice(0,3)||x.mes.slice(5);
    return `<div class="connections-trend-row"><span>${esc(month)} <small>${esc(x.mes.slice(2,4))}</small></span><progress class="connections-trend-track" max="${peak}" value="${Number(x.total)}" aria-label="${number(x.total)} conexões em ${esc(x.mes)}">${number(x.total)}</progress><strong>${number(x.total)}</strong></div>`;
   }).join('');
   const filters=`<div class="connections-report-filterbar">
     <div class="connections-report-filter"><label for="report-connections-month">Período</label>${monthPicker('report-connections-month',reportConnectionsMonth,'Mês de fechamento. Vazio: histórico completo')}</div>
     <div class="connections-report-filter"><label for="report-connections-role">Participação</label><select id="report-connections-role" class="inline-select"><option value="empresa" ${reportConnectionsRole==='empresa'?'selected':''}>Empresa que fechou</option><option value="visitante" ${reportConnectionsRole==='visitante'?'selected':''}>Membro visitante</option></select></div>
     <div class="connections-report-member">${memberPickerHtml('report-connections-member','Membro ou empresa',members,reportConnectionsMember,{optional:true})}</div>
     ${button('clear-report-connections','Limpar filtros','small connections-report-clear')}
   </div>`;
   page('Relatórios',heads+`<div class="panel connections-report-filter-panel">${filters}</div>
    <div class="connections-overview" aria-label="Indicadores de conexões convertidas">
      ${summaryCard('Conexões convertidas',number(k.total),'connection-summary-primary','handshake',periodLabel)}
      ${summaryCard('Valor total declarado',filteredByMember?'—':moneyOrDash(k.valorTotalCentavos,k.comValor>0),'connection-summary-green','wallet')}
      ${summaryCard('Ticket médio',filteredByMember?'—':moneyOrDash(k.ticketMedioCentavos,k.comValor>0),'connection-summary-violet','chart')}
    </div>
    <div class="panel connections-insights" aria-label="Outros indicadores">
      ${insight('Média por empresa',filteredByMember?'—':number(k.mediaPorEmpresa))}
      ${insight('Empresas com conexões',filteredByMember?'—':number(k.empresasComConexoes))}
      ${insight('Visitantes distintos',filteredByMember?'—':number(k.visitantesUnicos))}
    </div>
    <div class="panel connections-trend-panel"><div class="connections-section-head"><h3>Evolução mensal</h3><span>Últimos 6 meses</span></div><div class="connections-trend-list">${trends}</div></div>
    <div class="grid connections-ranking-grid">
      <section class="panel connections-ranking-panel"><div class="connections-section-head"><h3>Empresas em destaque</h3><span>Por conexões convertidas</span></div>${filteredByMember?'<div class="connection-empty" aria-label="Indicador indisponível para este filtro">—</div>':ranking(data.rankingEmpresas,'empresa')}</section>
      <section class="panel connections-ranking-panel"><div class="connections-section-head"><h3>Membros mais participantes</h3><span>Como visitantes</span></div>${filteredByMember?'<div class="connection-empty" aria-label="Indicador indisponível para este filtro">—</div>':ranking(data.rankingVisitantes,'visitante')}</section>
    </div>`);
   $('#report-connections-month').onchange=async e=>{reportConnectionsMonth=e.target.value;await views.relatorios();};
   $('#report-connections-role').onchange=async e=>{reportConnectionsRole=e.target.value;await views.relatorios();};
   setupMemberPicker('report-connections-member',members,async id=>{reportConnectionsMember=id;await views.relatorios();});
   return;
  }
  // Carrega uma única vez por acesso ao relatório. A troca dos filtros ocorre localmente,
  // evitando várias requisições ao Turso a cada seleção.
  if(!memberReportCache)memberReportCache=await api('/admin/relatorios/membros');
  const filtered=memberReportCache.items.filter(x=>(!memberReportStatus||x.status===memberReportStatus)&&(!memberReportMonth||String(x.cadastrado_em||'').slice(0,7)===memberReportMonth));
  const active=filtered.filter(x=>x.status==='ATIVO').length;
  const received=filtered.reduce((sum,x)=>sum+Number(x.total_pago_centavos||0),0);
  const filter=`<div class="filter-header inline-filters"><div class="filter-inline"><label for="report-member-status">Situação</label><select id="report-member-status" class="inline-select" aria-label="Filtrar por situação"><option value="">Todas</option>${['ATIVO','SUSPENSO','AGUARDANDO_ADESAO','AGUARDANDO_REATIVACAO','INATIVO'].map(v=>`<option value="${v}" ${memberReportStatus===v?'selected':''}>${esc(LABELS[v])}</option>`).join('')}</select></div><div class="filter-inline"><label for="report-member-month">Mês de entrada</label><input id="report-member-month" type="month" value="${esc(memberReportMonth)}"></div><button class="btn small" type="button" data-action="clear-member-filters">Limpar filtros</button></div>`;
  page('Relatórios',heads+`<div class="panel report-filter-panel"><div class="section-heading"><h3>Filtrar membros</h3></div>${filter}</div>
   <div class="grid compact-metrics report-summary">${metric('Membros encontrados',filtered.length,'tone-blue')}${metric('Membros ativos',active,'tone-green')}${metric('Total recebido',money(received),'tone-violet')}</div>
   <div class="panel top-gap">${toolbar(searchField('report-member-search','Buscar membro ou empresa'))}<div id="report-member-table"></div></div>`);
  const draw=()=>{$('#report-member-table').innerHTML=table(['Membro','Entrada','Situação','Pagamentos','Em aberto','Total recebido'],filtered.filter(x=>norm([x.nome,x.empresa,x.ramo].join(' ')).includes(norm($('#report-member-search').value))).map(x=>[
   memberName(x.nome,x.empresa||'Empresa não cadastrada'),dateBR(x.cadastrado_em),badge(x.status),esc(x.pagamentos_confirmados),esc(x.cobrancas_em_aberto),`<strong>${money(x.total_pago_centavos)}</strong>`
  ]));};
  $('#report-member-search').oninput=draw;
  $('#report-member-status').onchange=async event=>{memberReportStatus=event.target.value;await views.relatorios();};
  $('#report-member-month').onchange=async event=>{memberReportMonth=event.target.value;await views.relatorios();};
  draw();
 },
 async config(){
  if(configTab==='financeiro'){
   const c=(await api('/admin/configuracoes')).configuracoes;
   page('Configurações',tabs('config',configTab,[['financeiro','Financeiro'],['ramos','Ramos de atividade'],['categorias','Categorias de despesas']])+`<div class="panel"><form id="settings"><div class="form-grid">${input('mensalidade','Mensalidade (R$)',(c.mensalidade_centavos/100).toFixed(2),'number','required min="0.01" step="0.01"')}${input('adesao','Adesão (R$)',(c.adesao_centavos/100).toFixed(2),'number','required min="0.01" step="0.01"')}${input('diaVencimento','Dia limite para pagamento',c.dia_vencimento,'number','min="1" max="28" required')}${input('toleranciaDias','Tolerância para atraso de pagamento (dias)',c.tolerancia_dias,'number','min="0" max="90" required')}${input('nomeRecebedor','Nome do recebedor',c.nome_recebedor,'text','required')}</div>${textArea('pixMensalidade','Pix Copia e Cola da mensalidade',c.pix_mensalidade||'','rows="3" maxlength="2048" required spellcheck="false"')}${textArea('pixAdesao','Pix Copia e Cola da adesão',c.pix_adesao||'','rows="3" maxlength="2048" required spellcheck="false"')}<div class="notice warning">Cadastre códigos Pix completos (BR Code) para mensalidade e adesão. Confirme o recebedor e o valor no aplicativo do banco.</div><button class="btn primary">Salvar configurações</button></form></div>`);
   $('#settings').onsubmit=async e=>{e.preventDefault();const b=toForm(e.target);try{await api('/admin/configuracoes',{method:'PATCH',body:{mensalidadeCentavos:Math.round(Number(b.mensalidade)*100),adesaoCentavos:Math.round(Number(b.adesao)*100),diaVencimento:Number(b.diaVencimento),toleranciaDias:Number(b.toleranciaDias),nomeRecebedor:b.nomeRecebedor,pixMensalidade:b.pixMensalidade,pixAdesao:b.pixAdesao}});toast('Configurações atualizadas.');}catch(err){toast(err.message,true);}};
  }else{
   const route=configTab==='ramos'?'ramos':'categorias';const result=await api('/admin/catalogos/'+route);
   const label=configTab==='ramos'?'ramo de atividade':'categoria';
   page('Configurações',tabs('config',configTab,[['financeiro','Financeiro'],['ramos','Ramos de atividade'],['categorias','Categorias de despesas']])+`<div class="panel">${toolbar(`<span class="record-count">${result.items.length} cadastro${result.items.length!==1?'s':''}</span>`,`<button class="btn primary" data-action="add-catalog" data-type="${route}">${icon('plus')} Nova ${label}</button>`)}${table(['Nome','Situação',''],result.items.map(x=>[esc(x.nome),badge(x.ativo?'ATIVO':'INATIVO'),`<button class="btn icon-button" data-action="edit-catalog" data-type="${route}" data-id="${esc(x.id)}" aria-label="Editar ${esc(x.nome)}" title="Editar">${icon('edit')}</button>`]))}</div>`);
   window.__catalogItems=result.items;
  }
 }
};

async function addOrEditExpense(id){
 const current=id?currentExpenses.find(x=>x.id===id):null;if(id&&!current)throw Error('Despesa não encontrada.');
 const cats=await activeCategorias();
 dialogForm(current?'Editar despesa':'Nova despesa',`<div class="form-grid">${input('descricao','Descrição',current?.descricao||'','text','required minlength="3"')}${select('categoria','Categoria',cats,current?.categoria||'')}${input('valor','Valor (R$)',current?(Number(current.valor_centavos)/100).toFixed(2):'','number','required min="0.01" step="0.01"')}${input('data','Data',current?.data||new Date().toLocaleDateString('sv-SE'),'date','required')}${select('status','Situação',[{nome:'Paga',value:'PAGA'},{nome:'Prevista',value:'PREVISTA'}],current?.status||'PAGA')}</div>`,async b=>{
  b.valorCentavos=Math.round(Number(b.valor)*100);delete b.valor;
  await api(current?'/admin/despesas/'+encodeURIComponent(current.id):'/admin/despesas',{method:current?'PATCH':'POST',body:b});await render();toast(current?'Despesa atualizada.':'Despesa cadastrada.');
 },{submit:current?'Salvar alterações':'Cadastrar despesa'});
}
function manageMember(id){
 const x=currentMembers.find(row=>row.id===id);if(!x)throw Error('Membro não encontrado.');
 dialogForm('Gerenciar membro',`<div class="member-detail-head">${memberName(x.nome,x.email)}${badge(x.status)}</div><dl class="detail-grid"><div><dt>Empresa</dt><dd>${esc(x.empresa)}</dd></div><div><dt>Ramo</dt><dd>${esc(x.ramo||'—')}</dd></div><div><dt>Telefone</dt><dd>${esc(x.telefone?formatPhone(x.telefone):'—')}</dd></div><div><dt>Próximo vencimento</dt><dd>${dateBR(x.proximo_vencimento)}</dd></div></dl><div class="manage-actions">${x.status==='INATIVO'||x.status==='SUSPENSO'?`<button class="btn" type="button" data-action="reactivate" data-id="${esc(x.id)}">Reativar</button>`:''}${x.status!=='INATIVO'?`<button class="btn danger" type="button" data-action="deactivate" data-id="${esc(x.id)}">Desativar</button>`:''}<button class="btn" type="button" data-action="edit-birthday" data-id="${esc(x.id)}">Editar aniversário</button><button class="btn" type="button" data-action="reset-password" data-id="${esc(x.id)}">Redefinir senha</button></div>`,async()=>{},{submit:'Fechar'});
}
function changeDialog(nextTitle,html,handler,submit){$('#form-dialog')?.close();dialogForm(nextTitle,html,handler,{submit});}

document.addEventListener('click',async event=>{
 const nav=event.target.closest('[data-nav]');if(nav){await go(nav.dataset.nav);return;}
 const tab=event.target.closest('[data-tab]');if(tab){if(tab.dataset.group==='relatorios')reportTab=tab.dataset.tab;else configTab=tab.dataset.tab;syncNavigation('push');await render();return;}
 const b=event.target.closest('[data-action]');if(!b)return;
 const act=b.dataset.action,id=b.dataset.id;
 if(act==='toggle-password'){
  const field=document.getElementById(b.dataset.field);if(!field)return;
  const revealing=field.type==='password';field.type=revealing?'text':'password';
  b.innerHTML=icon(revealing?'eyeOff':'eye');b.setAttribute('aria-label',revealing?'Ocultar senha':'Mostrar senha');b.title=revealing?'Ocultar senha':'Mostrar senha';return;
 }
 if(act==='menu-toggle'){$('.layout')?.classList.add('menu-open');return;}
 if(act==='menu-close'){closeMenu();return;}
 try{
  if(act==='account')await go('perfil');
  else if(act==='settings')await go('config');
  else if(act==='logout'){await api('/auth/logout',{method:'POST'});user=null;lastUserRefresh=0;activeMemberListCache=null;view='';syncNavigation('replace');loginScreen();}
  else if(act==='change-password')await go('senha');
  else if(act==='clear-cash-filters'){reportMonth='';await views.relatorios();}
  else if(act==='clear-member-filters'){memberReportStatus='';memberReportMonth='';await views.relatorios();}
  else if(act==='clear-report-connections'){reportConnectionsMonth='';reportConnectionsMember='';reportConnectionsRole='empresa';await views.relatorios();}
  else if(act==='copy-pix'){
   const code=$('#pix-code')?.value;if(!code)throw Error('Código Pix indisponível.');
   try{await navigator.clipboard.writeText(code);toast('Código Pix copiado.');}
   catch{const area=$('#pix-code');area.focus();area.select();toast('Selecione o código Pix e copie manualmente.');}
  }
  else if(act==='new-connection'){
   const members=await activeMembers();
   if(!members.length)throw Error('Não existem outros membros ativos para registrar.');
   dialogForm('Registrar conexão convertida',`${memberPickerHtml('visitanteMembroId','Membro que visitou e fechou negócio',members)}${input('dataFechamento','Data do negócio',currentDateBR(),'date','required max="'+currentDateBR()+'"')}${input('valor','Valor do negócio (R$) · opcional','','number','min="0.01" step="0.01" inputmode="decimal" placeholder="0,00"')}${textArea('observacao','Observação (opcional)','','maxlength="240" rows="3"')}`,async v=>{const valorCentavos=v.valor.trim()===''?null:Math.round(Number(v.valor)*100);delete v.valor;await api('/me/conexoes',{method:'POST',body:{...v,valorCentavos}});connectionsPage=1;await views.conexoes();toast('Negócio registrado.');},{submit:'Registrar negócio'});
   setupMemberPicker('visitanteMembroId',members);
  }
  else if(act==='delete-connection'){
   dialogForm('Excluir negócio',`<p>Deseja remover este registro de negócio da sua empresa?</p>`,async()=>{await api('/me/conexoes/'+encodeURIComponent(id),{method:'DELETE'});connectionsPage=1;await views.conexoes();toast('Negócio removido.');},{submit:'Excluir registro'});
  }
  else if(act==='connections-prev'){connectionsPage=Math.max(1,connectionsPage-1);await views.conexoes();}
  else if(act==='connections-next'){connectionsPage++;await views.conexoes();}
  else if(act==='clear-connections'){connectionsMonth='';connectionsVisitor='';connectionsPage=1;await views.conexoes();}
  else if(act==='inform-payment')dialogForm('Informar pagamento','<p class="muted">Confirma que realizou o pagamento? A administração fará a conferência.</p>',async()=>{await api('/me/cobrancas/'+encodeURIComponent(id)+'/informar',{method:'POST'});await render();toast('Pagamento informado.');},{submit:'Confirmar'});
  else if(act==='cancel-member')dialogForm('Sair do grupo',`<p class="notice warning">Sua participação e acesso serão desativados.</p>${input('confirmacao','Digite CANCELAR para confirmar')}`,async v=>{if(v.confirmacao!=='CANCELAR')throw Error('Digite CANCELAR para confirmar.');await api('/me/cancelar',{method:'POST',body:v});user=null;view='';syncNavigation('replace');loginScreen();toast('Participação cancelada.');},{submit:'Sair do grupo'});
  else if(act==='confirm')dialogForm('Confirmar pagamento',`<dl class="detail"><dt>Membro</dt><dd>${esc(b.dataset.name)}</dd><dt>Valor</dt><dd>${money(b.dataset.value)}</dd></dl>${input('recebidoEm','Data do recebimento',new Date().toLocaleDateString('sv-SE'),'date','required')}`,async v=>{await api('/admin/cobrancas/'+encodeURIComponent(id)+'/confirmar',{method:'POST',body:v});await render();toast('Pagamento confirmado.');},{submit:'Marcar como pago'});
  else if(act==='reject')dialogForm('Rejeitar pagamento','<p class="muted">A cobrança voltará para pendente. O membro poderá informar o pagamento novamente em Minha Área.</p>',async()=>{await api('/admin/cobrancas/'+encodeURIComponent(id)+'/rejeitar',{method:'POST'});await render();toast('Pagamento rejeitado.');},{submit:'Rejeitar'});
  else if(act==='manage-member')manageMember(id);
  else if(act==='deactivate')changeDialog('Desativar membro',textArea('motivo','Motivo','Desativado pela administração'),async v=>{await api('/admin/membros/'+encodeURIComponent(id)+'/desativar',{method:'POST',body:v});await render();toast('Membro desativado.');},'Desativar');
  else if(act==='reactivate')changeDialog('Reativar membro',select('modalidade','Valor de reativação',[{nome:'Mensalidade',value:'MENSALIDADE'},{nome:'Adesão',value:'ADESAO'}],'MENSALIDADE'),async v=>{await api('/admin/membros/'+encodeURIComponent(id)+'/reativar',{method:'POST',body:v});await render();toast('Cobrança de reativação criada.');},'Criar cobrança');
  else if(act==='edit-birthday'){
   const x=currentMembers.find(x=>x.id===id);if(!x)throw Error('Membro não encontrado.');
   changeDialog('Aniversário do membro',`<p class="muted">Apenas dia e mês serão divulgados aos demais membros.</p>${input('dataNascimento','Data de nascimento (opcional)',x.data_nascimento||'','date','max="'+currentDateBR()+'"')}`,async v=>{await api('/admin/membros/'+encodeURIComponent(id)+'/aniversario',{method:'PATCH',body:v});await render();toast('Aniversário atualizado.');},'Salvar data');
  }
  else if(act==='reset-password')changeDialog('Redefinir senha','<p class="muted">A senha atual será revogada.</p>',async()=>{const x=await api('/admin/membros/'+encodeURIComponent(id)+'/redefinir-senha',{method:'POST'});setTimeout(()=>secretDialog(x.senhaTemporaria),0);},'Redefinir');
  else if(act==='add-member'){
   const branches=await activeRamos();
   dialogForm('Novo membro',`<div class="form-grid">${input('nome','Nome completo','','text','required minlength="2"')}${input('email','E-mail','','email','required')}${phoneInput('telefone','Telefone','',true)}${input('dataNascimento','Data de nascimento (opcional)','','date')}${input('empresa','Empresa (opcional)','','text','maxlength="180" placeholder="Pode ser cadastrado depois"')}${select('ramo','Ramo de atividade (opcional)',branches,'','')}</div>`,async v=>{const x=await api('/admin/membros',{method:'POST',body:v});await render();setTimeout(()=>secretDialog(x.senhaTemporaria),0);toast('Membro cadastrado.');},{submit:'Cadastrar membro'});
  }
  else if(act==='add-expense'||act==='edit-expense')await addOrEditExpense(act==='edit-expense'?id:null);
  else if(act==='edit-company'){
   const x=currentCompany;if(!x)throw Error('Empresa não encontrada.');const branches=await activeRamos();
   dialogForm('Editar empresa',`<div class="form-grid">${input('nome','Empresa',x.nome,'text','required minlength="2" maxlength="180"')}${select('ramo','Ramo de atividade',branches,x.ramo)}${phoneInput('telefone','Telefone comercial',x.telefone)}${instagramInput(x.instagram)}${siteInput(x.site)}</div>${textArea('descricao','Atuação',x.descricao,`maxlength="${MAX_COMPANY_DESCRIPTION}" data-company-description`)}<p class="description-counter" id="company-description-count" aria-live="polite">${String(x.descricao||'').length} / ${MAX_COMPANY_DESCRIPTION} caracteres</p><p class="muted">Os dados comerciais preenchidos serão visíveis aos membros ativos no diretório.</p>`,async v=>{await api('/me/empresa',{method:'PUT',body:v});await render();toast('Empresa atualizada.');},{submit:'Salvar alterações'});
  }
  else if(act==='add-catalog'||act==='edit-catalog'){
   const type=b.dataset.type;const row=act==='edit-catalog'?window.__catalogItems?.find(x=>x.id===id):null;
   const name=type==='ramos'?'ramo de atividade':'categoria de despesa';
   dialogForm(row?'Editar '+name:'Novo '+name,`${input('nome','Nome',row?.nome||'','text','required minlength="2" maxlength="90"')}${row?select('ativo','Situação',[{nome:'Ativo',value:'1'},{nome:'Inativo',value:'0'}],String(Number(row.ativo))):''}`,async v=>{
    const uri='/admin/catalogos/'+type+(row?'/'+encodeURIComponent(id):'');
    await api(uri,{method:row?'PATCH':'POST',body:{nome:v.nome,...(row?{ativo:v.ativo==='1'}:{})}});
    await render();toast('Cadastro atualizado.');
   },{submit:row?'Salvar alterações':'Cadastrar'});
  }
 }catch(err){toast(err.message,true);}
});

document.addEventListener('input',event=>{if(event.target?.matches?.('[data-company-description]')){const counter=$('#company-description-count');if(counter){const count=event.target.value.length;counter.textContent=`${count} / ${MAX_COMPANY_DESCRIPTION} caracteres`;counter.classList.toggle('over-limit',count>MAX_COMPANY_DESCRIPTION);}}});
document.addEventListener('input',event=>{const f=event.target;if(f?.dataset?.format==='phone'){f.value=formatPhone(f.value);f.setCustomValidity('');}else if(f?.dataset?.format==='instagram'||f?.dataset?.format==='site'){f.setCustomValidity('');}});
document.addEventListener('blur',event=>{const f=event.target;if(f?.dataset?.format==='instagram')f.value=normalizeInstagram(f.value);else if(f?.dataset?.format==='site')f.value=f.value.trim();},true);
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
await refreshUser();await render();
