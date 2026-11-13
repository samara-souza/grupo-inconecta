import 'dotenv/config';
import { bootstrapAdmin } from '../src/auth/authService.js';
import { closeTursoClient, testTursoConnection } from '../src/db/client.js';
try{
 await testTursoConnection();
 const id=await bootstrapAdmin({nome:process.env.ADMIN_NOME,email:process.env.ADMIN_EMAIL,senha:process.env.ADMIN_PASSWORD});
 console.log('Administrador inicial criado com ID:',id);
}catch(err){console.error('Não foi possível criar administrador:',err.message);process.exitCode=1;}
finally{await closeTursoClient();}
