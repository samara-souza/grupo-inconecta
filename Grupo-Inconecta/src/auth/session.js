import jwt from 'jsonwebtoken';
import { AppError,fail } from '../lib/errors.js';
const NAME='grupo_negocios_session';
function secret(){const s=process.env.JWT_SECRET;fail(typeof s==='string'&&s.length>=32,'JWT_SECRET ausente ou insuficiente.',500);return s;}
function opts(){return {httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:Number(process.env.SESSION_MAX_AGE_MS)||8*60*60*1000};}
export function issueSession(res,user){const maxAge=opts().maxAge;const token=jwt.sign({sub:user.id,v:Number(user.versao_autenticacao)},secret(),{issuer:'grupo-negocios',audience:'web',expiresIn:Math.floor(maxAge/1000)});res.cookie(NAME,token,opts());}
export function clearSession(res){res.clearCookie(NAME,{...opts(),maxAge:undefined});}
export function readSession(req){const part=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(NAME+'='));if(!part)return null;try{return jwt.verify(decodeURIComponent(part.slice(NAME.length+1)),secret(),{issuer:'grupo-negocios',audience:'web'});}catch{throw new AppError('Sessão inválida ou expirada.',401,'SESSION_INVALID');}}
