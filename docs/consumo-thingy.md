# Consumo estimado do Thingy:91X (chip Telekom, só Cat-M)

Estimado pelo tamanho do que o aparelho envia; não é a fatura da operadora. Sem custo.

Fontes no nRF Cloud (chave salva no navegador):
- `/messages`: cada mensagem conta pelo tamanho real do payload JSON (BATTERY, TEMP, HUMID, AIR_PRESS, GNSS).
- `/location/history`: cada posição conta por tipo:
  - GNSS: 193 B, média real das mensagens GNSS deste aparelho. Se a mesma posição já veio como mensagem GNSS (até 60 s), não conta de novo.
  - Wi-Fi: 74 B; célula (MCELL/SCELL): 73 B. Tamanho real médio do resultado guardado; é um piso, pois a lista de redes enviada não fica salva.
- Shadow e FOTA: o shadow não muda desde 23/09/2026 e não houve FOTA no período, então não somam.

Por que `/messages` para em 06/10/2026: a consulta está correta (sem filtro de appId, com e sem ordem, com e sem datas); a API não tem nenhuma mensagem depois de 06/10 04h34 (UTC). Desde então o aparelho só alimenta o histórico de localização.
