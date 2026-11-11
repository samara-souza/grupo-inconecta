import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import routes from './src/controllers/routes.js';
import { AppError } from './src/lib/errors.js';
import { getClient, testTursoConnection } from './src/db/client.js';

// No Render, a URL HTTPS pública é fornecida automaticamente pela plataforma.
// APP_ORIGIN continua disponível caso seja usado um domínio próprio.
function appOrigin(){
 return process.env.APP_ORIGIN?.trim() || (process.env.RENDER === 'true' ? process.env.RENDER_EXTERNAL_URL : undefined);
}

export function createApp(){
 const app=express();app.disable('x-powered-by');app.set('trust proxy',process.env.NODE_ENV==='production'?1:false);
 app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  if(process.env.NODE_ENV==='production')res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');next();
 });
 app.use(express.json({limit:'32kb'}));
 app.use('/api',(req,res,next)=>{
  if(['POST','PUT','PATCH','DELETE'].includes(req.method)){
   const origin=req.headers.origin,hostOrigin=appOrigin();
   if(origin && hostOrigin && origin!==hostOrigin) return next(new AppError('Origem da requisição não autorizada.',403,'CSRF_ORIGIN'));
   if(req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site']))return next(new AppError('Requisição externa não autorizada.',403,'CSRF_FETCH'));
   if(req.method!=='DELETE' && !req.is('application/json'))return next(new AppError('Envie JSON com Content-Type application/json.',415));
  }next();
 });
 // Liveness para o Render, sem executar consultas periódicas no plano gratuito do Turso.
 app.get('/healthz',(req,res)=>res.json({ok:true}));
 app.get('/api/health',async(req,res,next)=>{try{await getClient().execute('SELECT 1');res.json({ok:true});}catch(err){next(err);}});
 app.use('/api',(req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
 app.use('/api',routes);
 const publicRoot=path.join(path.dirname(fileURLToPath(import.meta.url)),'public');
 // ETag + cache curto: reduz downloads repetidos sem prender versões antigas da interface.
 // A página HTML sempre revalida e identifica a versão dos arquivos JS/CSS na URL.
 app.use(express.static(publicRoot,{index:'index.html',etag:true,lastModified:true,maxAge:'1h',setHeaders(res,filePath){
  if(filePath.endsWith('.html'))res.setHeader('Cache-Control','no-cache');
 }}));
 app.use('/api',(req,res)=>res.status(404).json({error:'Rota não encontrada.'}));
 app.use((err,req,res,next)=>{
  if(res.headersSent)return next(err);
  if(err instanceof AppError) return res.status(err.status).json({error:err.message,code:err.code});
  if(/UNIQUE constraint failed/i.test(err.message||''))return res.status(409).json({error:'Registro duplicado (e-mail ou cobrança já existente).'});
  if(/FOREIGN KEY constraint failed/i.test(err.message||''))return res.status(409).json({error:'Operação bloqueada por vínculo existente.'});
  console.error('Erro interno:',err);
  res.status(500).json({error:'Erro interno. Verifique os registros do servidor.'});
 });
 return app;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||3000);
 if(!process.env.JWT_SECRET || process.env.JWT_SECRET.length<32)throw new Error('Configure JWT_SECRET no .env (mínimo 32 caracteres).');
 if(process.env.NODE_ENV==='production' && (!appOrigin()?.startsWith('https://') || !process.env.TURSO_DATABASE_URL?.startsWith('libsql://')))throw new Error('Produção exige APP_ORIGIN HTTPS e banco Turso remoto.');
 try {
  await testTursoConnection();
  const check=await getClient().execute("SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'");
  if(!check.rows.length)throw new Error('Tabelas não encontradas no Turso. Execute npm run db:migrate.');
  createApp().listen(port,'0.0.0.0',()=>console.log(`Grupo Inconecta — ESTELA ouvindo na porta ${port}`));
 } catch(error) {console.error('Falha ao iniciar: ',error.message);process.exitCode=1;} 
}
