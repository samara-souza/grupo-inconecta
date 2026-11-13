-- v0.11: registro financeiro opcional (NULL representa valor não informado).
-- Dados antigos preservados e nenhum valor é inferido ou preenchido artificialmente.
ALTER TABLE conexoes_convertidas ADD COLUMN valor_centavos INTEGER CHECK (valor_centavos IS NULL OR valor_centavos > 0);
-- Melhora o filtro administrativo quando o membro selecionado é o visitante.
CREATE INDEX IF NOT EXISTS conexoes_visitante_data_idx ON conexoes_convertidas(visitante_membro_id,data_fechamento);
