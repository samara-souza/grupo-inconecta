-- v0.10: mudanças aditivas, sem apagar os dados das versões anteriores.
ALTER TABLE membros ADD COLUMN data_nascimento TEXT;
ALTER TABLE configuracoes_financeiras ADD COLUMN pix_mensalidade TEXT NOT NULL DEFAULT '';
ALTER TABLE configuracoes_financeiras ADD COLUMN pix_adesao TEXT NOT NULL DEFAULT '';
ALTER TABLE cobrancas ADD COLUMN pix_copia_cola TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS conexoes_convertidas (
 id TEXT PRIMARY KEY NOT NULL,
 empresa_membro_id TEXT NOT NULL REFERENCES membros(id) ON DELETE RESTRICT,
 visitante_membro_id TEXT NOT NULL REFERENCES membros(id) ON DELETE RESTRICT,
 data_fechamento TEXT NOT NULL,
 observacao TEXT NOT NULL DEFAULT '',
 criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (empresa_membro_id <> visitante_membro_id)
);
CREATE INDEX IF NOT EXISTS conexoes_empresa_data_idx ON conexoes_convertidas(empresa_membro_id,data_fechamento);
CREATE INDEX IF NOT EXISTS conexoes_data_empresa_idx ON conexoes_convertidas(data_fechamento,empresa_membro_id);
CREATE INDEX IF NOT EXISTS conexoes_empresa_visitante_data_idx ON conexoes_convertidas(empresa_membro_id,visitante_membro_id,data_fechamento);
CREATE INDEX IF NOT EXISTS membros_aniversario_mes_idx ON membros(substr(data_nascimento,6,2));
