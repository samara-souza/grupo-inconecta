import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, uniqueIndex, index, check } from 'drizzle-orm/sqlite-core';

export const usuarios = sqliteTable('usuarios', {
  id: text('id').primaryKey(), nome: text('nome').notNull(), email: text('email').notNull(),
  senhaHash: text('senha_hash').notNull(), perfil: text('perfil').notNull(),
  ativo: integer('ativo',{ mode:'boolean' }).notNull().default(true),
  trocaSenhaObrigatoria: integer('troca_senha_obrigatoria',{ mode:'boolean' }).notNull().default(true),
  versaoAutenticacao: integer('versao_autenticacao').notNull().default(0),
  criadoEm: text('criado_em').notNull().default(sql`CURRENT_TIMESTAMP`)
}, t => [uniqueIndex('usuarios_email_uq').on(t.email), check('usuarios_perfil_ck',sql`${t.perfil} IN ('ADMIN','MEMBRO')`)]);
export const membros = sqliteTable('membros', {
  id: text('id').primaryKey(),usuarioId: text('usuario_id').notNull().unique().references(()=>usuarios.id),
  telefone:text('telefone').notNull(),dataNascimento:text('data_nascimento'),status:text('status').notNull().default('AGUARDANDO_ADESAO'),
  proximoVencimento:text('proximo_vencimento'),adesaoConfirmadaEm:text('adesao_confirmada_em'),
  desativadoEm:text('desativado_em'),motivoDesativacao:text('motivo_desativacao'),
  criadoEm:text('criado_em').notNull().default(sql`CURRENT_TIMESTAMP`)
});
export const empresas = sqliteTable('empresas', {
  id:text('id').primaryKey(),membroId:text('membro_id').notNull().unique().references(()=>membros.id),
  nome:text('nome').notNull(),ramo:text('ramo').notNull().default(''),descricao:text('descricao').notNull().default(''),
  telefone:text('telefone').notNull().default(''),instagram:text('instagram').notNull().default(''),site:text('site').notNull().default('')
});
export const configuracoesFinanceiras = sqliteTable('configuracoes_financeiras', {
  id:integer('id').primaryKey(),mensalidadeCentavos:integer('mensalidade_centavos').notNull().default(10000),
  adesaoCentavos:integer('adesao_centavos').notNull().default(15000),diaVencimento:integer('dia_vencimento').notNull().default(10),
  toleranciaDias:integer('tolerancia_dias').notNull().default(5),nomeRecebedor:text('nome_recebedor').notNull().default(''),
  linkMensalidade:text('link_mensalidade').notNull().default(''),linkAdesao:text('link_adesao').notNull().default(''),
  pixMensalidade:text('pix_mensalidade').notNull().default(''),pixAdesao:text('pix_adesao').notNull().default(''),
  atualizadoEm:text('atualizado_em').notNull().default(sql`CURRENT_TIMESTAMP`),
  configurado:integer('configurado',{mode:'boolean'}).notNull().default(false)
});
export const cobrancas = sqliteTable('cobrancas', {
  id:text('id').primaryKey(),membroId:text('membro_id').notNull().references(()=>membros.id),
  tipo:text('tipo').notNull(),competencia:text('competencia').notNull(),
  valorCentavos:integer('valor_centavos').notNull(),vencimento:text('vencimento').notNull(),
  linkPagamento:text('link_pagamento').notNull().default(''),pixCopiaCola:text('pix_copia_cola').notNull().default(''),status:text('status').notNull().default('PENDENTE'),
  informadoEm:text('informado_em'),confirmadoEm:text('confirmado_em'),recebidoEm:text('recebido_em'),
  confirmadoPor:text('confirmado_por').references(()=>usuarios.id),
  criadoEm:text('criado_em').notNull().default(sql`CURRENT_TIMESTAMP`)
},t=>[index('cobrancas_status_vencimento_idx').on(t.status,t.vencimento),index('cobrancas_membro_status_idx').on(t.membroId,t.status)]);
export const despesas = sqliteTable('despesas', {
  id:text('id').primaryKey(),descricao:text('descricao').notNull(),categoria:text('categoria').notNull(),
  valorCentavos:integer('valor_centavos').notNull(),data:text('data').notNull(),
  status:text('status').notNull(),criadoPor:text('criado_por').notNull().references(()=>usuarios.id),
  criadoEm:text('criado_em').notNull().default(sql`CURRENT_TIMESTAMP`)
});
export const notificacoes = sqliteTable('notificacoes', {
  id:text('id').primaryKey(),membroId:text('membro_id').notNull().references(()=>membros.id),
  tipo:text('tipo').notNull(),mensagem:text('mensagem').notNull(),
  criadaEm:text('criada_em').notNull().default(sql`CURRENT_TIMESTAMP`),lidaEm:text('lida_em')
});
export const auditoria = sqliteTable('auditoria', {
  id:text('id').primaryKey(),usuarioId:text('usuario_id').references(()=>usuarios.id),
  acao:text('acao').notNull(),entidade:text('entidade').notNull(),entidadeId:text('entidade_id'),
  detalhesJson:text('detalhes_json'),criadoEm:text('criado_em').notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const ramosAtividade = sqliteTable('ramos_atividade', {
 id:text('id').primaryKey(),nome:text('nome').notNull().unique(),
 ativo:integer('ativo',{mode:'boolean'}).notNull().default(true),
 criadoEm:text('criado_em').notNull().default(sql`CURRENT_TIMESTAMP`)
});
export const categoriasDespesa = sqliteTable('categorias_despesa', {
 id:text('id').primaryKey(),nome:text('nome').notNull().unique(),
 ativo:integer('ativo',{mode:'boolean'}).notNull().default(true),
 criadoEm:text('criado_em').notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const conexoesConvertidas=sqliteTable('conexoes_convertidas',{
  id:text('id').primaryKey(),
  empresaMembroId:text('empresa_membro_id').notNull().references(()=>membros.id),
  visitanteMembroId:text('visitante_membro_id').notNull().references(()=>membros.id),
  dataFechamento:text('data_fechamento').notNull(),
  observacao:text('observacao').notNull().default(''),
  valorCentavos:integer('valor_centavos'),
  criadoEm:text('criado_em').notNull().default(sql`CURRENT_TIMESTAMP`)
},t=>[index('conexoes_empresa_data_idx').on(t.empresaMembroId,t.dataFechamento),index('conexoes_data_empresa_idx').on(t.dataFechamento,t.empresaMembroId),index('conexoes_visitante_data_idx').on(t.visitanteMembroId,t.dataFechamento),index('conexoes_empresa_visitante_data_idx').on(t.empresaMembroId,t.visitanteMembroId,t.dataFechamento)]);
