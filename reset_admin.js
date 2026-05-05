require("dotenv").config();

const { Pool } = require("pg");
const bcrypt = require("bcrypt");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

async function resetAdmin() {
  const usuario = process.env.ADMIN_USER || "admin";
  const nome = process.env.ADMIN_NAME || "Administrador";
  const senha = process.env.ADMIN_PASSWORD || "1234";
  const senhaHash = await bcrypt.hash(senha, 10);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(150) NOT NULL,
      usuario VARCHAR(80) NOT NULL UNIQUE,
      senha_hash VARCHAR(255) NOT NULL,
      perfil VARCHAR(20) NOT NULL DEFAULT 'TECNICO' CHECK (perfil IN ('TECNICO', 'ADMIN')),
      ativo BOOLEAN DEFAULT true,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo)
    VALUES ($1, $2, $3, 'ADMIN', true)
    ON CONFLICT (usuario) DO UPDATE SET
      nome = EXCLUDED.nome,
      senha_hash = EXCLUDED.senha_hash,
      perfil = EXCLUDED.perfil,
      ativo = EXCLUDED.ativo
  `, [nome, usuario, senhaHash]);

  console.log("Admin resetado com sucesso.");
  console.log(`Usuário: ${usuario}`);
  console.log(`Senha: ${senha}`);
}

resetAdmin()
  .catch((err) => {
    console.error("Erro ao resetar admin:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
