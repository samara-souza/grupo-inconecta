-- v0.9: indices aditivos, sem remover ou alterar dados existentes.
-- Vencimentos calculados por lote e checagens do diretório.
CREATE INDEX IF NOT EXISTS membros_ativo_proximo_vencimento_idx
 ON membros(proximo_vencimento) WHERE status='ATIVO';
CREATE INDEX IF NOT EXISTS cobrancas_abertas_membro_vencimento_idx
 ON cobrancas(membro_id,vencimento,status,informado_em)
 WHERE status IN ('PENDENTE','AGUARDANDO_CONFIRMACAO');
-- Filtragem mensal das receitas/despesas: os índices são sobre a mesma expressão
-- utilizada nos relatórios para permitir busca por competência de recebimento.
CREATE INDEX IF NOT EXISTS cobrancas_pagas_mes_tipo_idx
 ON cobrancas(substr(COALESCE(recebido_em,confirmado_em),1,7),tipo)
 WHERE status='PAGO';
CREATE INDEX IF NOT EXISTS despesas_pagas_mes_idx
 ON despesas(substr(data,1,7)) WHERE status='PAGA';
