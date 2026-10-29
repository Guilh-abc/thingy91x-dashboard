# Prompt para colar no Kiro

Copie tudo abaixo da linha e cole no Kiro, com o repositório `thingy91x-dashboard` aberto na branch `redesign-v2`.

---

Você vai analisar a plataforma IoT Cat-M + NTN (rastreador e medidor nRF9151, rede celular Cat-M e satélite Skylo NTN). O site é estático: HTML, CSS e JS puros, publicado no Cloudflare Pages. Responda em português do Brasil.

Passos:

1. Leia `docs/ESTADO-DO-PROJETO.md` para entender estrutura, decisões de design, o que foi feito e o que falta.
2. Abra a pasta `docs/kiro/`. Leia `LEIA-ME.md` e depois cada arquivo `.md`. Leia os comentários e, principalmente, todos os pontos marcados com `KIRO:`.
3. Analise o comportamento atual das páginas (Início `app/`, Utilities `utilities/`, Rastreador `rastreador/`, NTN `ntn/`, Consumo `consumo/`, Alarmes `alarmes/`, Entrar `entrar/`). Se precisar, abra os arquivos reais citados.
4. Proponha sugestões concretas, priorizadas (alto impacto e baixo esforço primeiro), de:
   - funcionalidade;
   - estados ideais de cada página e do cartão de satélite: vazio, carregando, erro, sem leitura (`rsrp=NA`), ao vivo pelo USB, dado da nuvem, e dado antigo. Para cada estado diga o que aparece, o texto exato e a ação do usuário;
   - acessibilidade, contraste, foco e hover.
   Inclua trecho de código quando couber.
5. Respeite as regras: HTML, CSS e JS puros, sem framework, sem npm, sem backend novo; PT-BR sem travessão; "byGui" no rodapé; não mudar IDs nem lógica que funciona (polling, regras de alarme, regra Desligado de 5 min e 15 min em busca); não mexer no firmware. O formato do firmware 1.7 é fixo: `APP|<ms>|STATE|<CATM|SINCRONIA|BUSCA|REGISTRADO|ENVIO|FALHA>` e `APP|<ms>|SIG|rsrp=<n> dBm nivel=<FRACO|MEDIO|FORTE>` ou `APP|<ms>|SIG|rsrp=NA nivel=NA`. Na nuvem só existem `r` (RSRP) e `n` (`n` satélite, `c` Cat-M).
6. Grave sua resposta completa em `docs/kiro/RESPOSTA-KIRO.md` neste repositório, com: resumo, lista priorizada, tabela de estados por página, resposta a cada `KIRO:` (citando o arquivo), trechos de código e riscos. Termine com "byGui".

Não faça commit, push nem deploy.
