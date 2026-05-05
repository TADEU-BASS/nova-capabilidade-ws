require("dotenv").config();

const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const session = require("express-session");

const app = express();
app.set("trust proxy", 1);
const PORT = Number(process.env.PORT || 3004);
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: IS_PRODUCTION ? { rejectUnauthorized: false } : false
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
  const resultado = await pool.query(
    `SELECT id, nome, usuario, senha_hash, perfil, ativo
     FROM usuarios
     WHERE usuario = $1
     LIMIT 1`,
    [texto(usuario)]
  );
  return resultado.rows[0] || null;
}

function respostaUsuario(usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    usuario: usuario.usuario,
    perfil: usuario.perfil,
    ativo: usuario.ativo === true || Number(usuario.ativo) === 1
  };
}

app.get("/api/status-db", async (_req, res) => {
  try {
    await pool.query("SELECT 1 AS ok");
    res.json({ ok: true, mensagem: "Conexão com PostgreSQL OK" });
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
    if (!registro || !(registro.ativo === true || Number(registro.ativo) === 1)) {
      return res.status(401).json({ erro: "Usuário ou senha inválidos." });
    }

    const senhaOk = await bcrypt.compare(senha, registro.senha_hash);
    if (!senhaOk) {
      return res.status(401).json({ erro: "Usuário ou senha inválidos." });
    }

    req.session.usuario = respostaUsuario(registro);
    req.session.save((erroSessao) => {
      if (erroSessao) {
        return res.status(500).json({ erro: "Falha ao salvar sessão de login." });
      }
      res.json({ ok: true, usuario: req.session.usuario });
    });
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
    const resultado = await pool.query(
      `SELECT id, nome, usuario, perfil, ativo, criado_em
       FROM usuarios
       ORDER BY nome ASC`
    );
    res.json(resultado.rows);
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
    const resultado = await pool.query(
      `INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id`,
      [nome, usuario, senhaHash, perfil]
    );

    res.json({ ok: true, id: resultado.rows[0].id, mensagem: "Usuário cadastrado." });
  } catch (erro) {
    if (erro && erro.code === "23505") {
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
    const ativo = Number(req.body?.ativo) === 0 ? false : true;

    if (!id || !nome || !usuario) {
      return res.status(400).json({ erro: "Nome e usuário são obrigatórios." });
    }

    if (senha) {
      const senhaHash = await bcrypt.hash(senha, 10);
      await pool.query(
        `UPDATE usuarios
         SET nome = $1, usuario = $2, senha_hash = $3, perfil = $4, ativo = $5
         WHERE id = $6`,
        [nome, usuario, senhaHash, perfil, ativo, id]
      );
    } else {
      await pool.query(
        `UPDATE usuarios
         SET nome = $1, usuario = $2, perfil = $3, ativo = $4
         WHERE id = $5`,
        [nome, usuario, perfil, ativo, id]
      );
    }

    res.json({ ok: true, mensagem: "Usuário atualizado." });
  } catch (erro) {
    if (erro && erro.code === "23505") {
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

    const resultadoExistentes = await pool.query(
      "SELECT id, usuario_id FROM ensaios WHERE numero_relatorio = $1 LIMIT 1",
      [resumo.numeroRelatorio]
    );

    if (resultadoExistentes.rows.length) {
      const ensaioExistente = resultadoExistentes.rows[0];
      if (usuarioLogado.perfil !== "ADMIN" && Number(ensaioExistente.usuario_id) !== Number(usuarioLogado.id)) {
        return res.status(403).json({ erro: "Você só pode alterar ensaios cadastrados pelo seu usuário." });
      }

      const usuarioDono = ensaioExistente.usuario_id || usuarioLogado.id;
      await pool.query(
        `UPDATE ensaios
         SET usuario_id = $1, tecnico_responsavel = $2, data_ensaio = $3, cliente_projeto = $4,
             serial_apertadeira = $5, serial_crowfoot = $6, tipo_ensaio = $7, status_final = $8,
             dados_json = $9::jsonb, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = $10`,
        [
          usuarioDono,
          resumo.tecnicoResponsavel,
          resumo.dataEnsaio,
          resumo.clienteProjeto,
          resumo.serialApertadeira,
          resumo.serialCrowfoot,
          resumo.tipoEnsaio,
          resumo.statusFinal,
          JSON.stringify(estado),
          ensaioExistente.id
        ]
      );

      return res.json({
        ok: true,
        id: ensaioExistente.id,
        numero_relatorio: resumo.numeroRelatorio,
        mensagem: "Ensaio atualizado no banco PostgreSQL."
      });
    }

    const resultado = await pool.query(
      `INSERT INTO ensaios
        (usuario_id, numero_relatorio, tecnico_responsavel, data_ensaio, cliente_projeto, serial_apertadeira, serial_crowfoot, tipo_ensaio, status_final, dados_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       RETURNING id`,
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
        JSON.stringify(estado)
      ]
    );

    res.json({
      ok: true,
      id: resultado.rows[0].id,
      numero_relatorio: resumo.numeroRelatorio,
      mensagem: "Ensaio salvo no banco PostgreSQL."
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

    function addFiltro(sql, valor) {
      valores.push(valor);
      filtros.push(sql.replace("?", `$${valores.length}`));
    }

    if (usuarioLogado.perfil !== "ADMIN") {
      addFiltro("e.usuario_id = ?", usuarioLogado.id);
    }

    if (texto(req.query.numeroRelatorio)) {
      addFiltro("e.numero_relatorio ILIKE ?", `%${texto(req.query.numeroRelatorio)}%`);
    }
    if (texto(req.query.tecnicoResponsavel)) {
      addFiltro("e.tecnico_responsavel ILIKE ?", `%${texto(req.query.tecnicoResponsavel)}%`);
    }
    if (texto(req.query.clienteProjeto)) {
      addFiltro("e.cliente_projeto ILIKE ?", `%${texto(req.query.clienteProjeto)}%`);
    }
    if (texto(req.query.serialApertadeira)) {
      addFiltro("e.serial_apertadeira ILIKE ?", `%${texto(req.query.serialApertadeira)}%`);
    }
    if (texto(req.query.serialCrowfoot)) {
      addFiltro("e.serial_crowfoot ILIKE ?", `%${texto(req.query.serialCrowfoot)}%`);
    }
    if (normalizarData(req.query.dataInicio)) {
      addFiltro("e.data_ensaio >= ?", normalizarData(req.query.dataInicio));
    }
    if (normalizarData(req.query.dataFim)) {
      addFiltro("e.data_ensaio <= ?", normalizarData(req.query.dataFim));
    }

    const where = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";

    const resultado = await pool.query(
      `SELECT e.id, e.numero_relatorio, e.tecnico_responsavel,
              TO_CHAR(e.data_ensaio, 'YYYY-MM-DD') AS data_ensaio,
              e.cliente_projeto, e.serial_apertadeira, e.serial_crowfoot, e.tipo_ensaio, e.status_final,
              e.criado_em, e.atualizado_em, u.nome AS dono_ensaio
       FROM ensaios e
       LEFT JOIN usuarios u ON u.id = e.usuario_id
       ${where}
       ORDER BY e.data_ensaio DESC, e.atualizado_em DESC
       LIMIT 300`,
      valores
    );

    res.json(resultado.rows);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.get("/api/ensaios/:id", exigirLogin, async (req, res) => {
  try {
    const usuarioLogado = usuarioSessao(req);
    const filtros = ["e.id = $1"];
    const valores = [req.params.id];

    if (usuarioLogado.perfil !== "ADMIN") {
      valores.push(usuarioLogado.id);
      filtros.push(`e.usuario_id = $${valores.length}`);
    }

    const resultado = await pool.query(
      `SELECT e.id, e.numero_relatorio, e.tecnico_responsavel,
              TO_CHAR(e.data_ensaio, 'YYYY-MM-DD') AS data_ensaio,
              e.cliente_projeto, e.serial_apertadeira, e.serial_crowfoot, e.tipo_ensaio, e.status_final, e.dados_json
       FROM ensaios e
       WHERE ${filtros.join(" AND ")}`,
      valores
    );

    if (!resultado.rows.length) {
      return res.status(404).json({ erro: "Ensaio não encontrado ou sem permissão de acesso." });
    }

    const ensaio = resultado.rows[0];
    res.json({
      ...ensaio,
      dados: typeof ensaio.dados_json === "string" ? JSON.parse(ensaio.dados_json) : ensaio.dados_json
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

    const resultado = await pool.query("DELETE FROM ensaios WHERE id = $1", [req.params.id]);
    if (!resultado.rowCount) {
      return res.status(404).json({ erro: "Ensaio não encontrado." });
    }
    res.json({ ok: true, mensagem: "Ensaio excluído." });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

async function garantirEstruturaBanco() {
  try {
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
      )
    `);

    await pool.query("ALTER TABLE ensaios ADD COLUMN IF NOT EXISTS usuario_id INTEGER NULL REFERENCES usuarios(id) ON DELETE SET NULL");
    await pool.query("ALTER TABLE ensaios ADD COLUMN IF NOT EXISTS cliente_projeto VARCHAR(150)");
    await pool.query("ALTER TABLE ensaios ADD COLUMN IF NOT EXISTS serial_crowfoot VARCHAR(150)");
    await pool.query("ALTER TABLE ensaios ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP");

    await pool.query("CREATE INDEX IF NOT EXISTS idx_ensaios_usuario_id ON ensaios (usuario_id)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_ensaios_cliente_projeto ON ensaios (cliente_projeto)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_ensaios_data_ensaio ON ensaios (data_ensaio)");

    const admins = await pool.query("SELECT id FROM usuarios WHERE perfil = 'ADMIN' LIMIT 1");
    if (!admins.rows.length) {
      const adminUser = texto(process.env.ADMIN_USER) || "admin";
      const adminName = texto(process.env.ADMIN_NAME) || "Administrador";
      const adminPass = texto(process.env.ADMIN_PASSWORD) || senhaAdminConfigurada();
      const senhaHash = await bcrypt.hash(adminPass, 10);
      await pool.query(
        "INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo) VALUES ($1, $2, $3, 'ADMIN', true)",
        [adminName, adminUser, senhaHash]
      );
      console.log(`Usuário ADMIN inicial criado: ${adminUser}`);
    }

    const tecnicos = await pool.query("SELECT id FROM usuarios WHERE perfil = 'TECNICO' LIMIT 1");
    if (!tecnicos.rows.length) {
      const senhaHash = await bcrypt.hash("1234", 10);
      await pool.query(
        "INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo) VALUES ($1, $2, $3, 'TECNICO', true)",
        ["Marcos Tadeu Silva", "marcos", senhaHash]
      );
      console.log("Usuário técnico inicial criado: marcos / 1234");
    }

    console.log("Estrutura do banco PostgreSQL verificada com sucesso.");
  } catch (erro) {
    console.error("Falha ao verificar/ajustar estrutura do banco:", erro.message);
    throw erro;
  }
}

garantirEstruturaBanco().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}).catch((erro) => {
  console.error("Erro ao iniciar o servidor:", erro.message);
  process.exit(1);
});
