// Sincronização em lote: mantém o significado das regras de cobrança e suspensão
// sem disparar 3-5 consultas remotas por membro em cada abertura de página.
const ABERTAS = "('PENDENTE','AGUARDANDO_CONFIRMACAO')";

export const SYNC_CANDIDATE_SQL = `
 SELECT m.id FROM membros m WHERE m.status='ATIVO' AND (
  (m.proximo_vencimento IS NOT NULL AND substr(m.proximo_vencimento,1,7)<=?
   AND NOT EXISTS (SELECT 1 FROM cobrancas c WHERE c.membro_id=m.id AND c.status IN ${ABERTAS}))
  OR EXISTS (SELECT 1 FROM cobrancas c WHERE c.membro_id=m.id
   AND c.status IN ${ABERTAS} AND c.vencimento<?
   AND (c.status='PENDENTE' OR c.informado_em IS NULL OR substr(c.informado_em,1,10)>?))
 ) LIMIT 1`;

export const SYNC_INSERT_SQL = `
 INSERT OR IGNORE INTO cobrancas
  (id,membro_id,tipo,competencia,valor_centavos,vencimento,link_pagamento)
 SELECT lower(hex(randomblob(16))),m.id,'MENSALIDADE',substr(m.proximo_vencimento,1,7),
  cfg.mensalidade_centavos,m.proximo_vencimento,cfg.link_mensalidade
 FROM membros m CROSS JOIN configuracoes_financeiras cfg
 WHERE cfg.id=1 AND m.status='ATIVO' AND m.proximo_vencimento IS NOT NULL
  AND substr(m.proximo_vencimento,1,7)<=?
  AND NOT EXISTS (SELECT 1 FROM cobrancas c WHERE c.membro_id=m.id AND c.status IN ${ABERTAS})`;

export const SYNC_SUSPEND_SQL = `
 UPDATE membros SET status='SUSPENSO'
 WHERE status='ATIVO' AND EXISTS (
  SELECT 1 FROM cobrancas c WHERE c.membro_id=membros.id
   AND c.status IN ${ABERTAS} AND c.vencimento<?
   AND (c.status='PENDENTE' OR c.informado_em IS NULL OR substr(c.informado_em,1,10)>?)
 ) RETURNING id`;
