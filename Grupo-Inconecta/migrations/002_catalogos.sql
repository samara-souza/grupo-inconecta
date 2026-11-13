-- Catálogos administráveis e independentes dos pagamentos que preservam o banco v0.3.
CREATE TABLE IF NOT EXISTS ramos_atividade (
  id TEXT PRIMARY KEY NOT NULL,
  nome TEXT NOT NULL COLLATE NOCASE UNIQUE,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1)),
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS categorias_despesa (
  id TEXT PRIMARY KEY NOT NULL,
  nome TEXT NOT NULL COLLATE NOCASE UNIQUE,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1)),
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO ramos_atividade (id,nome) VALUES
 ('ramo-administracao','Administração'),('ramo-advocacia','Advocacia'),
 ('ramo-arquitetura','Arquitetura'),('ramo-comercio','Comércio'),
 ('ramo-construcao','Construção Civil'),('ramo-contabilidade','Contabilidade'),
 ('ramo-consultoria','Consultoria'),('ramo-design','Design'),
 ('ramo-educacao','Educação'),('ramo-engenharia','Engenharia'),
 ('ramo-eventos','Eventos'),('ramo-industria','Indústria'),
 ('ramo-marketing','Marketing'),('ramo-saude','Saúde'),
 ('ramo-servicos','Serviços'),('ramo-tecnologia','Tecnologia'),
 ('ramo-turismo','Turismo');
INSERT OR IGNORE INTO categorias_despesa (id,nome) VALUES
 ('cat-administracao','Administração'),('cat-alimentacao','Alimentação'),
 ('cat-eventos','Eventos'),('cat-infraestrutura','Infraestrutura'),
 ('cat-marketing','Marketing'),('cat-servicos','Serviços'),
 ('cat-tecnologia','Tecnologia'),('cat-outros','Outros');
-- Migração de cadastros já realizados na versão 0.3: preservar opções usadas.
INSERT OR IGNORE INTO ramos_atividade (id,nome)
 SELECT 'legado-ramo-' || lower(hex(randomblob(12))),trim(ramo)
 FROM empresas WHERE trim(ramo)<>'' GROUP BY trim(ramo);
INSERT OR IGNORE INTO categorias_despesa (id,nome)
 SELECT 'legado-cat-' || lower(hex(randomblob(12))),trim(categoria)
 FROM despesas WHERE trim(categoria)<>'' GROUP BY trim(categoria);
