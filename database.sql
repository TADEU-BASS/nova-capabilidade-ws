CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  usuario VARCHAR(80) NOT NULL UNIQUE,
  senha_hash VARCHAR(255) NOT NULL,
  perfil VARCHAR(20) NOT NULL DEFAULT 'TECNICO' CHECK (perfil IN ('TECNICO', 'ADMIN')),
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ensaios (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  numero_relatorio VARCHAR(120) NOT NULL UNIQUE,
  tecnico_responsavel VARCHAR(150) NOT NULL,
  data_ensaio DATE NOT NULL,
  cliente_projeto VARCHAR(150),
  serial_apertadeira VARCHAR(150),
  serial_crowfoot VARCHAR(150),
  tipo_ensaio VARCHAR(50),
  status_final VARCHAR(80),
  dados_json JSONB NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ensaios_usuario_id ON ensaios (usuario_id);
CREATE INDEX IF NOT EXISTS idx_ensaios_cliente_projeto ON ensaios (cliente_projeto);
CREATE INDEX IF NOT EXISTS idx_ensaios_data_ensaio ON ensaios (data_ensaio);
