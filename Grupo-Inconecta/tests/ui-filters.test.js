import test from 'node:test';
import assert from 'node:assert/strict';
import { birthdayFilterOptions, periodFilterOptions, MONTHS_PT } from '../public/assets/js/filterOptions.js';

const referenceMonth = '2026-11';

test('opções de período usam select com mês/ano e selecionam o mês atual', () => {
  const html = periodFilterOptions('2026-11', { referenceMonth });
  assert.match(html, /<option value="2026-11" selected>Novembro de 2026<\/option>/);
  assert.match(html, /<option value="2026-10" >Outubro de 2026<\/option>/);
  assert.equal((html.match(/<option value="\d{4}-\d{2}"/g) || []).length, 48);
  assert.equal((html.match(/selected/g) || []).length, 1);
});

test('períodos de anos anteriores continuam disponíveis ao navegar entre anos', () => {
  const html = periodFilterOptions('2020-03', { referenceMonth });
  assert.match(html, /<option value="2020-03" selected>Março de 2020<\/option>/);
  assert.match(html, /<optgroup label="2020">/);
  assert.match(html, /<option value="2026-11" >Novembro de 2026<\/option>/);
});

test('filtro opcional de conexões inclui todos os meses e não seleciona um mês por engano', () => {
  const html = periodFilterOptions('', { includeAll: true, referenceMonth });
  assert.match(html, /<option value="" selected>Todos os meses<\/option>/);
  assert.equal((html.match(/selected/g) || []).length, 1);
});

test('filtro de aniversariantes mantém exatamente os doze meses', () => {
  const html = birthdayFilterOptions('02');
  assert.equal(MONTHS_PT.length, 12);
  assert.equal((html.match(/<option /g) || []).length, 12);
  assert.match(html, /<option value="02" selected>Fevereiro<\/option>/);
  assert.match(html, /<option value="12" >Dezembro<\/option>/);
  assert.equal((html.match(/selected/g) || []).length, 1);
});

test('períodos inválidos são rejeitados e não são interpolados em HTML', () => {
  assert.throws(() => periodFilterOptions('2026-11', { referenceMonth: '2026-13' }), TypeError);
  const html = periodFilterOptions('<script>alert(1)</script>', { referenceMonth });
  assert.doesNotMatch(html, /<script>/);
});
