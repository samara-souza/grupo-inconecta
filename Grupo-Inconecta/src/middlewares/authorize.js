import { AppError } from '../lib/errors.js';
import { syncMemberStatus, getSettings } from '../services/cobrancaService.js';
import { todayBR, plusDays } from '../lib/dates.js';
export function adminOnly(req,res,next){if(req.user?.perfil!=='ADMIN')return next(new AppError('Acesso exclusivo da administração.',403));next();}
export function passwordChanged(req,res,next){if(req.user?.troca_senha_obrigatoria)return next(new AppError('Altere sua senha temporária antes de continuar.',403,'PASSWORD_CHANGE_REQUIRED'));next();}
export async function memberActive(req,res,next){try{
 if(req.user?.perfil!=='MEMBRO')throw new AppError('Acesso exclusivo de membros.',403);
 if(req.user.status_membro!=='ATIVO')throw new AppError('Acesso ao diretório limitado até regularização.',403,'MEMBER_NOT_ACTIVE');
 // Antes de vencer a tolerância, o SELECT de autenticação é suficiente.
 // Depois, verifica a pendência no banco para não deixar passar um pagamento atrasado.
 const due=req.user.proximo_vencimento;
 let status=req.user.status_membro;
 if(due){const cfg=await getSettings();const limit=plusDays(todayBR(),-Number(cfg.tolerancia_dias));
  if(due<limit)status=await syncMemberStatus(req.user.membro_id);}
 if(status!=='ATIVO')throw new AppError('Acesso ao diretório limitado até regularização.',403,'MEMBER_NOT_ACTIVE');
 next();
 }catch(e){next(e);}}
