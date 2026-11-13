import test from 'node:test';
import assert from 'node:assert/strict';
import { phoneBR,instagramHandle,paymentLink,pixCopiaCola,birthdayDate,yearMonth,nextYearMonth } from '../src/lib/validation.js';
import { samplePix } from './pixFixture.js';

test('telefone brasileiro aceita DDD + celular/fixo e normaliza pontuação',()=>{
 assert.equal(phoneBR('(41) 99999-9999'),'41999999999');
 assert.equal(phoneBR('41 3333-2222'),'4133332222');
 assert.equal(phoneBR('+55 (41) 99999-9999'),'41999999999');
 assert.equal(phoneBR(''),'');
 assert.throws(()=>phoneBR('999999999'),/válido/);
 assert.throws(()=>phoneBR('', 'Telefone',{required:true}),/obrigatório/);
});
test('instagram aceita @identificador ou link e rejeita caracteres indevidos',()=>{
 assert.equal(instagramHandle('@minha.empresa'),'@minha.empresa');
 assert.equal(instagramHandle('https://www.instagram.com/minha_empresa/'),'@minha_empresa');
 assert.equal(instagramHandle(''),'');
 assert.throws(()=>instagramHandle('@nome com espaço'),/Instagram/);
 assert.throws(()=>instagramHandle('@nome..invalido'),/Instagram/);
});

test('links de pagamento: somente domínio HTTPS público',()=>{
 assert.equal(paymentLink('https://banco.example/pagamento?id=123','Link'),'https://banco.example/pagamento?id=123');
 assert.throws(()=>paymentLink('http://banco.example/pagamento','Link'),/HTTPS/);
 assert.throws(()=>paymentLink('https://localhost/pagamento','Link'),/domínio público/);
 assert.throws(()=>paymentLink('https://127.0.0.1/pagamento','Link'),/domínio público/);
 assert.throws(()=>paymentLink('javascript:alert(1)','Link'),/URL inválida|HTTPS/);
});

test('Pix Copia e Cola valida CRC e não permite códigos incompletos',()=>{
 const code=samplePix();assert.equal(pixCopiaCola(code),code);
 assert.throws(()=>pixCopiaCola(code.slice(0,-1)+'A'),/erro de verificação|incompleto/);
 assert.throws(()=>pixCopiaCola('chave@pix.com'),/código Pix/);
 assert.equal(pixCopiaCola(''),'');
});
test('datas de nascimento e competência mensal são validadas',()=>{
 assert.equal(birthdayDate('1992-02-29'),'1992-02-29');
 assert.equal(birthdayDate(''),null);
 assert.throws(()=>birthdayDate('2026-02-29'),/data inválida/);
 assert.throws(()=>birthdayDate('2999-01-01'),/futura/);
 assert.equal(yearMonth('2026-11'),'2026-11');
 assert.equal(nextYearMonth('2026-12'),'2027-01');
 assert.throws(()=>yearMonth('2026-13'),/mês válido/);
});
