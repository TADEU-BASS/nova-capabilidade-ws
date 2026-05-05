CREATE DATABASE IF NOT EXISTS capabilidade_ws
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE capabilidade_ws;

CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  usuario VARCHAR(80) NOT NULL UNIQUE,
  senha_hash VARCHAR(255) NOT NULL,
  perfil ENUM('TECNICO', 'ADMIN') DEFAULT 'TECNICO',
  ativo TINYINT(1) DEFAULT 1,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ensaios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NULL,
  numero_relatorio VARCHAR(100) NOT NULL UNIQUE,
  tecnico_responsavel VARCHAR(150) NOT NULL,
  data_ensaio DATE NOT NULL,
  cliente_projeto VARCHAR(150),
  serial_apertadeira VARCHAR(100),
  serial_crowfoot VARCHAR(100),
  tipo_ensaio ENUM('QUATRO_TABELAS', 'TORQUE_UNICO') DEFAULT 'QUATRO_TABELAS',
  status_final VARCHAR(80),
  dados_json LONGTEXT NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ensaios_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX idx_ensaios_usuario_id ON ensaios (usuario_id);
CREATE INDEX idx_ensaios_numero_relatorio ON ensaios (numero_relatorio);
CREATE INDEX idx_ensaios_tecnico ON ensaios (tecnico_responsavel);
CREATE INDEX idx_ensaios_data ON ensaios (data_ensaio);
CREATE INDEX idx_ensaios_cliente_projeto ON ensaios (cliente_projeto);
CREATE INDEX idx_ensaios_serial_apertadeira ON ensaios (serial_apertadeira);
CREATE INDEX idx_ensaios_serial_crowfoot ON ensaios (serial_crowfoot);
