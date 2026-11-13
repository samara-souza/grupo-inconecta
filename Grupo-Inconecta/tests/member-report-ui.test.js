import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app=readFileSync(new URL('../public/assets/js/app.js',import.meta.url),'utf8');
const memberConnections=app.split('async conexoes(){')[1].split('async area(){')[0];
const rankings=app.split("if(reportTab==='conexoes'){")[1].split('// Carrega uma única vez')[0];
const routes=readFileSync(new URL('../src/controllers/routes.js',import.meta.url),'utf8');

test('rodapé mostra apenas Desenvolvido por Estela, sem versão',()=>{
 assert.match(app,/Desenvolvido por <strong>Estela<\/strong>/);
 assert.doesNotMatch(app,/build-version|Versão do sistema|v0\.11\.3/);
});

test('relatório limita os dois rankings a cinco, sem expansão',()=>{
 assert.match(rankings,/items\.slice\(0,5\)/);
 assert.doesNotMatch(rankings,/connection-rank-more|Ver mais/);
 const sql=readFileSync(new URL('../src/services/conexoesReportSql.js',import.meta.url),'utf8');
 assert.equal((sql.match(/LIMIT 5/g)||[]).length,2);
});

test('membro vê quantidade e soma de valores de todas as conexões filtradas',()=>{
 assert.match(memberConnections,/Conexões convertidas/);
 assert.match(memberConnections,/Valor total informado/);
 assert.match(memberConnections,/data\.resumo\?\.comValor/);
 const route=routes.split("r.get('/me/conexoes'")[1].split("r.post('/me/conexoes'")[0];
 assert.match(route,/COUNT\(\*\) AS total, COUNT\(c\.valor_centavos\) AS com_valor/);
 assert.match(route,/SUM\(c\.valor_centavos\)/);
 assert.equal((route.match(/one\(`/g)||[]).length,1);
});
