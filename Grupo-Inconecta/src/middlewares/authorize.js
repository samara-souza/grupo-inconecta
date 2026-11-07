import { AppError } from '../lib/errors.js';
import { syncMemberStatus } from '../services/cobrancaService.js';
export function adminOnly(req,res,next){if(req.user?.perfil!=='ADMIN')return next(new AppError('Acesso exclusivo da administração.',403));next();}
export function passwordChanged(req,res,next){if(req.user?.troca_senha_obrigatoria)return next(new AppError('Altere sua senha temporária antes de continuar.',403,'PASSWORD_CHANGE_REQUIRED'));next();}
export async function memberActive(req,res,next){try{
 if(req.user?.perfil!=='MEMBRO')throw new AppError('Acesso exclusivo de membros.',403);
 const status=await syncMemberStatus(req.user.membro_id);
 if(status!=='ATIVO')throw new AppError('Acesso ao diretório limitado até regularização.',403,'MEMBER_NOT_ACTIVE');
 next();
 }catch(e){next(e);}}
