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
2. O Access mostra **Entrar com Google** e, como alternativa, o código por e-mail (sem senha). O papel vem do e-mail da conta, nos dois casos.
3. `/entrar/` consulta `/api/me`. Um admin vai para `/app/?bemvindo=1`, onde aparece uma única vez a tela de boas-vindas (cadastrar a chave do nRF Cloud, conferir o rastreador, convidar pessoas). Um viewer vai para `/relatorio-demo/`.

## Tela de login do Access

Ela é personalizada pela API (`PUT /accounts/{conta}/access/organizations`, campo `login_design`), com a logo `icon.svg`, o fundo `#0b1530`, texto branco, e cabeçalho e rodapé em PT-BR.

## Login com Google (ativo desde 22/10/2026)

1. Cliente OAuth do Google (Aplicativo da Web) com a URI de redirecionamento `https://ntn-plataforma.cloudflareaccess.com/cdn-cgi/access/callback`.
2. IdP "Google" criado no Zero Trust pela API (`POST /accounts/{conta}/access/identity_providers`), com Client ID e Client Secret lidos do ambiente. O segredo nunca vai para o repositório.
3. As apps Access admin (inclui os domínios de preview) e demo e sessão têm `allowed_idps` com Google e o código por e-mail, sem `auto_redirect_to_identity`, para a tela mostrar as duas opções.
4. Os grupos por e-mail continuam valendo, então os papéis não mudam. Testar: Zero Trust, Settings, Authentication, Login methods, Google, Test.
