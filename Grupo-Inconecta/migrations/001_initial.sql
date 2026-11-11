PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY NOT NULL,
  nome TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  senha_hash TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK(perfil IN ('ADMIN','MEMBRO')),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1)),
  troca_senha_obrigatoria INTEGER NOT NULL DEFAULT 1 CHECK(troca_senha_obrigatoria IN (0,1)),
  versao_autenticacao INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS membros (
  id TEXT PRIMARY KEY NOT NULL,
  usuario_id TEXT NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE RESTRICT,
  telefone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AGUARDANDO_ADESAO' CHECK(status IN ('AGUARDANDO_ADESAO','ATIVO','SUSPENSO','AGUARDANDO_REATIVACAO','INATIVO')),
  proximo_vencimento TEXT,
  adesao_confirmada_em TEXT,
  desativado_em TEXT,
  motivo_desativacao TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS empresas (
  id TEXT PRIMARY KEY NOT NULL,
  membro_id TEXT NOT NULL UNIQUE REFERENCES membros(id) ON DELETE RESTRICT,
  nome TEXT NOT NULL,
  ramo TEXT NOT NULL DEFAULT '',
  descricao TEXT NOT NULL DEFAULT '',
  telefone TEXT NOT NULL DEFAULT '',
  instagram TEXT NOT NULL DEFAULT '',
  site TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS configuracoes_financeiras (
  id INTEGER PRIMARY KEY CHECK(id=1),
  mensalidade_centavos INTEGER NOT NULL DEFAULT 10000 CHECK(mensalidade_centavos>0),
  adesao_centavos INTEGER NOT NULL DEFAULT 15000 CHECK(adesao_centavos>0),
  dia_vencimento INTEGER NOT NULL DEFAULT 10 CHECK(dia_vencimento BETWEEN 1 AND 28),
  tolerancia_dias INTEGER NOT NULL DEFAULT 5 CHECK(tolerancia_dias BETWEEN 0 AND 90),
  nome_recebedor TEXT NOT NULL DEFAULT '',
  link_mensalidade TEXT NOT NULL DEFAULT '',
  link_adesao TEXT NOT NULL DEFAULT '',
  atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  configurado INTEGER NOT NULL DEFAULT 0 CHECK(configurado IN (0,1))
);
INSERT OR IGNORE INTO configuracoes_financeiras (id) VALUES (1);
CREATE TABLE IF NOT EXISTS cobrancas (
  id TEXT PRIMARY KEY NOT NULL,
  membro_id TEXT NOT NULL REFERENCES membros(id) ON DELETE RESTRICT,
  tipo TEXT NOT NULL CHECK(tipo IN ('ADESAO','MENSALIDADE','REATIVACAO_ADESAO','REATIVACAO_MENSALIDADE')),
  competencia TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0),
  vencimento TEXT NOT NULL,
  link_pagamento TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK(status IN ('PENDENTE','AGUARDANDO_CONFIRMACAO','PAGO','CANCELADA')),
  informado_em TEXT,
  confirmado_em TEXT,
  recebido_em TEXT,
  confirmado_por TEXT REFERENCES usuarios(id) ON DELETE RESTRICT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS cobrancas_membro_competencia_tipo_uq ON cobrancas(membro_id, competencia, tipo) WHERE tipo='MENSALIDADE';
CREATE INDEX IF NOT EXISTS cobrancas_status_vencimento_idx ON cobrancas(status,vencimento);
CREATE INDEX IF NOT EXISTS cobrancas_membro_status_idx ON cobrancas(membro_id,status);
CREATE INDEX IF NOT EXISTS cobrancas_confirmado_em_idx ON cobrancas(confirmado_em);
CREATE TABLE IF NOT EXISTS despesas (
  id TEXT PRIMARY KEY NOT NULL,
  descricao TEXT NOT NULL,
  categoria TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0),
  data TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PREVISTA','PAGA')),
  criado_por TEXT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS despesas_data_status_idx ON despesas(data,status);
CREATE TABLE IF NOT EXISTS notificacoes (
  id TEXT PRIMARY KEY NOT NULL,
  membro_id TEXT NOT NULL REFERENCES membros(id) ON DELETE RESTRICT,
  tipo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  criada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lida_em TEXT
);
CREATE INDEX IF NOT EXISTS notificacoes_membro_lida_idx ON notificacoes(membro_id,lida_em);
CREATE TABLE IF NOT EXISTS auditoria (
  id TEXT PRIMARY KEY NOT NULL,
  usuario_id TEXT REFERENCES usuarios(id) ON DELETE RESTRICT,
  acao TEXT NOT NULL,
  entidade TEXT NOT NULL,
  entidade_id TEXT,
  detalhes_json TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS auditoria_criado_em_idx ON auditoria(criado_em);
