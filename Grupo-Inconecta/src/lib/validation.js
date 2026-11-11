import { isIP } from 'node:net';
import { fail } from './errors.js';
export function str(value,label,{min=0,max=255}={}) {
  fail(typeof value==='string',`${label}: texto obrigatório.`);
  const s=value.trim(); fail(s.length>=min && s.length<=max,`${label}: deve ter entre ${min} e ${max} caracteres.`);
  return s;
}
export function email(value) {const s=str(value,'E-mail',{min:5,max:180}).toLowerCase(); fail(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s),'E-mail inválido.');return s;}
export function posInt(value,label,min=0,max=100000000) {const n=Number(value);fail(Number.isSafeInteger(n) && n>=min && n<=max,`${label}: valor inválido.`);return n;}
export function dateOnly(value,label) {fail(typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value),`${label}: data inválida.`);const t=new Date(`${value}T12:00:00Z`);fail(!Number.isNaN(t.getTime()) && t.toISOString().slice(0,10)===value,`${label}: data inválida.`);return value;}
export function urlOrBlank(value,label) {const s=str(value??'',label,{max:2048}); if (!s)return '';let url;try{url=new URL(s);}catch{fail(false,`${label}: URL inválida.`);}fail(url.protocol==='https:' && !url.username && !url.password,`${label}: informe um endereço HTTPS válido.`);return url.href;}

// Normalização de dados de contato: apenas formato brasileiro (DDD + número).
export function phoneBR(value,label='Telefone',{required=false}={}) {
 const raw=str(value??'',label,{max:40});if(!raw){fail(!required,`${label}: obrigatório.`);return '';}
 let digits=raw.replace(/\D/g,'');
 if(digits.startsWith('55')&&[12,13].includes(digits.length))digits=digits.slice(2);
 fail([10,11].includes(digits.length)&&!digits.startsWith('00')&&digits[0]!=='0'&&digits[2]!=='0',`${label}: informe DDD e número válido (10 ou 11 dígitos).`);
 return digits;
}
export function instagramHandle(value){
 let raw=str(value??'','Instagram',{max:180});if(!raw)return '';
 raw=raw.replace(/^https?:\/\/(?:www\.)?instagram\.com\//i,'').split(/[/?#]/)[0].replace(/^@/,'');
 fail(/^[a-zA-Z0-9._]{1,30}$/.test(raw)&&!raw.includes('..')&&!raw.endsWith('.'),'Instagram: informe @usuario válido, sem espaços ou caracteres especiais.');
 return '@'+raw;
}

export function freeTextOrBlank(value,label,{max=2048}={}) { return str(value ?? '', label, {max}); }

// Links bancários externos: somente HTTPS público. O sistema nunca acessa o link no servidor.
export function paymentLink(value,label) {
 const s=urlOrBlank(value,label);
 if(!s)return '';
 const u=new URL(s);const host=u.hostname.toLowerCase();
 fail(host.includes('.') && !isIP(host) && host!=='localhost' && !host.endsWith('.localhost') && !host.endsWith('.local') && !host.endsWith('.internal'),
  `${label}: utilize um domínio público HTTPS do banco ou provedor de pagamentos.`);
 return u.href;
}
