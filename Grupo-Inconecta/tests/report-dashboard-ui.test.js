import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const app = readFileSync(new URL('../public/assets/js/app.js', import.meta.url), 'utf8');
const report = app.split("if(reportTab==='conexoes'){")[1].split('// Carrega uma única vez')[0];

test('relatório mantém apenas a barra de filtros, sem título ou textos removidos', () => {
 assert.ok(report.includes('connections-report-filter-panel'));
 assert.doesNotMatch(report,/Filtrar conexões convertidas|Cobertura de valores|registro\(s\) sem valor/);
 assert.equal((report.match(/Membro ou empresa/g)||[]).length,1);
});

test('relatório mantém seleção de mês, participação e busca de membro', () => {
 assert.match(report,/monthPicker\('report-connections-month'/);
 assert.match(report,/id="report-connections-role"/);
 assert.match(report,/memberPickerHtml\('report-connections-member'/);
 assert.match(report,/setupMemberPicker\('report-connections-member'/);
});

test('indicadores acumulados, evolução mensal e rankings por quantidade continuam disponíveis', () => {
 assert.match(report,/Valor total declarado/);
 assert.match(report,/Ticket médio/);
 assert.match(report,/data\.evolucao/);
 assert.match(report,/data\.rankingEmpresas/);
 assert.match(report,/data\.rankingVisitantes/);
 assert.match(report,/items\.slice\(0,5\)/);
 assert.doesNotMatch(report,/x\.valorTotalCentavos|x\.comValor/);
 assert.doesNotMatch(report,/Valores informados pelos membros|Negócios com valor informado/);
 assert.match(report,/number\(x\.total\)/);
 assert.doesNotMatch(report,/connection-rank-more|Ver mais [^<]*posições/);
});


test('sem selecionar mês, relatório exibe histórico completo e mês é filtro opcional', () => {
 assert.match(app, /let reportConnectionsMonth = '';/);
 assert.doesNotMatch(app, /reportConnectionsMonth=currentMonthBR\(\)/);
 assert.match(report, /if\(reportConnectionsMonth\)params\.set\('mes',reportConnectionsMonth\)/);
 assert.doesNotMatch(report, /Todos os períodos/);
 assert.match(report, /const filteredByMember=Boolean\(reportConnectionsMember\)/);
 assert.match(report, /data\.evolucao\.map/);
});


test('filtro por empresa ou visitante mostra só quantidade e evolução; demais resultados ficam em traço', () => {
 assert.match(report, /summaryCard\('Conexões convertidas',number\(k.total\)/);
 assert.match(report, /summaryCard\('Valor total declarado',filteredByMember\?'—'/);
 assert.match(report, /summaryCard\('Ticket médio',filteredByMember\?'—'/);
 for (const title of ['Média por empresa','Empresas com conexões','Visitantes distintos']) {
  assert.ok(report.includes(`insight('${title}',filteredByMember?'—'`));
 }
 assert.match(report, /filteredByMember\?'<div class=/);
 assert.match(report, /data\.evolucao\.map/);
});
