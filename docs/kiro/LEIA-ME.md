# Pasta docs/kiro: o que esperamos do Kiro

Esta pasta tem trechos do código atual da branch `redesign-v2` (não publicada), cada um com explicação em PT-BR e pontos marcados com `KIRO:`.

## Arquivos

| Arquivo | Assunto |
|---|---|
| `utilities.html.md` | Estrutura da página Utilities |
| `busca-card.js.md` | Cartão de estado do satélite e leitura do firmware 1.7 |
| `busca-card.css.md` | Estilo do cartão |
| `sinal-nuvem.js.md` | Ligação do RSRP e da rede da nuvem (`r`/`n`) ao cartão |
| `hero-u.js.md` | Faixa de status |
| `tema-v2.css.md` | Tema único escuro |
| `alarmes.js.md` | Alarmes: carregamento e estados |
| `inicio-hub.css.md` | Início do sistema |

## O que devolver (em `docs/kiro/RESPOSTA-KIRO.md`)

1. Lista priorizada (alto impacto e baixo esforço primeiro) de melhorias de funcionalidade.
2. Para cada página, a tabela de estados ideais: vazio, carregando, erro, sem leitura, ao vivo (USB), nuvem. O que mostrar, texto exato em PT-BR e ação.
3. Resposta a cada ponto `KIRO:`, citando o arquivo.
4. Trechos de código prontos quando couber.
5. Riscos: o que pode quebrar (IDs, polling, regras de alarme, regra Desligado de 5 e 15 min).

## Regras

- HTML, CSS e JS puros. Sem framework, sem npm, sem backend novo.
- Textos em PT-BR, sem travessão (traço longo).
- Rodapé com "byGui".
- Não mudar IDs nem a lógica que já funciona. Não mexer no firmware.

byGui
