# v32 — Presença única + revisão geral

**Causa raiz (v31):** o header/Estado/alertas usavam `last_seen` (Memfault) + mensagens de `ListMessages`. A trilha
(`/location/history`, GNSS) e o ponto GNSS mais recente **não entravam** na evidência (v31 removeu "trilha" da presença
para não contar cache local, mas removeu junto a localização vinda da NUVEM). O popup do mapa usava outra regra
(idade do próprio ponto ⇒ "Online"), e "Posição" caía num ponto antigo do cache local (`ha 1d`) porque
`applyPositionFromPoint` pegava o último item do array sem comparar horários. Resultado: duas verdades.

**Correção:** `presence-core.js` (único), usado por front, `nrfcloud.js`, `alerts.js`, `proxy.js`.
Evidência = mais recente entre last_seen Memfault · shadow `$meta` · mensagens da nuvem (qualquer appId) ·
location history da nuvem (GNSS/GROUND_FIX/Wi‑Fi/célula). Não conta poll, USB serial do Mac, cache local.
Tooltip (header / "Último dado do aparelho (nuvem)") mostra a fonte e as demais evidências.

Testes: `npm test` (Node) e `npm run test:e2e` (playwright + API simulada).
