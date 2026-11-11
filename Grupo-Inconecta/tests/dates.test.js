import test from 'node:test';import assert from 'node:assert/strict';
import { nextDueAtLeast30Days,nextMonthDue,plusDays } from '../src/lib/dates.js';
test('adesão 08/11 -> 10/12',()=>assert.equal(nextDueAtLeast30Days('2026-11-08',10),'2026-12-10'));
test('adesão 20/11 -> 10/01',()=>assert.equal(nextDueAtLeast30Days('2026-11-20',10),'2027-01-10'));
test('adesão 15/12 -> 10/02',()=>assert.equal(nextDueAtLeast30Days('2026-12-15',10),'2027-02-10'));
test('virada de ano no próximo vencimento',()=>assert.equal(nextMonthDue('2026-12-10',10),'2027-01-10'));
test('período de tolerância',()=>assert.equal(plusDays('2026-11-10',5),'2026-11-15'));
