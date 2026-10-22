# Entrada do usuário e login

## Rotas no Cloudflare Pages (ntn-plataforma.pages.dev)

| Rota | Acesso |
|---|---|
| `/` (landing), `landing.css`, `icons.js`, `design-tokens.css`, `icon.svg`, `manifest.json` e demais arquivos estáticos da raiz | Público (app Access "landing publica", política Bypass Everyone) |
| `/entrar`, `/relatorio-demo`, `/api/me` | Login (ntn-admins ou ntn-viewers) |
| `/app`, `/ntn`, `/utilities`, `/consumo`, `/admin`, `/api/*`, `/.netlify/*` e domínios de preview | Login, somente ntn-admins |

Os arquivos públicos da raiz são só código, que já é aberto no GitHub. Dados reais só chegam por `/api` e `/.netlify`, que continuam protegidos e ainda passam pela checagem de papel no `_middleware.js`.

## Fluxo

1. A landing tem o botão **Entrar**, que leva a `/entrar/`.
2. O Access pede o e-mail e envia um código para a caixa de entrada (sem senha).
3. `/entrar/` consulta `/api/me`. Um admin vai para `/app/?bemvindo=1`, onde aparece uma única vez a tela de boas-vindas (cadastrar a chave do nRF Cloud, conferir o rastreador, convidar pessoas). Um viewer vai para `/relatorio-demo/`.

## Tela de login do Access

Ela é personalizada pela API (`PUT /accounts/{conta}/access/organizations`, campo `login_design`), com a logo `icon.svg`, o fundo `#0b1530`, texto branco, e cabeçalho e rodapé em PT-BR.

## Ativar login com Google depois

1. No Google Cloud Console, crie um cliente OAuth (tipo Aplicativo da Web) com a URI de redirecionamento `https://ntn-plataforma.cloudflareaccess.com/cdn-cgi/access/callback`.
2. Em Zero Trust, Settings, Authentication, Login methods, adicione Google com o Client ID e o Client Secret. O segredo nunca vai para o repositório.
3. Em cada app Access (admin, demo e sessão), inclua o novo IdP em `allowed_idps`, mantendo o código por e-mail. Os grupos por e-mail continuam valendo, então os papéis não mudam.
