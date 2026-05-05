CAPABILIDADE WS - Versão corrigida para Render + PostgreSQL

1. Suba estes arquivos para o GitHub, substituindo os arquivos antigos.

2. No Render, no Web Service do app, configure:
   Build Command: npm install
   Start Command: npm start

3. No Render, cadastre as Environment Variables:
   DATABASE_URL=Internal Database URL do PostgreSQL criado no Render
   NODE_ENV=production
   APP_ADMIN_PASSWORD=senha_para_excluir_ensaio
   SESSION_SECRET=uma_frase_grande_e_segura
   ADMIN_USER=admin
   ADMIN_PASSWORD=1234
   ADMIN_NAME=Administrador

4. Não envie o arquivo .env real para o GitHub.
   Envie somente o .env.example.

5. Depois de subir para o GitHub, no Render faça:
   Manual Deploy > Deploy latest commit

6. Para testar a conexão com o banco, acesse:
   /api/status-db

Se estiver correto, aparecerá:
   { "ok": true, "mensagem": "Conexão com PostgreSQL OK" }
