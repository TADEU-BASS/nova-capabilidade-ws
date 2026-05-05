CAPABILIDADE WS - Versao pronta para Render

1. Suba estes arquivos para o GitHub.
2. No Render, crie um Web Service.
3. Configure:
   Build Command: npm install
   Start Command: npm start

4. Cadastre as variaveis de ambiente no Render:
   DB_HOST=seu_host_mysql
   DB_USER=seu_usuario_mysql
   DB_PASSWORD=sua_senha_mysql
   DB_NAME=capabilidade_ws
   DB_PORT=3306
   APP_ADMIN_PASSWORD=senha_para_excluir
   SESSION_SECRET=uma_frase_grande_e_segura
   ADMIN_USER=admin
   ADMIN_PASSWORD=senha_admin_inicial
   ADMIN_NAME=Administrador
   NODE_ENV=production

Nao envie o arquivo .env para o GitHub.
