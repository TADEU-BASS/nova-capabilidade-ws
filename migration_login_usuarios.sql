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

ALTER TABLE ensaios ADD COLUMN usuario_id INT NULL AFTER id;
CREATE INDEX idx_ensaios_usuario_id ON ensaios (usuario_id);
