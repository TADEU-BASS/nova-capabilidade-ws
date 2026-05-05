require("dotenv").config();
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");

async function resetAdmin() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "capabilidade_ws",
    port: process.env.DB_PORT || 3306
  });

  const senhaHash = await bcrypt.hash("1234", 10);

  await db.execute(`
    INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      nome = VALUES(nome),
      senha_hash = VALUES(senha_hash),
      perfil = VALUES(perfil),
      ativo = VALUES(ativo)
  `, ["Administrador", "admin", senhaHash, "ADMIN", 1]);

  console.log("Admin resetado com sucesso.");
  console.log("Usuário: admin");
  console.log("Senha: 1234");

  await db.end();
}

resetAdmin().catch((err) => {
  console.error("Erro ao resetar admin:", err.message);
});