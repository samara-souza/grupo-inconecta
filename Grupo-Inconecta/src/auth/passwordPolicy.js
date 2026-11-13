import { randomInt } from 'node:crypto';
import { fail } from '../lib/errors.js';
const groups=['abcdefghijkmnpqrstuvwxyz','ABCDEFGHJKLMNPQRSTUVWXYZ','23456789','!@#$%&*?'];
export function validatePassword(password){fail(typeof password==='string' && password.length>=12 && password.length<=128,'A senha deve possuir de 12 a 128 caracteres.');fail(/[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^\da-zA-Z]/.test(password),'A senha deve conter maiúscula, minúscula, número e símbolo.');return password;}
export function temporaryPassword(){const all=groups.join('');const chars=groups.map(s=>s[randomInt(s.length)]);while(chars.length<16)chars.push(all[randomInt(all.length)]);for(let i=chars.length-1;i>0;i--){const j=randomInt(i+1);[chars[i],chars[j]]=[chars[j],chars[i]];}return chars.join('');}
