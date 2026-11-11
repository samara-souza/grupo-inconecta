import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { executePreparedSqlite } from '../src/db/sqliteTestAdapter.js';

// Simula explicitamente o SQLite do Node 22.14, sem statement.columns().
function withoutColumns(statement) {
  return { all: (...args) => statement.all(...args), run: (...args) => statement.run(...args) };
}

test('Node 22.14: SELECT e INSERT funcionam sem statement.columns()', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const create = executePreparedSqlite(withoutColumns(db.prepare('CREATE TABLE teste (id INTEGER PRIMARY KEY, nome TEXT)')), 'CREATE TABLE teste (id INTEGER PRIMARY KEY, nome TEXT)');
    assert.equal(create.rowsAffected, 0);
    const insertSql = 'INSERT INTO teste (nome) VALUES (?)';
    const insert = executePreparedSqlite(withoutColumns(db.prepare(insertSql)), insertSql, ['Estela']);
    assert.equal(insert.rowsAffected, 1);
    const selectSql = 'SELECT id, nome FROM teste WHERE nome=?';
    const selected = executePreparedSqlite(withoutColumns(db.prepare(selectSql)), selectSql, ['Estela']);
    assert.equal(selected.rows.length, 1);
    assert.equal(selected.rows[0].nome, 'Estela');
    assert.equal(selected.rowsAffected, 0);
  } finally { db.close(); }
});

test('Node 22.14: UPDATE RETURNING retorna os IDs, inclusive sem columns()', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec("CREATE TABLE teste (id INTEGER PRIMARY KEY, estado TEXT); INSERT INTO teste VALUES (1, 'PENDENTE')");
    const sql = "UPDATE teste SET estado='PAGO' WHERE id=? RETURNING id";
    const res = executePreparedSqlite(withoutColumns(db.prepare(sql)), sql, [1]);
    assert.deepEqual(res.rows.map(x=>x.id), [1]);
    assert.equal(res.rowsAffected, 0);
    assert.equal(db.prepare('SELECT estado FROM teste WHERE id=1').get().estado,'PAGO');
  } finally { db.close(); }
});

test('Node 22.14: a compatibilidade preserva rowsAffected em UPDATE sem RETURNING', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec("CREATE TABLE teste (id INTEGER PRIMARY KEY, estado TEXT); INSERT INTO teste VALUES (1, 'PENDENTE')");
    const sql = "UPDATE teste SET estado='PAGO' WHERE id=?";
    const res = executePreparedSqlite(withoutColumns(db.prepare(sql)), sql, [1]);
    assert.equal(res.rowsAffected, 1);
    assert.deepEqual(res.rows, []);
  } finally { db.close(); }
});
