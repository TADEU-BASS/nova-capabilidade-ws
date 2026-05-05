require("dotenv").config();

const express = require("express");
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const session = require("express-session");

const app = express();
const PORT = Number(process.env.PORT || 3004);
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "capabilidade_ws",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
});

app.use(express.json({ limit: "25mb" }));
app.use(session({
  name: "capabilidade_ws_sid",
  secret: process.env.SESSION_SECRET || "capabilidade-ws-trocar-esta-chave",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    maxAge: 1000 * 60 * 60 * 10
  }
}));

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

function texto(valor) {
  return String(valor || "").trim();
}

function normalizarData(valor) {
  const data = texto(valor);
  return /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null;
}

function senhaAdminConfigurada() {
  return texto(process.env.APP_ADMIN_PASSWORD || process.env.SENHA_ADMIN_BANCO) || "1234";
}

function obterSenhaRequisicao(req) {
  return texto(
    req.headers["x-admin-password"] ||
    req.body?.senhaAdmin ||
    req.body?.senha_banco ||
    req.query?.senhaAdmin
  );
}

function validarSenhaAdmin(req) {
  return obterSenhaRequisicao(req) === senhaAdminConfigurada();
}

function usuarioSessao(req) {
  return req.session && req.session.usuario ? req.session.usuario : null;
}

function exigirLogin(req, res, next) {
  if (!usuarioSessao(req)) {
    return res.status(401).json({ erro: "Login obrigatório." });
  }
  next();
}

function exigirAdmin(req, res, next) {
  const usuario = usuarioSessao(req);
  if (!usuario) return res.status(401).json({ erro: "Login obrigatório." });
  if (usuario.perfil !== "ADMIN") return res.status(403).json({ erro: "Acesso permitido somente para administrador." });
  next();
}

function normalizarStatusFinal(valor) {
  const v = texto(valor).toUpperCase();
  const mapa = {
    "TEST RECORDED": "ENSAIO REGISTRADO",
    "ENSAYO REGISTRADO": "ENSAIO REGISTRADO",
    "APPROVED": "APROVADO",
    "APROBADO": "APROVADO",
    "REJECTED": "REPROVADO",
    "REPROBADO": "REPROVADO",
    "WAITING": "AGUARDANDO",
    "ESPERANDO": "AGUARDANDO",
    "SAVED": "SALVO",
    "GUARDADO": "SALVO"
  };
  return mapa[v] || texto(valor);
}

function extrairResumo(estado) {
  const campos = estado && estado.campos ? estado.campos : {};
  const tabelas = estado && estado.tabelas ? estado.tabelas : {};
  const resultadoTela = estado && estado.resultadoTela ? estado.resultadoTela : {};

  const numeroRelatorio = texto(campos.numeroRelatorio);
  const tecnicoResponsavel = texto(campos.tecnicoResponsavel);
  const dataEnsaio = normalizarData(campos.dataEnsaio);

  const temTorqueUnico = Array.isArray(tabelas.torqueUnico) && tabelas.torqueUnico.some(v => texto(v) !== "");
  const tipoEnsaio = temTorqueUnico ? "TORQUE_UNICO" : "QUATRO_TABELAS";

  let statusFinal = normalizarStatusFinal(resultadoTela.statusGeral);
  if ((!statusFinal || statusFinal === "AGUARDANDO") && temTorqueUnico) {
    statusFinal = normalizarStatusFinal(resultadoTela.statusTorqueUnico);
  }
  if (!statusFinal) statusFinal = "SALVO";

  return {
    numeroRelatorio,
    tecnicoResponsavel,
    dataEnsaio,
    clienteProjeto: texto(campos.clienteProjeto),
    serialApertadeira: texto(campos.serialApertadeira),
    serialCrowfoot: texto(campos.serialCrowfoot || campos.crowfoot),
    tipoEnsaio,
    statusFinal
  };
}

async function buscarUsuarioPorNome(usuario) {
  const [linhas] = await pool.execute(
    `SELECT id, nome, usuario, senha_hash, perfil, ativo
     FROM usuarios
     WHERE usuario = ?
     LIMIT 1`,
    [texto(usuario)]
  );
  return linhas[0] || null;
}

function respostaUsuario(usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    usuario: usuario.usuario,
    perfil: usuario.perfil,
    ativo: Number(usuario.ativo) === 1
  };
}

app.get("/api/status-db", async (_req, res) => {
  try {
    await pool.query("SELECT 1 AS ok");
    res.json({ ok: true, mensagem: "Conexão com MySQL OK" });
  } catch (erro) {
    res.status(500).json({ ok: false, erro: erro.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const usuario = texto(req.body?.usuario);
    const senha = texto(req.body?.senha);

    if (!usuario || !senha) {
      return res.status(400).json({ erro: "Informe usuário e senha." });
    }

    const registro = await buscarUsuarioPorNome(usuario);
    if (!registro || Number(registro.ativo) !== 1) {
      return res.status(401).json({ erro: "Usuário ou senha inválidos." });
    }

    const senhaOk = await bcrypt.compare(senha, registro.senha_hash);
    if (!senhaOk) {
      return res.status(401).json({ erro: "Usuário ou senha inválidos." });
    }

    req.session.usuario = respostaUsuario(registro);
    res.json({ ok: true, usuario: req.session.usuario });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.get("/api/me", (req, res) => {
  const usuario = usuarioSessao(req);
  if (!usuario) return res.status(401).json({ erro: "Não logado." });
  res.json({ usuario });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("capabilidade_ws_sid");
    res.json({ ok: true });
  });
});

app.get("/api/usuarios", exigirAdmin, async (_req, res) => {
  try {
    const [linhas] = await pool.execute(
      `SELECT id, nome, usuario, perfil, ativo, criado_em
       FROM usuarios
       ORDER BY nome ASC`
    );
    res.json(linhas);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.post("/api/usuarios", exigirAdmin, async (req, res) => {
  try {
    const nome = texto(req.body?.nome);
    const usuario = texto(req.body?.usuario);
    const senha = texto(req.body?.senha);
    const perfil = texto(req.body?.perfil).toUpperCase() === "ADMIN" ? "ADMIN" : "TECNICO";

    if (!nome || !usuario || !senha) {
      return res.status(400).json({ erro: "Nome, usuário e senha são obrigatórios." });
    }

    const senhaHash = await bcrypt.hash(senha, 10);
    const [resultado] = await pool.execute(
      `INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo)
       VALUES (?, ?, ?, ?, 1)`,
      [nome, usuario, senhaHash, perfil]
    );

    res.json({ ok: true, id: resultado.insertId, mensagem: "Usuário cadastrado." });
  } catch (erro) {
    if (erro && erro.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ erro: "Este nome de usuário já existe." });
    }
    res.status(500).json({ erro: erro.message });
  }
});

app.put("/api/usuarios/:id", exigirAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const nome = texto(req.body?.nome);
    const usuario = texto(req.body?.usuario);
    const senha = texto(req.body?.senha);
    const perfil = texto(req.body?.perfil).toUpperCase() === "ADMIN" ? "ADMIN" : "TECNICO";
    const ativo = Number(req.body?.ativo) === 0 ? 0 : 1;

    if (!id || !nome || !usuario) {
      return res.status(400).json({ erro: "Nome e usuário são obrigatórios." });
    }

    if (senha) {
      const senhaHash = await bcrypt.hash(senha, 10);
      await pool.execute(
        `UPDATE usuarios
         SET nome = ?, usuario = ?, senha_hash = ?, perfil = ?, ativo = ?
         WHERE id = ?`,
        [nome, usuario, senhaHash, perfil, ativo, id]
      );
    } else {
      await pool.execute(
        `UPDATE usuarios
         SET nome = ?, usuario = ?, perfil = ?, ativo = ?
         WHERE id = ?`,
        [nome, usuario, perfil, ativo, id]
      );
    }

    res.json({ ok: true, mensagem: "Usuário atualizado." });
  } catch (erro) {
    if (erro && erro.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ erro: "Este nome de usuário já existe." });
    }
    res.status(500).json({ erro: erro.message });
  }
});

app.post("/api/ensaios", exigirLogin, async (req, res) => {
  try {
    const usuarioLogado = usuarioSessao(req);
    const estado = req.body;
    const resumo = extrairResumo(estado);

    if (!resumo.numeroRelatorio) {
      return res.status(400).json({ erro: "Número do relatório é obrigatório." });
    }
    if (!resumo.tecnicoResponsavel) {
      return res.status(400).json({ erro: "Técnico responsável é obrigatório." });
    }
    if (!resumo.dataEnsaio) {
      return res.status(400).json({ erro: "Data do ensaio é obrigatória e deve estar no formato AAAA-MM-DD." });
    }

    const dadosJson = JSON.stringify(estado);

    const [existentes] = await pool.execute(
      "SELECT id, usuario_id FROM ensaios WHERE numero_relatorio = ? LIMIT 1",
      [resumo.numeroRelatorio]
    );

    if (existentes.length) {
      const ensaioExistente = existentes[0];
      if (usuarioLogado.perfil !== "ADMIN" && Number(ensaioExistente.usuario_id) !== Number(usuarioLogado.id)) {
        return res.status(403).json({ erro: "Você só pode alterar ensaios cadastrados pelo seu usuário." });
      }

      const usuarioDono = ensaioExistente.usuario_id || usuarioLogado.id;
      await pool.execute(
        `UPDATE ensaios
         SET usuario_id = ?, tecnico_responsavel = ?, data_ensaio = ?, cliente_projeto = ?,
             serial_apertadeira = ?, serial_crowfoot = ?, tipo_ensaio = ?, status_final = ?,
             dados_json = ?, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          usuarioDono,
          resumo.tecnicoResponsavel,
          resumo.dataEnsaio,
          resumo.clienteProjeto,
          resumo.serialApertadeira,
          resumo.serialCrowfoot,
          resumo.tipoEnsaio,
          resumo.statusFinal,
          dadosJson,
          ensaioExistente.id
        ]
      );

      return res.json({
        ok: true,
        id: ensaioExistente.id,
        numero_relatorio: resumo.numeroRelatorio,
        mensagem: "Ensaio atualizado no banco MySQL."
      });
    }

    const [resultado] = await pool.execute(
      `INSERT INTO ensaios
        (usuario_id, numero_relatorio, tecnico_responsavel, data_ensaio, cliente_projeto, serial_apertadeira, serial_crowfoot, tipo_ensaio, status_final, dados_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuarioLogado.id,
        resumo.numeroRelatorio,
        resumo.tecnicoResponsavel,
        resumo.dataEnsaio,
        resumo.clienteProjeto,
        resumo.serialApertadeira,
        resumo.serialCrowfoot,
        resumo.tipoEnsaio,
        resumo.statusFinal,
        dadosJson
      ]
    );

    res.json({
      ok: true,
      id: resultado.insertId || null,
      numero_relatorio: resumo.numeroRelatorio,
      mensagem: "Ensaio salvo no banco MySQL."
    });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.get("/api/ensaios", exigirLogin, async (req, res) => {
  try {
    const usuarioLogado = usuarioSessao(req);
    const filtros = [];
    const valores = [];

    if (usuarioLogado.perfil !== "ADMIN") {
      filtros.push("e.usuario_id = ?");
      valores.push(usuarioLogado.id);
    }

    if (texto(req.query.numeroRelatorio)) {
      filtros.push("e.numero_relatorio LIKE ?");
      valores.push(`%${texto(req.query.numeroRelatorio)}%`);
    }
    if (texto(req.query.tecnicoResponsavel)) {
      filtros.push("e.tecnico_responsavel LIKE ?");
      valores.push(`%${texto(req.query.tecnicoResponsavel)}%`);
    }
    if (texto(req.query.clienteProjeto)) {
      filtros.push("e.cliente_projeto LIKE ?");
      valores.push(`%${texto(req.query.clienteProjeto)}%`);
    }
    if (texto(req.query.serialApertadeira)) {
      filtros.push("e.serial_apertadeira LIKE ?");
      valores.push(`%${texto(req.query.serialApertadeira)}%`);
    }
    if (texto(req.query.serialCrowfoot)) {
      filtros.push("e.serial_crowfoot LIKE ?");
      valores.push(`%${texto(req.query.serialCrowfoot)}%`);
    }
    if (normalizarData(req.query.dataInicio)) {
      filtros.push("e.data_ensaio >= ?");
      valores.push(normalizarData(req.query.dataInicio));
    }
    if (normalizarData(req.query.dataFim)) {
      filtros.push("e.data_ensaio <= ?");
      valores.push(normalizarData(req.query.dataFim));
    }

    const where = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";

    const [linhas] = await pool.execute(
      `SELECT e.id, e.numero_relatorio, e.tecnico_responsavel, e.data_ensaio,
              e.cliente_projeto, e.serial_apertadeira, e.serial_crowfoot, e.tipo_ensaio, e.status_final,
              e.criado_em, e.atualizado_em, u.nome AS dono_ensaio
       FROM ensaios e
       LEFT JOIN usuarios u ON u.id = e.usuario_id
       ${where}
       ORDER BY e.data_ensaio DESC, e.atualizado_em DESC
       LIMIT 300`,
      valores
    );

    res.json(linhas);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.get("/api/ensaios/:id", exigirLogin, async (req, res) => {
  try {
    const usuarioLogado = usuarioSessao(req);
    const filtros = ["e.id = ?"];
    const valores = [req.params.id];

    if (usuarioLogado.perfil !== "ADMIN") {
      filtros.push("e.usuario_id = ?");
      valores.push(usuarioLogado.id);
    }

    const [linhas] = await pool.execute(
      `SELECT e.id, e.numero_relatorio, e.tecnico_responsavel, e.data_ensaio,
              e.cliente_projeto, e.serial_apertadeira, e.serial_crowfoot, e.tipo_ensaio, e.status_final, e.dados_json
       FROM ensaios e
       WHERE ${filtros.join(" AND ")}`,
      valores
    );

    if (!linhas.length) {
      return res.status(404).json({ erro: "Ensaio não encontrado ou sem permissão de acesso." });
    }

    const ensaio = linhas[0];
    res.json({
      ...ensaio,
      dados: JSON.parse(ensaio.dados_json)
    });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.delete("/api/ensaios/:id", exigirAdmin, async (req, res) => {
  try {
    if (!validarSenhaAdmin(req)) {
      return res.status(403).json({ erro: "Senha obrigatória para excluir ensaio." });
    }

    const [resultado] = await pool.execute("DELETE FROM ensaios WHERE id = ?", [req.params.id]);
    if (!resultado.affectedRows) {
      return res.status(404).json({ erro: "Ensaio não encontrado." });
    }
    res.json({ ok: true, mensagem: "Ensaio excluído." });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

async function colunaExiste(tabela, coluna) {
  const [linhas] = await pool.execute(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tabela, coluna]
  );
  return linhas.length > 0;
}

async function indiceExiste(tabela, indice) {
  const [linhas] = await pool.execute(
    `SELECT INDEX_NAME
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?
     LIMIT 1`,
    [tabela, indice]
  );
  return linhas.length > 0;
}

async function garantirEstruturaBanco() {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(150) NOT NULL,
        usuario VARCHAR(80) NOT NULL UNIQUE,
        senha_hash VARCHAR(255) NOT NULL,
        perfil ENUM('TECNICO', 'ADMIN') DEFAULT 'TECNICO',
        ativo TINYINT(1) DEFAULT 1,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    if (!(await colunaExiste("ensaios", "usuario_id"))) {
      await pool.execute("ALTER TABLE ensaios ADD COLUMN usuario_id INT NULL AFTER id");
      console.log("Coluna usuario_id criada na tabela ensaios.");
    }

    if (!(await colunaExiste("ensaios", "cliente_projeto"))) {
      await pool.execute("ALTER TABLE ensaios ADD COLUMN cliente_projeto VARCHAR(150) NULL AFTER data_ensaio");
      console.log("Coluna cliente_projeto criada na tabela ensaios.");
    }

    if (!(await indiceExiste("ensaios", "idx_ensaios_usuario_id"))) {
      await pool.execute("CREATE INDEX idx_ensaios_usuario_id ON ensaios (usuario_id)");
      console.log("Índice idx_ensaios_usuario_id criado.");
    }

    if (!(await indiceExiste("ensaios", "idx_ensaios_cliente_projeto"))) {
      await pool.execute("CREATE INDEX idx_ensaios_cliente_projeto ON ensaios (cliente_projeto)");
      console.log("Índice idx_ensaios_cliente_projeto criado.");
    }

    const [admins] = await pool.execute("SELECT id FROM usuarios WHERE perfil = 'ADMIN' LIMIT 1");
    if (!admins.length) {
      const adminUser = texto(process.env.ADMIN_USER) || "admin";
      const adminName = texto(process.env.ADMIN_NAME) || "Administrador";
      const adminPass = texto(process.env.ADMIN_PASSWORD) || senhaAdminConfigurada();
      const senhaHash = await bcrypt.hash(adminPass, 10);
      await pool.execute(
        "INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo) VALUES (?, ?, ?, 'ADMIN', 1)",
        [adminName, adminUser, senhaHash]
      );
      console.log(`Usuário ADMIN inicial criado: ${adminUser}`);
    }

    const [tecnicos] = await pool.execute("SELECT id FROM usuarios WHERE perfil = 'TECNICO' LIMIT 1");
    if (!tecnicos.length) {
      const senhaHash = await bcrypt.hash("1234", 10);
      await pool.execute(
        "INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo) VALUES (?, ?, ?, 'TECNICO', 1)",
        ["Marcos Tadeu Silva", "marcos", senhaHash]
      );
      console.log("Usuário técnico inicial criado: marcos / 1234");
    }
  } catch (erro) {
    console.error("Falha ao verificar/ajustar estrutura do banco:", erro.message);
  }
}

garantirEstruturaBanco().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
});
