USE capabilidade_ws;

ALTER TABLE ensaios
  ADD COLUMN cliente_projeto VARCHAR(150) NULL AFTER data_ensaio;

CREATE INDEX idx_ensaios_cliente_projeto ON ensaios (cliente_projeto);
