import { createClient } from '@libsql/client/web';
import { DatabaseSync } from 'node:sqlite';
import * as schema from './schema.js';
import { invalidateReadCache } from '../lib/readCache.js';
import { executePreparedSqlite } from './sqliteTestAdapter.js';

let client;
let database;
// Isolado nos testes: não é usado em desenvolvimento nem produção.
function testClient(url){
  const sqlite=new DatabaseSync(url.slice(5));
  sqlite.exec('PRAGMA foreign_keys=ON');
  let inTransaction=false;
  const execute=(query)=>{
    const sql=typeof query==='string'?query:query.sql;
    const args=typeof query==='string'?[]:(query.args||[]);
    const statement=sqlite.prepare(sql);
    return executePreparedSqlite(statement,sql,args);
  };
  return {
    execute:async(q)=>execute(q),
    transaction:async()=>{
      if(inTransaction)throw new Error('Transação de teste já aberta.');
      sqlite.exec('BEGIN IMMEDIATE');inTransaction=true;
      return {
        execute:async(q)=>execute(q),
        commit:async()=>{sqlite.exec('COMMIT');inTransaction=false;},
        rollback:async()=>{if(inTransaction){sqlite.exec('ROLLBACK');inTransaction=false;}}
      };
    },
    close:()=>sqlite.close()
  };
}

/**
 * Mesmo padrão Turso do Estela: usa o banco libSQL remoto desde o desenvolvimento.
 * SQLite local é permitido APENAS em NODE_ENV=test, para testes automatizados isolados.
 */
function dbSettings() {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  const token = process.env.TURSO_AUTH_TOKEN?.trim();
  if (!url) throw new Error('TURSO_DATABASE_URL não definida. Crie um banco Turso de desenvolvimento e configure o .env (consulte TURSO_DESENVOLVIMENTO.md).');
  if (process.env.NODE_ENV === 'test' && url.startsWith('file:')) return {url};
  if (!url.startsWith('libsql://') && !url.startsWith('https://')) {
    throw new Error('Banco inválido: use TURSO_DATABASE_URL=libsql://... do Turso. SQLite local só é permitido em testes automatizados.');
  }
  if (!token) throw new Error('TURSO_AUTH_TOKEN não definido. Gere um token do banco Turso e configure o .env.');
  return {url, authToken:token};
}
export function getClient(){
  if (!client) { const settings=dbSettings(); client=(process.env.NODE_ENV==='test' && settings.url.startsWith('file:'))?testClient(settings.url):createClient(settings); }
  return client;
}
export async function getDb(){
  if(!database) { const {drizzle}=await import('drizzle-orm/libsql'); database=drizzle(getClient(),{schema}); }
  return database;
}
export async function testTursoConnection(){
  const result=await getClient().execute('SELECT 1 AS ok, sqlite_version() AS sqliteVersion');
  return {ok:Number(result.rows[0]?.ok)===1,sqliteVersion:String(result.rows[0]?.sqliteVersion||'')};
}
export async function closeTursoClient(){
  if(client){client.close();client=undefined;database=undefined;}
}
export async function query(sql,args=[]){return (await getClient().execute({sql,args})).rows;}
export async function one(sql,args=[]){return (await query(sql,args))[0]||null;}
export async function execute(sql,args=[]){const result=await getClient().execute({sql,args});if(/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b/i.test(sql))invalidateReadCache();return result;}
export async function transaction(callback){
  const tx=await getClient().transaction('write');
  try{const result=await callback(tx);await tx.commit();invalidateReadCache();return result;}
  catch(err){await tx.rollback().catch(()=>{});throw err;}
}
