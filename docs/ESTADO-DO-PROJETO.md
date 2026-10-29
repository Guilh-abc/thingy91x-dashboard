# Estado do projeto: plataforma IoT Cat-M + NTN

Atualizado em 29/10/2026 (horário de Brasília). Branch de trabalho: `redesign-v2` (a partir de `landing-v12`, commit 1091063, SW ntn-v69). **Nada foi publicado**, sem commit, push ou deploy.

## Estrutura de pastas

| Pasta ou arquivo | O que é |
|---|---|
| `index.html`, `landing.css` | Página pública (identidade magenta própria) |
| `entrar/` | Login sem senha (Google ou código por e-mail) |
| `app/` + `hub.css` | Início do sistema (KPIs, módulos, atividade) |
| `utilities/` | Painel do medidor: `utilities.js` (dados e polling), `hero-u.js` (faixa de status), `busca-card.js` (cartão do satélite), `preview-busca.html` (prévia local com dados simulados, não publicar) |
| `rastreador/` | Rastreadores Thingy:91X e NTN |
| `ntn/` | Painel NTN, laboratório, firmware, connect (`pro.css`, `hero.css`, `deck-theme.css`) |
| `consumo/` | Consumo de dados por chip |
| `alarmes/` | Regras de alarme (precisa do backend `/api/alarmes`) |
| `functions/`, `netlify/functions/`, `workers/` | Backend (Pages Functions e workers) |
| `design-tokens.css` | Tokens de design (cores, espaço, raio, tipo, sombra) |
| `tema-v2.css` | Novo: tema único escuro, carregado por último nas páginas internas |
| `shell.css`, `shell.js` | Barra de navegação comum |
| `tests/` | Testes Node (`*.test.mjs`) e e2e Python |
| `prints/` | Prints antes (`prints/antes/`) e depois (`prints/depois/`, `prints/*.png`) |
| `docs/kiro/` | Trechos de código comentados para o Kiro (ver abaixo) |

## Decisões de design

- **Tokens** em `design-tokens.css` (`:root`): espaço `--esp-1..6` (4 a 32 px), raio `--raio-s/m/l` (8, 12, 18), tipo `--fonte` Inter e `--fs-xs..2xl` (11 a 30 px), sombra `--sombra-1`.
- **Cores**: azul `--cor-info` #2563eb para ação (contraste 5,2:1 com branco); verde `--cor-ok`, amarelo `--cor-aviso`, vermelho `--cor-alerta` só para estado; magenta `--cor-marca` #E20074 para marca e satélite; fundo #0b0f1a, cartão #121829, borda #26304a, texto #e8ecf6, texto suave #a3aec6.
- **Sem**: listras laterais, barras no topo de cartões, texto com gradiente, fundos decorativos, faixas piscando, títulos em caixa alta.
- **Estados padrão**: `.vazio`, `.vazio.carregando`, `.vazio.erro`, foco visível igual em tudo, `prefers-reduced-motion` respeitado.
- **Estados do satélite** (cartão único da Utilities): BUSCA, SINCRONIA, REGISTRADO, ENVIO, FALHA, CATM. O evento mais novo entre plataforma, nuvem e USB vence. Sugestão de ajustar antena aos 10 min, alerta só aos 30 min.
- **Sinal**: fraco < -120 dBm, médio -120 a -110, forte > -110. Usa o nível enviado pela placa; as faixas são reserva.
- **Firmware 1.7 (já gravado na placa)**:
  - `APP|<ms>|STATE|<CATM|SINCRONIA|BUSCA|REGISTRADO|ENVIO|FALHA>` a cada transição (ENVIO e FALHA só em satélite).
  - `APP|<ms>|SIG|rsrp=<n> dBm nivel=<FRACO|MEDIO|FORTE>` ou `APP|<ms>|SIG|rsrp=NA nivel=NA`, a cada 10 s só em BUSCA.
  - Nuvem sem campo de estado: usa `r` (RSRP) e `n` (`n` satélite, `c` Cat-M), normalizados no servidor como `rsrp` e `net`.

## O que foi feito (redesign-v2)

1. Utilities v2: cartão único de satélite (trilha de etapas, cronômetro com barra até 30 min, sinal ao vivo USB e da nuvem, próximo passo, LED do estado atual, checklist em cartões com contador).
2. Leitura do firmware 1.7 (`parseLinha`, `parseNuvem`) com teste `tests/busca-card-fw17.test.mjs`.
3. Último RSRP e rede da nuvem (`r`/`n`) ligados ao cartão em `utilities.js`.
4. Tema único escuro (`tema-v2.css`) em Início, Rastreador, Utilities, NTN, Consumo, Alarmes e Entrar; `hub.css` passou a usar tokens.
5. Faixa de status calma (sem piscar, frase normal).
6. Alarmes com estados carregando, sem conexão, serviço indisponível, sem acesso, erro e lista vazia.
7. Ajustes da landing: tamanho mínimo de texto e quebra de linha melhor.

## Impeccable por página (achados, antes e depois)

Ver a Page do relatório e `docs/kiro/`. Resumo no relatório final do agente.

## O que falta

- Testar com a placa no USB do Mac (Chrome ou Edge) e logado no site real.
- Reduzir a Utilities a 3 zonas e migrar os CSS antigos para tokens, removendo a camada `tema-v2.css`.
- Respostas do Kiro em `docs/kiro/RESPOSTA-KIRO.md`.
- Publicar: commit na `redesign-v2` (sem `prints/` e sem `preview-busca.html`), subir `?v=` dos CSS e JS e o SW para ntn-v70, merge em `landing-v12` e deploy, só com OK do Guilherme.

## Pontos de atenção

- 4 testes já falhavam em `landing-v12` e seguem falhando: `consumo-thingy`, `hub-rastreador`, `ntn-lab-rolling`, `ntn-pro`.
- `npm test` está quebrado: aponta para arquivos de teste que não existem.
- Alarmes depende do backend `/api/alarmes`; em teste local mostra "Serviço de alarmes indisponível".
- Nada foi publicado. GitHub Pages e Cloudflare seguem com `landing-v12`.

## Para o Kiro

- `docs/kiro/LEIA-ME.md`: o que esperamos de volta.
- `docs/kiro/prompt-kiro.md`: prompt pronto para colar.
- Trechos: `utilities.html.md`, `busca-card.js.md`, `busca-card.css.md`, `sinal-nuvem.js.md`, `hero-u.js.md`, `tema-v2.css.md`, `alarmes.js.md`, `inicio-hub.css.md`.
- Resposta esperada em `docs/kiro/RESPOSTA-KIRO.md`.

byGui
