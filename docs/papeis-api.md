# Papéis (viewer e admin): contrato da API de sessão

Estado: contrato definido, servidor AINDA NÃO implementado. O backend será escolhido depois (Cloudflare Access ou Netlify Function com usuários e senha em hash). O front (`roles.js`) já consome este contrato.

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

## Pendente no servidor
As rotas de dados reais (`ntn-lab`, `nrfcloud`, exportações) também precisam exigir sessão de admin. Hoje a API `ntn-lab` é pública: Rastreador, Utilities e Consumo mostram dados reais e exportam sem chave.
