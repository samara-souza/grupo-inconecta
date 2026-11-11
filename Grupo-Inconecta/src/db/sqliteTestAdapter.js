// Compatibilidade do adaptador local de testes com Node.js 22.14+.
// statement.columns() não está disponível em todas as versões do node:sqlite.
// Este módulo é usado apenas em NODE_ENV=test; a conexão com Turso não muda.
export function executePreparedSqlite(statement, sql, args = []) {
  const columns = typeof statement.columns === 'function' ? statement.columns() : null;
  // Sem columns(), a identificação é feita pelo comando SQL.
  // RETURNING também devolve linhas em INSERT/UPDATE/DELETE.
  const returnsRows = columns !== null
    ? columns.length > 0
    : /^(?:SELECT|PRAGMA|EXPLAIN|VALUES|WITH)\b/i.test(sql.trimStart()) || /\bRETURNING\b/i.test(sql);

  if (returnsRows) {
    return { rows: statement.all(...args), rowsAffected: 0 };
  }
  const result = statement.run(...args);
  return {
    rows: [],
    rowsAffected: Number(result.changes),
    lastInsertRowid: result.lastInsertRowid
  };
}
