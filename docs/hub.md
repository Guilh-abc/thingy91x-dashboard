# Início do sistema (/app/): hierarquia

Objetivo: em menos de 5 segundos responder se está tudo saudável, o que pede atenção e qual a próxima ação.

1. **Banner de alerta crítico** (só aparece com alarme na última hora): é a única coisa que pode interromper a leitura, por isso fica acima de tudo.
2. **Faixa de 4 KPIs**: dispositivos online, dados de hoje, alertas ativos e última atualização. São as respostas para "está saudável?", em números grandes e com um selo de cor.
3. **Cartões de módulo**: cada um mostra o estado resumido do módulo e um único botão de próxima ação. A imagem do topo só identifica o módulo; no Rastreador ela vira o mini mapa da última posição real, arredondada em cerca de 100 m.
4. **Eventos recentes**: contexto de atividade, por último, porque explica os números sem competir com eles.

Regras: só dados reais ("sem dado" quando faltar), paleta verde ok, vermelho alerta, azul info, cinza neutro; ícones Lucide sem repetição; Leitor não vê Relatório nem Acessos.
Fontes: ntn-lab (Rastreador NTN e medidor), nRF Cloud com a chave salva no navegador (Thingy:91X; sem chave aparece "Sem chave" e o botão Cadastrar chave), /api/users (só admin).
