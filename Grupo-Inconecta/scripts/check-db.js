import 'dotenv/config';
import { getClient, testTursoConnection, closeTursoClient } from '../src/db/client.js';

const required=['usuarios','membros','empresas','configuracoes_financeiras','cobrancas','despesas','notificacoes','auditoria','ramos_atividade','categorias_despesa','_migrations'];
try{
 const conn=await testTursoConnection();
 if(!conn.ok)throw new Error('Turso não respondeu corretamente.');
 console.log('Conexão Turso/libSQL OK. SQLite versão:',conn.sqliteVersion);
 const db=getClient();
 const tables=await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
 const names=new Set(tables.rows.map(r=>r.name));
 const missing=required.filter(t=>!names.has(t));
 if(missing.length) throw new Error('Tabelas ausentes: '+missing.join(', ')+'. Execute npm run db:migrate.');
 const quick=await db.execute('PRAGMA quick_check');
 if(quick.rows[0]?.integrity_check && quick.rows[0].integrity_check!=='ok')throw new Error('Banco com falha de integridade.');
 if(quick.rows[0]?.quick_check && quick.rows[0].quick_check!=='ok')throw new Error('Banco com falha de integridade.');
 const fk=await db.execute('PRAGMA foreign_key_check');
 if(fk.rows.length)throw new Error('Inconsistências de chaves estrangeiras: '+fk.rows.length);
 console.log('Schema completo e integridade OK.');
}catch(err){console.error('Falha na verificação do banco:',err.message);process.exitCode=1;}
finally{await closeTursoClient();}
