import test from 'node:test';
import assert from 'node:assert/strict';
import { memberDisplay, filterMembers, isBirthdayToday } from '../public/assets/js/memberSearch.js';

const members = [
  { id:'1', nome:'João da Silva', empresa:'Órbita Tecnologia' },
  { id:'2', nome:'Maria Santos', empresa:'Inconecta Soluções' },
  { id:'3', nome:'Renata Lima', empresa:'Orbe Consultoria' },
];

test('busca por nome, empresa e combinação sem depender de acentos', () => {
  assert.deepEqual(filterMembers(members,'Joao').map(x=>x.id),['1']);
  assert.deepEqual(filterMembers(members,'orbita joao').map(x=>x.id),['1']);
  assert.deepEqual(filterMembers(members,'Soluções Maria').map(x=>x.id),['2']);
  assert.deepEqual(filterMembers(members,'Consultoria').map(x=>x.id),['3']);
  assert.deepEqual(filterMembers(members,'inexistente'),[]);
});

test('lista tem limite de resultados e preserva identificador do membro', () => {
  assert.equal(memberDisplay({nome:'Ana',empresa:'Loja ABC'}),'Ana — Loja ABC');
  assert.equal(memberDisplay({nome:'Ana'}),'Ana — Empresa não cadastrada');
  assert.equal(filterMembers(members,'',2).length,2);
  assert.deepEqual(filterMembers(members,'',0),[]);
});

test('destaque de aniversário compara dia e mês, sem revelar ano', () => {
  assert.equal(isBirthdayToday({dia:'13',mes:'11'},'2026-11-13'),true);
  assert.equal(isBirthdayToday({dia:'12',mes:'11'},'2026-11-13'),false);
  assert.equal(isBirthdayToday({dia:'13',mes:'12'},'2026-11-13'),false);
  assert.equal(isBirthdayToday({dia:'29',mes:'02'},'2028-02-29'),true);
});
