import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { one,execute,transaction } from '../db/client.js';
import { AppError,fail } from '../lib/errors.js';
import { email,str,phoneBR,birthdayDate } from '../lib/validation.js';
import { issueSession,clearSession } from './session.js';
import { validatePassword,temporaryPassword } from './passwordPolicy.js';
import { audit } from '../lib/audit.js';
const attempts=new Map();
function throttle(key){const now=Date.now();const r=attempts.get(key);if(r && r.until>now && r.count>=5)throw new AppError('Muitas tentativas. Tente novamente em 15 minutos.',429);if(!r || r.until<=now)attempts.set(key,{count:0,until:now+900000});}
export async function login(req,res){
 const mail=email(req.body?.email);const pass=str(req.body?.senha,'Senha',{min:1,max:128});const key=`${req.ip}:${mail}`;throttle(key);
 const user=await one('SELECT * FROM usuarios WHERE email=?',[mail]);
 const ok=await bcrypt.compare(pass,user?.senha_hash || '$2b$12$000000000000000000000u6R5kBu3rlAVSOG5L6FYoT5LTwk2YHe');
 if(!ok || !user?.ativo){const r=attempts.get(key);r.count++;throw new AppError('Credenciais inválidas.',401);}
 if(user.perfil==='MEMBRO'){
  const member=await one('SELECT status FROM membros WHERE usuario_id=?',[user.id]);
  if(!member || member.status==='INATIVO')throw new AppError('Conta desativada. Contate a administração.',403);
 }
 attempts.delete(key);issueSession(res,user);
 res.json({user:await publicUser(user.id)});
}
export async function publicUser(id){return one(`SELECT u.id,u.nome,u.email,u.perfil,u.troca_senha_obrigatoria, m.id AS membro_id,m.status AS status_membro,m.telefone,m.data_nascimento FROM usuarios u LEFT JOIN membros m ON m.usuario_id=u.id WHERE u.id=?`,[id]);}
export async function updatePassword(req,res){
 const atual=str(req.body?.senhaAtual,'Senha atual',{min:1,max:128});const nova=validatePassword(req.body?.novaSenha);
 const user=await one('SELECT * FROM usuarios WHERE id=?',[req.user.id]);
 fail(await bcrypt.compare(atual,user.senha_hash),'Senha atual incorreta.',403);
 fail(nova!==atual,'A nova senha deve ser diferente da senha atual.');
 await execute(`UPDATE usuarios SET senha_hash=?,troca_senha_obrigatoria=0,versao_autenticacao=versao_autenticacao+1 WHERE id=?`,[await bcrypt.hash(nova,12),user.id]);
 const updated=await one('SELECT * FROM usuarios WHERE id=?',[user.id]);issueSession(res,updated);res.json({message:'Senha alterada.',user:await publicUser(updated.id)});
}
export async function bootstrapAdmin({nome,email:mail,senha}){
 nome=str(nome,'Nome',{min:2,max:150});mail=email(mail);senha=validatePassword(senha);
 const existing=await one("SELECT COUNT(*) AS total FROM usuarios WHERE perfil='ADMIN'");fail(Number(existing.total)===0,'Já existe um administrador. Não é permitido executar o bootstrap novamente.',409);
 const id=randomUUID();await execute('INSERT INTO usuarios (id,nome,email,senha_hash,perfil,troca_senha_obrigatoria) VALUES (?,?,?,?,?,0)',[id,nome,mail,await bcrypt.hash(senha,12),'ADMIN']);return id;
}
export async function registerMember(actor,body){
 const nome=str(body.nome,'Nome',{min:2,max:150}),mail=email(body.email),telefone=phoneBR(body.telefone,'Telefone',{required:true});
 const empresa=str(body.empresa??'','Empresa',{max:180}),ramo=str(body.ramo??'','Ramo de atividade',{max:120}),dataNascimento=birthdayDate(body.dataNascimento);
 if(ramo)fail(await one('SELECT id FROM ramos_atividade WHERE nome=? COLLATE NOCASE AND ativo=1',[ramo]),'Selecione um ramo de atividade cadastrado.');
 const password=temporaryPassword(),hash=await bcrypt.hash(password,12);const uid=randomUUID(),mid=randomUUID(),eid=randomUUID(),cid=randomUUID();
 await transaction(async tx=>{
  await tx.execute({sql:'INSERT INTO usuarios (id,nome,email,senha_hash,perfil) VALUES (?,?,?,?,?)',args:[uid,nome,mail,hash,'MEMBRO']});
  await tx.execute({sql:'INSERT INTO membros (id,usuario_id,telefone,data_nascimento) VALUES (?,?,?,?)',args:[mid,uid,telefone,dataNascimento]});
  await tx.execute({sql:'INSERT INTO empresas (id,membro_id,nome,ramo) VALUES (?,?,?,?)',args:[eid,mid,empresa,ramo]});
  const c=(await tx.execute('SELECT * FROM configuracoes_financeiras WHERE id=1')).rows[0];
  fail(c && Number(c.configurado)===1 && c.pix_adesao && c.pix_mensalidade && c.nome_recebedor,'Configure valores, recebedor e os dois códigos Pix em Configurações antes de cadastrar membros.',409);
  const {todayBR}=await import('../lib/dates.js');
  await tx.execute({sql:`INSERT INTO cobrancas (id,membro_id,tipo,competencia,valor_centavos,vencimento,pix_copia_cola) VALUES (?,?,?,?,?,?,?)`,args:[cid,mid,'ADESAO',todayBR().slice(0,7),c.adesao_centavos,todayBR(),c.pix_adesao]});
  await audit(tx,actor,'MEMBRO_CRIADO','membros',mid,{usuarioId:uid});
 });
 return {id:mid,usuarioId:uid,nome,email:mail,senhaTemporaria:password};
}
export async function resetMemberPassword(actor,memberId){
 const user=await one(`SELECT u.id FROM membros m JOIN usuarios u ON u.id=m.usuario_id WHERE m.id=?`,[memberId]);fail(user,'Membro não encontrado.',404);
 const password=temporaryPassword();await transaction(async tx=>{
  await tx.execute({sql:'UPDATE usuarios SET senha_hash=?,troca_senha_obrigatoria=1,versao_autenticacao=versao_autenticacao+1 WHERE id=?',args:[await bcrypt.hash(password,12),user.id]});
  await audit(tx,actor,'SENHA_REDEFINIDA','membros',memberId);
 });return {senhaTemporaria:password};
}
export async function signOut(req,res){clearSession(res);res.json({message:'Sessão encerrada.'});}
