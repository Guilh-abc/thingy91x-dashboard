# Papéis (viewer e admin): contrato da API de sessão

Estado: implementado com Cloudflare Access + Pages Functions no projeto `ntn-plataforma` (https://ntn-plataforma.pages.dev).

## Como está montado
- Zero Trust: equipe `ntn-plataforma.cloudflareaccess.com`, login por PIN enviado por e-mail (One-time PIN).
- Grupos do Access: `ntn-admins` (guilhermeromionetto@gmail.com) e `ntn-viewers` (começa com um e-mail fictício `viewer-placeholder@invalid.example`, porque o Access exige ao menos uma regra).
- Aplicação Access "ntn-plataforma (admin)": o domínio inteiro e as prévias `*.ntn-plataforma.pages.dev`, só `ntn-admins`.
- Aplicação Access "ntn-plataforma (demo e sessao)": `/relatorio-demo`, `/icons.js`, `/design-tokens.css`, `/icon.svg`, `/manifest.json` e `/api/me`, para `ntn-admins` e `ntn-viewers` (o caminho mais específico vence).
- Funções em `functions/`: `/api/me`, `/api/users` e o `_middleware.js`, que faz o proxy de `/.netlify/functions/{ntn-lab,nrfcloud,alerts}` e `/api/{ntn-lab,nrfcloud,alerts}` só para admin.
- O JWT `Cf-Access-Jwt-Assertion` é validado com os certificados da equipe (RS256, `aud` e `iss`). O papel vem do KV `NTN_ROLES` (`role:<email>`), com reserva no `ADMIN_EMAIL` e no grupo `ntn-admins`.
- Variáveis do Pages: `TEAM_DOMAIN`, `ACCESS_AUDS`, `ADMIN_EMAIL`, `ADMINS_GROUP_ID`, `VIEWERS_GROUP_ID`, `ACCOUNT_ID`. Segredo: `CF_API_TOKEN` (criptografado no Pages, nunca no repo).
- Publicação: `scripts/deploy-pages.sh` com `CLOUDFLARE_API_TOKEN` no ambiente.

## Recomendação sobre o token da função
Hoje o segredo `CF_API_TOKEN` do Pages é o mesmo token usado na implantação, que também pode editar Pages e KV. Recomendado: criar um token só com "Access: Organizations, Identity Providers, and Groups: Edit" e trocar o segredo no painel (Pages, ntn-plataforma, Settings, Variables and Secrets).

## Regra de segurança
A interface só esconde ou mostra telas. Quem autoriza é o servidor: toda rota de dados reais e de exportação precisa validar a sessão e o papel no servidor. Autenticação feita só no navegador não é segura e não deve ser tratada como tal. Nenhuma senha ou chave vai no código do site.

## Transição (hoje)
Enquanto `GET /api/me` não existir (404, erro ou resposta não JSON), `roles.js` entra em modo **legado**: nada muda. A raiz continua usando a chave nRF Cloud salva no próprio navegador (pareamento atual), e as demais páginas seguem como estão.

## Endpoints
| Método | Caminho | Quem | Resposta |
|---|---|---|---|
| GET | `/api/me` | qualquer sessão | `200 {"email":"a@b.com","role":"admin"\|"viewer"}`; sem sessão: `401` |
| GET | `/api/users` | admin | `200 {"users":[{"id":"u1","email":"a@b.com","role":"viewer","createdAt":"ISO"}]}` |
| POST | `/api/users` | admin | corpo `{"email":"...","role":"viewer"\|"admin"}`; `201` com o usuário criado |
| PATCH | `/api/users/:id` | admin | corpo `{"role":"admin"}`; `200` com o usuário |
| DELETE | `/api/users/:id` | admin | `204` |

Erros: `401` sem sessão, `403` papel insuficiente, `409` email já existe, `422` dado inválido. Sessão por cookie `HttpOnly; Secure; SameSite=Lax` (ou cabeçalho do Cloudflare Access validado no servidor). Respostas com `Content-Type: application/json` e `Cache-Control: no-store`.

## O que cada papel vê
- **viewer**: dashboards e a demonstração (`/relatorio-demo/`). Nas páginas reais (atributo `data-pagina-real`) aparece a tela "Acesso restrito". Sem exportação, sem cruzamento com dados reais.
- **admin**: tudo, mais `/admin/acessos/` (listar, criar, remover e conceder admin).

## O que ainda é público
- A função Netlify `ntn-lab` (https://thingy91x-x-dashboard.netlify.app/.netlify/functions/ntn-lab) continua aberta, porque as placas e o relay enviam para ela. Quem souber a URL ainda lê os dados. Fechar a leitura exige separar ingestão (POST das placas) de leitura (GET) com um segredo compartilhado com o proxy do Pages.
- O site Netlify `thingy91x-x-dashboard` continua com as páginas antigas.
- O GitHub Pages agora serve só a demonstração e um aviso (ramo `gh-pages-demo`).
