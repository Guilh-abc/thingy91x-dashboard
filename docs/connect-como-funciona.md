# Connect — Como funciona (rastreador + medidor Utilities)

## Arquitetura
```
Placa nRF9151 DK (mfw_nrf9151-ntn_1.0.1)
  ├─ Cat-M (LTE-M, SIM Telekom, APN internet.m2mportal.de) ── HTTPS ──────────────┐
  └─ Satélite NTN Skylo (PLMN 90198) ── UDP + HMAC ── relay Fly.io (gru, 37.16.27.53:4242) ─┤
                                                                                  ▼
                            Netlify Function ntn-lab (?ingest=1)  → Netlify Blobs
                              ├─ rastreador: chaves pro/AAAA-MM-DD   → painel /ntn/
                              └─ medidor (campo dv="m1"): meter/AAAA-MM-DD → painel /utilities/
```
- Mensagens compactas (≤ 256 B), fila store-and-forward na placa (24 msgs), no máximo 1 msg a cada 30 s no satélite.
- Cat-M preferencial; sem rede terrestre por 3 min (ou CEREG 91) → cai para o satélite; a cada 15 min tenta voltar ao Cat-M.
- O medidor usa token próprio (METER_DEVICE_TOKEN no Netlify, secret.conf da placa, nunca no git). Pelo satélite ele passa pelo mesmo relay UDP (HMAC), que repassa ao ntn-lab.
- Posição pública arredondada (~100 m), ICCID/IMSI mascarados.

## Medidor (app-meter m1.1)
| Botão | Toque | Segurar |
|---|---|---|
| B1 | 1 pulso = 10 L | > 1 s: consumo contínuo (100 L a cada 10 s) até soltar |
| B2 | alarme de vazamento | 3 s: violação |
| B3 | envia leitura agora | — |
| B4 | liga/desliga modo auto (fallback satélite) | 3 s: liga/desliga o **modo teste satélite** |

- **Modo teste satélite (B4 3 s):** fix GNSS → NTN (Skylo); após registrar, envia a cada 2 min uma leitura com total, consumo do intervalo (pulsos × 10 L), PLMN/operadora, RSRP/SNR e seq (sem posição, para caber em 256 B; mínimo 30 s entre msgs; fila mantida se cair). Os pulsos continuam contando. Novo B4 3 s = volta ao Cat-M. Modo auto fica suspenso durante o teste. A sonda "Varredura satélite" agora só pelo serial: `python3 meter_cmd.py probe 20`.
- **LEDs:** LED1 = Cat-M (aceso registrado, piscando buscando); LED2 = NTN (pisca lento registrado / rápido buscando); LED3 = GNSS ou transmissão; LED4 = aceso no modo teste satélite, piscada breve = modo auto, piscada curta = sonda; todos piscando = erro.
- **Intervalos:** leitura a cada 1 h (CONFIG_APP_TELEM_CATM_S/NTN_S = 3600); alarmes saem na hora.
- **Alarmes automáticos:** vazamento = fluxo contínuo por 60 min; consumo anômalo = > 500 L em 1 h; bateria baixa < 3,3 V; manuais por B2.
- **Total** persistido em NVS (a cada 1 min se mudou). **GNSS** só até fixar a posição uma vez (precisão < 50 m), depois desligado. PSM/eDRX/RAI ligados em Cat-M.
- **Modo só-satélite:** CONFIG_APP_SAT_ONLY=y no prj.conf.
- **Comandos (Mac):** `python3 meter_cmd.py 1|2|V|3|S|s|n|Z` (Z = modo teste satélite) e `python3 meter_cmd.py probe 20`; log em `logs/meter-AAAAMMDD.txt` (LaunchAgent com.guilherme.connect.meter.serial; porta pelo SN em `.meter_sn`).

## Rastreador (app-buttons v2.6)
B1 Cat-M↔NTN, B2 status, B3 telemetria agora, B4 auto (segurar 3 s = sonda). Telemetria 60 s em Cat-M / 300 s em NTN, GNSS contínuo, log de sinal do satélite (30 s) e resumo a cada 20 min. Painel: /ntn/.

## Gravação (sempre com o número de série)
- Rastreador: J-Link **1052080474** — nunca gravar firmware do medidor nele.
- Medidor: J-Link do medidor (ver LEIAME). `nrfutil device program --firmware fw/app-meter-v1.0.hex --serial-number <SN_MEDIDOR> --options chip_erase_mode=ERASE_RANGES_TOUCHED_BY_FIRMWARE,verify=VERIFY_READ`.
- O modem precisa do **mfw_nrf9151-ntn_1.0.1** (fw/mfw_nrf9151-ntn_1.0.1.zip).

## O que falta
1. SIM ativo no medidor (Telekom, roaming no Brasil e perfil NTN/Skylo habilitado).
2. Instalação fixa em céu aberto (antena com vista do céu) para o satélite e para o fix GNSS inicial.
3. Entrada de pulso real (reed switch/encoder do medidor) no lugar do botão B1.
