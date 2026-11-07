import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { getClient, closeTursoClient, testTursoConnection } from '../src/db/client.js';

// Nenhum migration é aplicado sem conexão válida ao Turso configurado.
const migrationsDir=fileURLToPath(new URL('../migrations/',import.meta.url));
try {
 await testTursoConnection();
 const db=getClient();
 await db.execute('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
 const files=(await readdir(migrationsDir)).filter(n=>/^\d+[_-].+\.sql$/.test(n)).sort();
 for(const file of files){
  const found=await db.execute({sql:'SELECT name FROM _migrations WHERE name=?',args:[file]});
  if(found.rows.length){console.log('Já aplicada:',file);continue;}
  const source=await readFile(join(migrationsDir,file),'utf8');
  // Migrador do projeto: cada arquivo contém apenas SQL simples separado por ponto-e-vírgula.
  const statements=source.split(';').map(s=>s.trim()).filter(Boolean);
  const tx=await db.transaction('write');
  try{
   for(const statement of statements)await tx.execute(statement);
   await tx.execute({sql:'INSERT INTO _migrations (name) VALUES (?)',args:[file]});
   await tx.commit();console.log('Aplicada:',file);
  }catch(e){await tx.rollback().catch(()=>{});throw new Error(`Erro em ${file}: ${e.message}`,{cause:e});}
 }
 console.log('Migrations concluídas no Turso.');
}catch(err){console.error('Erro ao migrar banco Turso:',err.message);process.exitCode=1;}
finally{await closeTursoClient();}
