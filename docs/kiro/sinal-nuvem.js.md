# Ligação do sinal da nuvem ao cartão (utilities.js)

Arquivo: `utilities/utilities.js` (branch `redesign-v2`, não publicado).

## Como funciona

- A nuvem não tem campo de estado. O servidor (`netlify/functions/ntn-lab.js`) normaliza `r` para `rsrp` e `n` para `net`.
- No cartão, o último registro de satélite com RSRP vira `{ r, n, at }` e o cartão deduz REGISTRADO quando `n = n`.
- Registros Cat-M não entram aqui: a volta ao Cat-M já vem pelo estado da plataforma, evitando falso CATM durante a busca.
- Após registrar, `ultRsrp` alimenta a faixa com "último sinal enviado pela placa".

## Pontos para o Kiro

- KIRO: Sugira mostrar no cartão a rede de cada envio (satélite ou Cat-M) numa trilha curta.
- KIRO: Defina o estado ideal quando a nuvem tem RSRP mas é antigo (mais de 15 min).
- KIRO: Avalie se o polling atual é suficiente para "tempo real" ou se cabe um aviso de "atualizando".

## Código atual

```js
    if (window.drawHeroU) { let runStart = null; for (let i = tel.length - 1; i >= 0 && !isSat(tel[i]); i--) runStart = T(tel[i]);
      const chg = [...rs].reverse().find((r) => r.type === 'event' && ['boot', 'back_catm', 'sw', 'lost', 'reg'].includes(r.event)); if (runStart != null && chg && T(chg) > runStart) runStart = T(chg);
      const key = !rs.length ? 'nodata' : offNow || (!on && !(sNet && age < 1800000)) ? 'off' : sNet ? (sNet.reg ? 'ntn' : 'search') : 'catm';
      window.drawHeroU({ key, buscaSat, lastNet: lastNetTxt, busca: key === 'search' ? { t0: sNet.start, iniTxt: 'teste satélite (botão 4)', sync: sNet.gnss || sNet.search ? 1 : null, reg: sNet.reg ? 1 : null,
        sinal: (() => { const x = [...sNet.ev].reverse().find((r) => (r.plmn === '90198' || r.type === 'satsum' || r.type === 'satdet' || /^sat_/.test(r.event || '')) && (r.rsrp != null || r.rsrpAvg != null)); return x ? { rsrp: x.rsrp ?? x.rsrpAvg, snr: x.snr ?? x.snrAvg, at: T(x) } : null; })(),
        nuvem: (() => { const x = [...sNet.ev].reverse().find((r) => r.estado != null || r.state != null || (r.rsrp != null && isSat(r))); if (!x) return null; const nt = isSat(x) ? 'ntn' : netOf(x); /* só registros de satélite: a volta ao Cat-M já vem pelo estado da plataforma */ /* v2: campos da nuvem r (RSRP) e n ('n' satélite, 'c' Cat-M), já normalizados como rsrp/net */ return Object.assign({}, x, { r: x.rsrp, n: nt === 'ntn' ? 'n' : nt === 'catm' ? 'c' : undefined, at: T(x) }); })(), refs: ses.filter((x) => x.reg).map((x) => T(x.reg) - x.start), rej: sNet.ev.filter((r) => r.rej != null).map((r) => r.rej) } : null, since: key === 'ntn' ? T(sNet.reg) : key === 'search' ? sNet.start : key === 'catm' ? runStart : null, lastRx: lastAny ? RX(lastAny) : null,
        ultRsrp:
```

byGui
