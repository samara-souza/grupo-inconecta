// Compatibilidade do adaptador local de testes com Node.js 22.14+.
// statement.columns() não está disponível em todas as versões do node:sqlite.
// Este módulo é usado apenas em NODE_ENV=test; a conexão com Turso não muda.
export function executePreparedSqlite(statement, sql, args = []) {
  // DDL (ex.: ALTER TABLE ... CHECK) pode expor metadados transitórios de
  // colunas na API experimental do Node 22, embora NÃO produza resultados.
  // Nunca use columns() para classificar CREATE/ALTER/DROP como consultas.
  const candidate = /^(?:SELECT|PRAGMA|EXPLAIN|VALUES|WITH)\b/i.test(sql.trimStart()) || /\bRETURNING\b/i.test(sql);
  const columns = candidate && typeof statement.columns === 'function' ? statement.columns() : null;
  const returnsRows = candidate && (columns === null || columns.length > 0);

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
