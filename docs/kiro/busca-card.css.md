# Estilo do cartão de satélite

Arquivo: `utilities/utilities.css` (branch `redesign-v2`, não publicado).

## Como funciona

- Usa só tokens de `design-tokens.css` / `tema-v2.css` (`--esp-*`, `--raio-*`, `--fs-*`, `--cor-*`).
- A cor de destaque `--ac` muda por estado: azul busca, verde registrado, vermelho falha, cinza Cat-M, amarelo após 30 min.
- Celular: abaixo de 800 px tudo vira uma coluna e a trilha de etapas fica compacta.
- Respeita `prefers-reduced-motion`.

## Pontos para o Kiro

- KIRO: O ponto do estado pulsa (`bcp`). Avalie se deve pulsar só em BUSCA e SINCRONIA.
- KIRO: A barra de progresso não tem estado após 30 min além da cor. Sugira o visual ideal para busca muito longa (60 min+).
- KIRO: Verifique contraste do texto suave sobre o fundo tingido em cada estado.

## Código atual

```css
/* v2: cartão único de estado do satélite (busca-card.js). Usa os tokens de design-tokens.css. */
.hbusca.bc{background:transparent;border:0;padding:0;margin:var(--esp-3) 16px var(--esp-4);color:var(--texto);font-family:var(--fonte)}
.bc-card{--ac:var(--cor-info);position:relative;background:linear-gradient(180deg,color-mix(in srgb,var(--ac) 9%,var(--fundo-card)),var(--fundo-card) 60%);border:1px solid color-mix(in srgb,var(--ac) 35%,var(--borda));border-radius:var(--raio-l);padding:var(--esp-5);box-shadow:var(--sombra-1);overflow:hidden}

.bc.verde .bc-card{--ac:var(--cor-ok)}.bc.vermelho .bc-card{--ac:var(--cor-alerta)}.bc.cinza .bc-card{--ac:var(--cor-neutro)}.bc.longo .bc-card{--ac:var(--cor-aviso)}
.bc-card small{display:block;text-transform:uppercase;letter-spacing:.08em;font-size:var(--fs-xs);font-weight:700;color:var(--texto-suave);margin-bottom:6px}
.bc-topo{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:var(--esp-2)}
.bc-est{display:inline-flex;align-items:center;gap:10px;font-weight:800;font-size:var(--fs-xl);letter-spacing:-.01em;color:var(--texto)}
.bc-est i{width:12px;height:12px;border-radius:50%;background:var(--ac,var(--cor-info));box-shadow:0 0 0 4px color-mix(in srgb,var(--ac,var(--cor-info)) 25%,transparent)}
.bc-card .bc-est i{background:var(--ac);box-shadow:0 0 0 4px color-mix(in srgb,var(--ac) 25%,transparent);animation:bcp 2s ease-in-out infinite}
@keyframes bcp{50%{box-shadow:0 0 0 8px color-mix(in srgb,var(--ac) 8%,transparent)}}
.bc-fonte{font-size:var(--fs-s);color:var(--texto-suave);font-variant-numeric:tabular-nums}
.bc-trilha{display:flex;gap:0;list-style:none;margin:var(--esp-4) 0;padding:0;counter-reset:t}
.bc-trilha li{flex:1;display:flex;align-items:center;gap:8px;font-size:var(--fs-s);color:var(--texto-suave);position:relative;padding-right:8px}
.bc-trilha li::after{content:"";flex:1;height:2px;background:var(--borda);border-radius:2px}.bc-trilha li:last-child::after{display:none}
.bc-trilha i{width:10px;height:10px;border-radius:50%;border:2px solid var(--borda);flex:none}
.bc-trilha li.feito{color:var(--texto)}.bc-trilha li.feito i{background:var(--cor-ok);border-color:var(--cor-ok)}.bc-trilha li.feito::after{background:var(--cor-ok)}
.bc-trilha li.agora{color:var(--texto);font-weight:700}.bc-trilha li.agora i{border-color:var(--ac);background:var(--ac)}
.bc-corpo{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(240px,1fr);gap:var(--esp-5);align-items:start}
.bc-tempo{display:block;font:800 clamp(34px,5vw,48px)/1 var(--fonte);font-variant-numeric:tabular-nums;letter-spacing:-.02em;margin-bottom:6px}
.bc-mut{font-size:var(--fs-s);color:var(--texto-suave)}
.bc-prog{position:relative;height:6px;border-radius:6px;background:var(--cor-neutro-fundo);margin:var(--esp-4) 0 6px}
.bc-prog span{position:absolute;inset:0 auto 0 0;border-radius:6px;background:var(--ac);transition:width .8s linear}
.bc-prog em{position:absolute;top:-3px;width:2px;height:12px;background:var(--texto-suave);border-radius:1px}
.bc-prog-l{position:relative;height:16px;font-size:var(--fs-xs);color:var(--texto-suave)}.bc-prog-l span{position:absolute;top:0;white-space:nowrap}
.bc-prog-l span:first-child{left:0}.bc-prog-l span:nth-child(2){transform:translateX(-50%)}.bc-prog-l span:last-child{right:0}
.bc-sinais{display:grid;gap:var(--esp-3)}
.bc-sinal{background:color-mix(in srgb,var(--fundo) 55%,transparent);border:1px solid var(--borda);border-radius:var(--raio-m);padding:var(--esp-3) var(--esp-4)}
.bc-sinal p{margin:0 0 var(--esp-2)}
.bc-medidor{display:flex;align-items:center;gap:12px}.bc-medidor>div{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px}
.bc-medidor b{font-size:var(--fs-l)}.bc-dbm{font-weight:600;font-variant-numeric:tabular-nums}.bc-medidor .bc-mut{flex-basis:100%}
.bc-medidor.forte b{color:var(--cor-ok)}.bc-medidor.medio b{color:var(--cor-aviso)}.bc-medidor.fraco b{color:var(--cor-alerta)}.bc-medidor.nd b{color:var(--texto-suave)}
.bc-bars{display:inline-flex;align-items:flex-end;gap:3px;height:22px}.bc-bars i{width:6px;border-radius:2px;background:color-mix(in srgb,var(--texto) 15%,transparent)}
.bc-bars i:nth-child(1){height:8px}.bc-bars i:nth-child(2){height:14px}.bc-bars i:nth-child(3){height:22px}
.bc-bars.forte i.on{background:var(--cor-ok)}.bc-bars.medio i.on{background:var(--cor-aviso)}.bc-bars.fraco i.on{background:var(--cor-alerta)}
.bc-nivel{display:inline-flex;align-items:center;gap:6px}.bc-nivel .bc-bars{height:12px}.bc-nivel .bc-bars i{width:4px}.bc-nivel .bc-bars i:nth-child(1){height:4px}.bc-nivel .bc-bars i:nth-child(2){height:8px}.bc-nivel .bc-bars i:nth-child(3){height:12px}
.bc-link{background:none;border:0;color:var(--texto-suave);text-decoration:underline;padding:4px 0 0;font-size:var(--fs-s);cursor:pointer}
.bc-passo{display:flex;gap:var(--esp-3);align-items:flex-start;margin-top:var(--esp-5);padding:var(--esp-3) var(--esp-4);border-radius:var(--raio-m);background:color-mix(in srgb,var(--ac) 10%,transparent)}
.bc-passo p{margin:0;font-size:var(--fs-m);line-height:1.45}.bc-passo-i{color:var(--ac);font-weight:800}
.bc.longo .bc-passo p{color:var(--texto)}
.bc-led{display:flex;align-items:center;gap:8px;margin:var(--esp-3) 0 0;font-size:var(--fs-xs);color:var(--texto-suave)}.bc-led .led{transform:scale(.8)}
.bc-alerta{margin:var(--esp-2) 4px 0;font-size:var(--fs-s);color:var(--cor-alerta-texto)}
.bc-ts{margin-top:var(--esp-3)}.bc-ts summary{cursor:pointer;font-weight:700;font-size:var(--fs-s);padding:var(--esp-2) 4px;color:var(--texto)}
.bc-check{list-style:none;margin:var(--esp-2) 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--esp-2)}
.bc-check li{background:var(--fundo-card);border:1px solid var(--borda);border-radius:var(--raio-m);transition:border-color .15s,opacity .15s}
.bc-check li.prio{border-color:color-mix(in srgb,var(--cor-info) 55%,var(--borda))}
.bc-check label{display:flex;gap:10px;align-items:flex-start;padding:var(--esp-3);cursor:pointer;min-height:44px}.bc-check input{margin-top:2px;width:18px;height:18px;accent-color:var(--cor-ok)}
.bc-check b{display:block;font-size:var(--fs-m)}.bc-check small{display:block;font-size:var(--fs-s);color:var(--texto-suave);margin-top:2px}
.bc-check li:has(input:checked){opacity:.55;border-color:var(--cor-ok)}
.bc button:focus-visible,.bc input:focus-visible,.bc summary:focus-visible{outline:2px solid var(--cor-info);outline-offset:2px}
.hero-sub .bc-nivel{font-size:inherit;margin-left:4px}
@media (max-width:800px){.bc-corpo{grid-template-columns:1fr}.hbusca.bc{margin:var(--esp-2) 12px var(--esp-3)}.bc-card{padding:var(--esp-4)}.bc-trilha li{font-size:11px;flex-direction:column;align-items:flex-start;gap:4px}.bc-trilha li::after{display:none}.bc-est{font-size:var(--fs-l)}}
@media (prefers-reduced-motion:reduce){.bc *{animation:none!important;transition:none!important}}
.led.l1.on
```

byGui
