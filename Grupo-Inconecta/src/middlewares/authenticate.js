import { readSession } from '../auth/session.js';
import { one } from '../db/client.js';
import { AppError } from '../lib/errors.js';
export async function authenticate(req,res,next){
 try{
  const token=readSession(req);if(!token?.sub)throw new AppError('Faça login.',401);
  const u=await one(`SELECT u.id,u.nome,u.email,u.perfil,u.ativo,u.troca_senha_obrigatoria,u.versao_autenticacao,
   m.id AS membro_id,m.status AS status_membro,m.telefone,m.data_nascimento,m.proximo_vencimento FROM usuarios u LEFT JOIN membros m ON m.usuario_id=u.id WHERE u.id=?`,[token.sub]);
  if(!u || !u.ativo || Number(u.versao_autenticacao)!==Number(token.v) || (u.perfil==='MEMBRO' && (!u.membro_id || u.status_membro==='INATIVO')))
    throw new AppError('Sessão revogada ou conta inativa.',401);
  req.user=u;next();
 }catch(e){next(e);}
}
