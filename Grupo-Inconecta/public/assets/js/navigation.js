// Navegação por fragmento: não faz requisições ao servidor e não acessa o banco.
// Rotas públicas (login) são tratadas fora daqui; autorização ocorre no backend.
const PAGES = new Set(['dashboard','membros','diretorio','aniversariantes','conexoes',
 'area','pendencias','despesas','relatorios','config','perfil','senha']);
const REPORT_TABS = new Set(['caixa','membros','conexoes']);
const CONFIG_TABS = new Set(['financeiro','ramos','categorias']);

export function parseAppRoute(hash=''){
 const raw=String(hash||'').replace(/^#\/?/,'').split('?')[0];
 const parts=raw.split('/').filter(Boolean);
 const view=PAGES.has(parts[0])?parts[0]:'';
 const reportTab=view==='relatorios'&&REPORT_TABS.has(parts[1])?parts[1]:'caixa';
 const configTab=view==='config'&&CONFIG_TABS.has(parts[1])?parts[1]:'financeiro';
 return {view,reportTab,configTab};
}

export function buildAppHash(view,{reportTab='caixa',configTab='financeiro'}={}){
 if(!PAGES.has(view))return '#/';
 if(view==='relatorios')return '#/relatorios/'+(REPORT_TABS.has(reportTab)?reportTab:'caixa');
 if(view==='config')return '#/config/'+(CONFIG_TABS.has(configTab)?configTab:'financeiro');
 return '#/'+view;
}
