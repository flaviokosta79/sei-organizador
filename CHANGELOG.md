# Changelog

## 0.22.4 — 2026-11-06

**Extensão (não requer reimplantar a API)**

- Identidade fixa da extensão:
  - O `manifest.json` passa a ter uma chave pública (`key`). Com ela, o ID da extensão é sempre `koonfhnchakocaeefddpcahmianpcobo`, de qualquer pasta de onde for carregada.
  - Antes, o Chrome calculava o ID pelo caminho da pasta, e cada computador tinha um ID diferente. Mudar a pasta de lugar apagava os dados guardados no navegador.
  - Atualizar extraindo o ZIP novo sobre a mesma pasta, ou trocar a pasta de lugar, mantém os dados do navegador. Uma pasta no disco compartilhado não serve para carregar a extensão: o servidor de arquivos da unidade bloqueia arquivos `.js` e `.mp3`. O ZIP de cada versão fica em `R:\sei-organizador`.
  - **Na primeira instalação da 0.22.4, cada navegador perde uma única vez os dados guardados nele**, porque o ID muda: bloco de trabalho escolhido, lista de chefes de seção, avisos marcados como vistos e preferências do card. O bloco é escolhido de novo automaticamente ao abrir um bloco interno, e a lista de chefes precisa ser informada outra vez. Classificações, status, assuntos e vistos compartilhados ficam no servidor e não são afetados.
  - A chave privada fica fora do Git (`artifacts/keys/`); ela só é necessária para gerar um `.crx` assinado ou publicar com o mesmo ID.

## 0.22.3 — 2026-11-06

**Extensão (não requer reimplantar a API)**

- Alerta de assinatura confirmada voltou a funcionar no uso real:
  - Desde a 0.16.2, as leituras de fundo não rodam na tela do processo, para não disputar a sessão com a árvore e os documentos. Mas o endereço do andamento só era guardado durante essas leituras, e só existe na tela do processo, que abre em outra aba. Resultado: nenhum andamento era lido, e o alerta nunca disparava. No teste no SEI real de 2026-11-06, não houve nenhuma leitura de andamento.
  - Agora a tela do processo só registra o endereço do andamento, sem nenhum pedido ao SEI. O registro fica na sessão do navegador (`chrome.storage.session`), é compartilhado pelas abas e guarda no máximo os 300 processos mais recentes por usuário e bloco. Nada vai para o armazenamento local nem para a API.
  - Uma aba de lista lê esses andamentos no ciclo normal: até 5 por ciclo, cedendo a vez à navegação.
  - As páginas extras de um andamento longo, lidas pelo monitor, passam a esperar a vez como as demais leituras de fundo. O card do processo, que é pedido pelo usuário, continua lendo sem espera.
- Menos chamadas à API própria:
  - No teste no SEI real, cada navegador fazia cerca de 37 chamadas por minuto. Cada página carregada sincronizava o painel duas vezes, além do alarme de 1 minuto. Essas chamadas não afetam o SEI, só o servidor da extensão, e se multiplicam com o número de usuários.
  - Alertas do bloco: a leitura do estado compartilhado é reaproveitada por 20 s. Quando uma consulta ao bloco vai começar, ou quando este navegador grava algo, a leitura é refeita.
  - Assinaturas: a sincronização é reaproveitada por 20 s. Uma assinatura registrada por um colega aparece aqui em até 20 s a mais. As observações enviadas por este navegador renovam a leitura na hora.
  - Presença nos editores: a mesma consulta é reaproveitada por 15 s. Um colega que abre um editor aparece em até 15 s a mais. Um aviso de edição deste navegador renova a consulta.

## 0.22.2 — 2026-11-06

**Extensão (não requer reimplantar a API)**

- A lista de Blocos de Assinatura não é mais lida:
  - Em 6 de 13 tentativas no SEI real, uma das páginas dessa lista levou cerca de 35 s. Como o SEI atende um pedido por vez em cada sessão, o clique seguinte do usuário (Blocos Internos, por exemplo) esperou o mesmo tempo. Medido em 2026-11-06: leitura da extensão aos 247 s, clique do usuário aos 248 s e resposta só 33,9 s depois.
  - O bloco de assinatura agora vem do próprio andamento do processo. Só documentos entram em blocos de assinatura ou de reunião ("Documento … inserido no bloco N"). Processos entram em blocos internos ("Processo inserido no bloco N") e continuam ignorados. O resultado na amostra real de andamento é idêntico ao da versão anterior.
  - Um documento incluído em bloco de reunião e depois assinado também gera o aviso de assinatura.
  - O acompanhamento lê apenas os andamentos dos processos já abertos pelo usuário, como antes.
- Substitui a 0.22.1, que só espaçava a leitura da lista (a cada 15 minutos, com espera após falha) e não chegou a ser publicada.

## 0.22.1 — 2026-11-06

**Extensão (não requer reimplantar a API)**

- Lista de Blocos de Assinatura lida com muito menos frequência:
  - O acompanhamento de assinaturas lia todos os blocos de assinatura da unidade a cada 2 minutos, em cada aba. No SEI real, essa consulta passou de 15 s em 6 de 13 tentativas. O SEI continua processando o pedido mesmo depois que a extensão desiste.
  - Agora a lista é lida no máximo a cada 15 minutos, uma vez para todas as abas do navegador. As abas compartilham só o horário e os números dos blocos, nunca endereços autenticados.
  - Depois de uma falha ou estouro de tempo, a próxima tentativa espera 30 min, depois 60 min e, a partir daí, 2 h. Uma leitura bem-sucedida volta ao intervalo normal.
  - Se a lista falhar, o acompanhamento continua com os blocos já conhecidos e avisa no painel.
  - Sem nenhum bloco conhecido, os andamentos não são lidos, porque nenhum deles poderia gerar alerta.
  - Ao abrir a tela Blocos de Assinatura, os blocos exibidos entram no acompanhamento sem leitura extra.
- Medição no SEI real (2026-11-06, 6 rodadas alternando com e sem a extensão): servidor do SEI com os mesmos tempos com e sem a extensão, nenhuma tarefa longa no navegador e chamadas à API própria sem efeito no SEI. Blocos Internos teve travas de cerca de 35 s nas duas situações, inclusive com a extensão desligada.

## 0.22.0 — 2026-11-06

**Servidor (requer reimplantar a API)**

- Saída do bloco confirmada:
  - Um processo só perde assuntos e status quando duas leituras completas, com pelo menos 30 s entre elas, deixam de encontrá-lo. Se ele voltar a aparecer nesse meio-tempo, a contagem recomeça.
  - Antes, uma única lista vazia, parcial ou forjada apagava toda a organização do bloco, sem desfazer.
  - Na prática, a limpeza de um processo que saiu do bloco acontece uma rodada depois.
- Limites:
  - Ids de bloco têm até 30 dígitos em todas as rotas.
  - Cada unidade guarda estado de no máximo 500 blocos; os blocos já conhecidos continuam aceitos.
  - A API é pública, e sem esses limites o volume podia ser enchido.
- Mensagens úteis:
  - Erros de validação que o usuário pode corrigir aparecem como são, por exemplo:
    - "O nome da aba deve ter de 1 a 80 caracteres."
    - "Limite de 100 abas atingido neste bloco."
    - "Esta aba não existe mais."
  - Os demais continuam com a mensagem genérica.
- Cabeçalhos e conexões:
  - As respostas levam `X-Content-Type-Options: nosniff`.
  - O keep-alive passa a 95 s, acima do reaproveitamento de conexões do Traefik, para evitar 502 esporádicos.
- Docker:
  - Imagem base fixada por digest.
  - `HEALTHCHECK` na própria imagem.
  - `NODE_ENV=production` e temporários do SQLite em `/tmp`.
- Stack:
  - Sistema de arquivos raiz só leitura (`read_only`), com `/tmp` em memória (64 MB).
  - `cap_drop: ALL`.
  - O app continua gravando apenas no volume `/data`.

**Extensão**

- Ao fechar um documento que não monta card (por exemplo, PDF), o resumo do processo volta após 2 s, em vez de a área ficar vazia.
- O fim da rodada do monitor é avisado mesmo quando a aba líder sai no meio, e as outras abas se atualizam na hora.
- Checkbox oculto e desabilitado também sai da seleção nativa do SEI.
- Configurações: uma troca de usuário durante "Salvando…" deixa uma mensagem clara, em vez de o texto ficar preso.
- Opções:
  - Um bloco salvo que não está no catálogo não permite mais salvar vazio; a seleção começa pelo primeiro bloco listado.
  - "Salvar" fica desabilitado sem bloco.

**Testes**

- 226 testes, todos passando. Os novos cobrem:
  - API em modo público: 413, 415, JSON malformado, id longo, mensagens e `nosniff`;
  - confirmação da saída do bloco;
  - limite de blocos;
  - página de opções: uma aba só e bloco vazio;
  - checkbox desabilitado.

**Não alterado**

- Os timers de tempo limite do ritmo terminam sozinhos, no máximo ao fim do prazo de cada leitura. Ficaram como estão.

Após atualizar, recarregar todas as abas do SEI.

## 0.21.1 — 2026-11-06

- Recebidos da Secretaria:
  - Listas que cabem numa página voltam a ser lidas. O SEI só mostra o intervalo (" - 1 a 40") na legenda quando há mais de uma página. Antes, com 40 recebidos ou menos, a leitura falhava em toda rodada e os pendentes ficavam congelados.
  - Uma lista sem intervalo só é aceita na primeira página e com todos os processos presentes.
- Leituras longas renovam a reserva:
  - Valem para blocos, recebidos e assinaturas. A cada página lida (no máximo a cada 20 s), a reserva de 180 s é renovada.
  - Antes, com o SEI lento, a leitura podia terminar depois da reserva e ser recusada como "substituída" em toda rodada.
  - Nas assinaturas, a reserva vencida também permitia uma varredura paralela em outra aba.
- Ritmo das leituras:
  - A vez só é devolvida depois de receber a página inteira, não só os cabeçalhos. A medição de lentidão passa a incluir o corpo.
  - Esperas sobrepostas na mesma aba contam uma vez só no tempo limite. Antes, uma sobreposição deixava um timer rodando sem fim.
  - Os listeners de espera são removidos ao fim de cada espera.
- Opções:
  - "Atualizar" pede a lista de blocos a uma única aba do SEI: a ativa primeiro, a seguinte só se a primeira falhar. Antes, todas as abas consultavam ao mesmo tempo.
  - A leitura segue o ritmo das demais leituras de fundo e não aceita redirecionamento.
- 221 testes, todos passando. Os novos cobrem:
  - legenda sem intervalo;
  - renovação da reserva de recebidos e do monitor;
  - esperas sobrepostas;
  - vez devolvida só após o corpo.
- Somente extensão. Após atualizar, recarregar todas as abas do SEI.

## 0.21.0 — 2026-11-06

**Funcionamento**

- Restauração de backup do servidor:
  - Recebidos e alertas de "Assinar" deixam de travar quando o serviço volta com versões menores.
  - Na segunda leitura seguida com versão menor, a base é refeita sem alerta. Os avisos seguintes voltam a funcionar.
- Servidor, limpeza dos 60 dias:
  - A limpeza mantém sempre a assinatura mais recente.
  - Sem isso, o SQLite reaproveitava o id dela e novas assinaturas podiam não gerar alerta.
  - Requer reimplantar a API.

**Desempenho**

- Monitor: as abas redesenham uma vez por rodada, ao terminar, e não a cada bloco lido. Com 20 blocos, eram cerca de 20 rajadas de chamadas à API por aba visível em cada ciclo.
- Servidor: `signatures/sync` não regrava o vínculo do usuário quando o bloco não mudou. Requer reimplantar a API.
- Card do processo:
  - Ao trocar de documento, o resumo do processo não é mais montado e descartado em seguida. A árvore espera 250 ms e só o recria se nenhum documento estiver aberto.
  - Os listeners de cada card saem junto com ele, sem acumular na janela da árvore.
- Andamento guardado na sessão:
  - Entradas vencidas (60 s) são removidas e no máximo 3 ficam guardadas, por meio de um índice.
  - Sobras de versões anteriores são apagadas.
  - Antes, o armazenamento da sessão do SEI podia esgotar.
- Página do bloco:
  - O deslocamento do cabeçalho fixo fica na linha do cabeçalho. Na tabela, ele recalculava o estilo de todas as células a cada quadro de rolagem.
  - As linhas são lidas uma vez por mudança da tabela, não a cada clique.
  - Mudanças de texto nos próprios controles ("Copiado") e rótulos de outros módulos ("Novo", presença de edição) não disparam outra passada completa.
- Tema: só folhas de estilo carregadas reavaliam o tema, não cada imagem ou script.
- Bloco de trabalho em memória no service worker: as requisições à API e à presença de edição não leem mais o armazenamento inteiro a cada vez. A memória é invalidada quando os dados mudam.

**Uso**

- Menu de contexto não fecha quando o próprio menu rola.
- A atualização de 10 s mantém o status escolhido em "Status dos selecionados…" e o foco do teclado. Com um menu aberto, a mudança de um colega espera a próxima atualização.
- Conflito com colega:
  - Atribuir, retirar assunto e mudar status são repetidos uma vez sobre o estado novo, em vez de se perderem.
  - Nas demais ações, a mensagem passa a ser "confira e tente novamente", sem mandar recarregar.
- Falha passageira de conexão:
  - Ao reconectar, volta para a aba e o filtro escolhidos.
  - Enquanto continua offline, a página não é redesenhada a cada 10 s.
- O histórico aberto se atualiza após uma alteração ou a mudança de um colega. Depois de salvar, não há mais uma leitura extra.
- Ao voltar a uma aba do SEI, os dados do bloco são atualizados na hora.
- Presença de edição:
  - O aviso de "encerrou" nunca chega antes de um aviso ainda em envio. Antes, o colega podia aparecer editando por até 90 s depois de fechar.
  - A troca de bloco consulta uma vez, não duas.
  - Processos que entram na tela durante uma consulta são consultados logo em seguida.
- Bloco de trabalho:
  - Uma falha passageira é tentada de novo após 2, 4 e 6 s.
  - Trocar de bloco não derruba o card do documento aberto: cada frame refaz só o próprio card.
- Histórico: entradas "limpou status… retirados do bloco" ganham estilo próprio e mostram os 20 primeiros processos e quantos faltam.

**Não alterado**

- A coluna Assunto continua sendo removida e recriada ao alternar Geral/assunto. Mudar isso mexe no layout e no colgroup da tabela, e o ganho é pequeno.
- O parâmetro `force` do monitor continua: os testes o usam para forçar a rodada.

**Testes e atualização**

- 217 testes, todos passando. Os novos cobrem:
  - restauração de backup em recebidos e "Assinar";
  - id preservado na limpeza;
  - redesenho único por rodada;
  - espera do resumo do processo;
  - limite e limpeza do andamento na sessão;
  - ordem dos avisos de edição;
  - repetição no conflito;
  - menu que rola;
  - volta à aba após reconexão;
  - nova tentativa do bloco de trabalho;
  - resumo das saídas do bloco.
- A extensão funciona com a API atual. Os dois ajustes de servidor valem após reimplantar. Depois de atualizar, recarregar todas as abas do SEI.

## 0.20.1 — 2026-11-06

Correções da 0.20.0 e da seleção nativa nas abas.

- Seleção nativa:
  - O que mudou: ao trocar de aba de assunto ou de filtro, as linhas ocultas são desmarcadas pelo próprio clique do SEI. Assim, saem também do `hdnInfraItensSelecionados`.
  - O problema: antes, o processo ficava desmarcado na tela, mas continuava sendo enviado nas ações nativas, como "Retirar do bloco".
  - "Selecionar todos" do SEI também desmarca em seguida as linhas ocultas.
- Uma leitura de fundo por vez em todas as abas: o service worker distribui a vez de leitura do SEI.
  - Cada leitura é espaçada pelo tempo da última resposta (de 1 a 10 s) e espera a navegação assentar, no máximo 5 s.
  - Na 0.20.0, abas diferentes podiam ler o SEI ao mesmo tempo.
- Tempos limite contam só a leitura:
  - O limite de 15 s por requisição e os limites totais (bloco 120 s, Controle de Processos 170 s, assinaturas 110 s) não descontam mais a espera pela vez.
  - Na 0.20.0, com o SEI lento, a leitura estourava o prazo antes de sair.
  - O prazo da varredura de assinaturas passou de 120 para 180 s.
- Recebidos não aparecem mais como "Leitura antiga… aviso sonoro suspenso" só porque a rodada foi adiada pela navegação ou pelo SEI lento.
  - A tolerância passa a ser o maior intervalo normal entre rodadas, mais 90 s.
  - Rodadas adiadas pela navegação passam a acontecer no máximo a cada 2 min, e não mais a cada 5 min.
- Recuo com o SEI lento:
  - A medição é feita no service worker, valendo para todas as abas.
  - O intervalo maior fica guardado na sessão do navegador e sobrevive ao reinício do service worker.
  - Sem medições suficientes, o intervalo não muda.
- Cancelar uma leitura durante a espera pela vez agora a interrompe na hora.
- 208 testes, todos passando. Novos testes cobrem:
  - uma leitura por vez entre abas;
  - o tempo limite sem a espera;
  - o cancelamento;
  - o recuo guardado entre reinícios;
  - a tolerância dos recebidos;
  - a seleção nativa das linhas ocultas.
- Somente extensão. Após atualizar, recarregar todas as abas do SEI.

## 0.20.0 — 2026-11-06

Páginas do SEI mais rápidas com a extensão carregada. As leituras de fundo (blocos monitorados, assinaturas e Controle de Processos) usam a mesma sessão do SEI que a navegação, e o SEI atende uma requisição por vez por sessão. Por isso essas leituras agora dão passagem à navegação.

- Prioridade para a navegação: cada frame do SEI avisa o service worker ao começar a carregar, ao sair, ao clicar e ao terminar (`activity.js`, no início do documento).
  - Uma rodada de leituras só começa depois de 15 s sem navegação, ou se ficou 5 min sem rodar.
  - Durante a rodada, cada leitura espera 2,5 s após a última navegação (até 5 s por leitura) antes de ir ao SEI.
- Ritmo das leituras de fundo (`pace.js`): pelo menos 1 s entre uma requisição e a seguinte, ou o tempo da última resposta, até 10 s.
  - Se o SEI estiver lento (mediana acima de 4 s), o intervalo entre rodadas dobra, até 5 min, e volta a 55 s quando o SEI se normaliza.
  - O card do processo e as páginas do andamento, pedidos pelo usuário, não esperam.
  - Os tempos máximos de leitura completa de um bloco (120 s) e do Controle de Processos (170 s) foram ampliados para acomodar o ritmo.
- Assinaturas: a lista de blocos de assinatura passa a ser relida a cada 2 min, e não mais a cada página aberta. O horário da última leitura fica guardado na aba junto com o resto do acompanhamento.
- Inicialização única: card do processo, presença de edição, usuários, filtro do andamento, monitor, abas e bloco de trabalho não reiniciam mais no carregamento inicial (o evento `pageshow` também dispara nele). Só reiniciam ao voltar pelo histórico do navegador.
- Teste do card ("card prioriza controles…") com datas relativas ao relógio do teste, sem depender do dia em que roda.
- 206 testes, todos passando. Novos testes cobrem a prioridade para a navegação, o ritmo e o limite de espera, o recuo com SEI lento, o manifesto e a lista de assinatura entre navegações.
- Somente extensão; a API não muda. Após atualizar, recarregar todas as abas do SEI.

## 0.19.0 — 2026-11-05

- Vistos em lote: "Marcar como visto" envia todos os processos do bloco numa única requisição (`POST /processes/opened`, até 1.000 por envio), em vez de uma por processo. A fila é gravada e enviada uma vez, e as pendências só são limpas depois do envio. Com a API anterior, a extensão volta a enviar um por um.
- Leituras compartilhadas: abas, card do processo e monitor do mesmo navegador usam uma única consulta ao estado e ao histórico do bloco por janela de 4 s, com cópias independentes. Uma gravação no bloco invalida o cache, e leituras iniciadas antes dela não são reaproveitadas.
- Presença de edição: entradas indexadas por processo, página lida uma vez por varredura, e os próprios rótulos não disparam nova varredura.
- Leitura do usuário logado uniforme entre os módulos; o login é normalizado em minúsculas na origem.
- Retenção no servidor (política aprovada pelo usuário):
  - mantém as 300 alterações mais recentes do histórico por bloco (a tela mostra 100);
  - mantém 60 dias de aberturas de processo e de acompanhamento de assinaturas;
  - roda na inicialização e uma vez por dia; o estado atual dos blocos não é alterado.
- Mantidos por decisão do usuário: o áudio confirma ao terminar o som, e a lista de blocos de assinatura é relida a cada página.
- 198 testes; 197 passaram. A falha restante ("card prioriza controles…") já existia antes da 0.18.0. Novos testes cobrem retenção, abertura em lote (servidor, HTTP e extensão, com retorno à API anterior) e cache de leituras com invalidação.
- A API precisa ser reimplantada para o lote e a retenção; a extensão funciona com a API 0.18.0. Após atualizar, recarregar todas as abas do SEI.

## 0.18.0 — 2026-11-05

- Monitor: o alarme de 1 minuto escolhe uma única aba para consultar o SEI (aba ativa primeiro, páginas de processo por último). Ela confirma na hora se pode consultar; as demais só redesenham. Abas ocultas adiam a atualização até ficarem visíveis. Assinaturas são sincronizadas uma vez por ciclo, e a varredura não repete a consulta de alertas.
- Storage: monitor, recebidos e assinaturas só gravam quando o conteúdo muda; o badge só é reescrito quando a contagem muda. O bloco de trabalho deixa de gravar a cada página aberta; a data de último uso é renovada no máximo a cada hora.
- Áudio: a criação do documento offscreen é única mesmo com sons simultâneos de monitor, assinaturas e recebidos, evitando falso "Som indisponível".
- Manifesto: scripts compartilhados deixam de ser injetados duas vezes no frame principal.
- Andamento: cada linha é lida uma vez. A reordenação não dispara nova passada, e mudanças dentro das células são ignoradas.
- Lista do bloco:
  - contagens de abas e status são feitas em uma passada;
  - o histórico é indexado antes de desenhar;
  - o cabeçalho fixo é medido e movido uma vez por frame durante a rolagem.
- Corrigida perda da troca de bloco quando o aviso chegava durante uma leitura em andamento.
- Background: endereço do serviço, opções de requisição, fila serial e validação de identidade passam a ser compartilhados (service-client.js). A exigência de HTTPS passa a valer para todas as chamadas à API.
- API:
  - corpo JSON decodificado só depois de juntar os pacotes, corrigindo acentos corrompidos quando um caractere caía na divisa entre dois pacotes;
  - consultas SQLite preparadas uma vez;
  - verificação de pendências com Set em vez de busca linear;
  - abertura de processo com bloco só relê esse bloco;
  - limpeza de presença no máximo a cada 5 s, e o limite de editores conta só sessões ativas;
  - PRAGMA synchronous=NORMAL e busy_timeout;
  - falhas do banco respondem 500 e são registradas no log;
  - desligamento fecha conexões ociosas.
- 194 testes; 193 passaram. A falha restante ("card prioriza controles…") já existia antes desta versão. Novos testes cobrem acentos divididos entre pacotes, escolha da aba líder, ausência de regravação sem mudança e troca de bloco durante leitura.
- A API precisa ser reimplantada para as correções do servidor; a extensão é compatível com a API anterior. Após atualizar, recarregar todas as abas do SEI.

## 0.17.2 — 2026-10-28

- Corrigida leitura quadrática da árvore: documentos, unidades geradoras e assinaturas passam a ter índices, preservando todas as pendências. Árvore analisada é reutilizada no contexto da própria árvore e invalidada se o script nativo mudar.
- Card monta inicialmente até 20 pendências e oferece Mostrar mais pendências em lotes de 20, com total explícito quando houver mais. Todos os documentos permanecem acessíveis, sem consultas adicionais.
- Atualização das colunas suspende o observador durante as próprias alterações, evitando outra varredura completa. Eliminada busca quadrática de linhas já reconhecidas; marcadores Novo são reaproveitados e estilos do cabeçalho só são escritos quando mudam. Clicar no link de processo não recalcula seleção em lote.
- Monitor de edição só inicia nas páginas em que há editor, lista de bloco ou card da árvore; visualização de documentos deixa de instalar observador e temporizador de presença. A presença no card permanece no frame da árvore.
- Chromium com dados sintéticos: card de 7.000 documentos passou de 2.926 ms para 102 ms; com 3.000, de 508 ms para 50 ms. Evidência em referencias/validacao/performance-0.17.2.json. Não é medição da sessão real nem do carregamento nativo do SEI.
- 190 testes passaram; sintaxe e formatação aprovadas. Regressões cobrem árvores grandes, reutilização entre contextos e invalidação, acesso a todas as pendências por lotes, ausência de varredura duplicada e de monitor em visualização, além de preservar o marcador Novo em atualizações repetidas.
- Alteração somente na extensão, sem reimplantação da API/VPS. Após atualizar, fechar/reabrir ou recarregar todas as abas do SEI para substituir os scripts antigos.

## 0.17.1 — 2026-10-28

- Botão de configurações do cabeçalho usa engrenagem vetorial em âmbar, com ícone de 24 px e área de clique de 32 px, alinhado aos ícones nativos. Texto Organizador removido para reduzir espaço; dica, nome acessível, foco visível e abertura do modal preservados.
- 34 testes relacionados passaram; sintaxe/formatação aprovadas. Chromium conferiu ícone compacto, abertura do modal, Escape/retorno de foco e cabeçalho em 320 px. Sem mudança na API/VPS.

## 0.17.0 — 2026-10-28

- Configuração de chefes no modal oferece sugestões por nome ou login, com busca sem acentos, seleção por mouse/teclado e inclusão somente do login, sem duplicar usuários. Cadastro só é aplicado ao clicar em Salvar chefes; digitação manual permanece disponível.
- Inclui catálogo inicial de 65 usuários do 5º CPA, extraído do seletor selAtribuicao fornecido pelo usuário. Não é uma consulta em tempo real ao diretório. Ao abrir a página nativa de atribuição na unidade/órgão configurados, a lista visível atualiza o catálogo local automaticamente, sem alterar a seleção ou confirmar atribuições.
- Nomes, logins do catálogo e IDs da atribuição não são enviados à API compartilhada. Apenas os logins escolhidos continuam salvos na configuração local de chefes. Sem novas requisições ao SEI, novas permissões ou observadores de usuários nas páginas comuns.
- 185 testes passaram; sintaxe/formatação aprovadas. Chromium validou busca e seleção por teclado, salvamento somente de logins e modal de 320 px sem rolagem horizontal. Atualização automática na sessão real ainda precisa ser conferida. Sem mudança na API 0.16.4/VPS.

## 0.16.6 — 2026-10-28

- Modal de configurações no cabeçalho do SEI permite escolher e salvar o bloco de trabalho e atualizar o catálogo, sem abrir as opções externas. Usa o usuário conectado, mostra número + descrição e aplica a escolha às páginas abertas.
- Seleção de bloco e rascunho dos chefes são preservados durante as ações; erros ficam no modal e permitem tentar novamente. Catálogo só é consultado no SEI por ação explícita no botão Atualizar lista.
- 180 testes passaram; sintaxe e formatação aprovadas. Regressões verificam salvamento e atualização no modal, preservação do rascunho, recuperação após falha e isolamento por usuário.
- Página de opções da extensão permanece como alternativa para administrar perfis locais. Sem novas permissões ou mudanças na API/VPS.

## 0.16.5 — 2026-10-28

- Alerta da Secretaria não toca nem cria notificação a partir de leitura compartilhada com mais de 90 segundos. Leituras com horário mais de 30 segundos no futuro também não geram aviso. O painel informa a leitura antiga e aguarda confirmação recente no SEI.
- Leituras antigas não consomem referências ainda não avisadas: se o processo continuar pendente numa confirmação recente, o alerta ocorre uma vez; se tiver sido recebido ou retirado, não ocorre. Primeira leitura continua silenciosa.
- 177 testes passaram; sintaxe e formatação aprovadas. Regressões verificam leitura antiga sem aviso, confirmação posterior com aviso único em dois navegadores e processo já recebido sem alarme atrasado.
- Correção somente na extensão, compatível com a API 0.16.4, sem aumentar consultas nem reimplantar a VPS. Não identifica retroativamente a causa do aviso relatado sem número e horário do processo.

## 0.16.4 — 2026-10-28

- API reutiliza o histórico calculado enquanto os dados não mudam. Cache limitado a 16 blocos e 512 KiB serializados por entrada; devolve cópias independentes e invalida após gravações e alterações por outras conexões SQLite. Sem migração ou remoção de dados.
- Respostas da API incluem Server-Timing para separar processamento do servidor e tempo total de rede.
- Amostra no bloco 1343: mediana HTTPS do histórico de 30,6 ms para 18,4 ms; cálculo interno de cerca de 12,5 ms para 0,6 ms nas leituras repetidas. Primeira leitura continua calculando o histórico completo. Evidência em deploy/performance-0.16.4.json; não mede carregamento de documentos no SEI.
- 175 testes passaram; sintaxe/formatação aprovadas. Imagem validada em container isolado, implantada pela stack 18 do Portainer, editor e administração preservados, atualização completed e container healthy. Banco íntegro com 2 blocos e 293 registros de histórico preservados, backup e rollback preparados.
- Comportamento da extensão preservado; manifesto e distribuição atualizados para manter a versão alinhada com a API. ZIP com nome fixo sei-organizador-extension.zip.

## 0.16.3 — 2026-10-28

- Atualizações periódicas da lista não iniciam uma segunda leitura enquanto a anterior está em andamento, evitando consultas sobrepostas em conexões lentas.
- Leitura de identidade e catálogo de blocos agrupa alterações do DOM em intervalos de 50 ms, com cancelamento ao sair da página.
- Card indexa os links dos documentos uma vez por montagem, em vez de percorrer todos os links para cada pendência. Mantém abertura pelos links nativos.
- ZIP de distribuição passa a usar o nome fixo sei-organizador-extension.zip, com link permanente para a versão mais recente.
- 172 testes passaram; sintaxe e formatação aprovadas. Regressões cobrem consulta lenta, recuperação após erro, leitura agrupada de catálogo e reconhecimento de alterações nativas.
- Ajustes somente na extensão, sem reimplantação da API. Desempenho na sessão real do SEI ainda precisa ser medido.

## 0.16.2 — 2026-10-28

- Telas de processo/documento deixam de iniciar varreduras automáticas de blocos, recebidos e assinaturas no SEI. Sincronização dos avisos pela API permanece ativa; as varreduras continuam nas demais telas.
- Card mostra informações locais imediatamente e aproveita andamento completo recente em cache. Sem cache, o botão Consultar andamento permite solicitar os dados sem iniciar consultas adicionais apenas por selecionar um documento.
- 170 testes passaram; sintaxe e formatação aprovadas. Regressões verificam ausência de consultas ao selecionar documento, carregamento explícito e bloqueio de varreduras no processo.
- Correção somente na extensão, sem reimplantação do serviço. Validação de desempenho e abertura de documentos na sessão real pendente.

## 0.16.1 — 2026-10-28

- Consultas automáticas ao SEI aguardam 1,5 segundo após o carregamento da página, dando prioridade à navegação. Painel e reconhecimento de abertura continuam disponíveis durante a espera.
- Consultas do card, incluindo paginação do andamento, são canceladas ao sair ou substituir o card.
- Listas de blocos preservam os controles quando a versão compartilhada não muda e evitam uma segunda varredura causada pelas próprias alterações na tabela. Observações de presença de edição são agrupadas em intervalos de 50 ms.
- 169 testes passaram; sintaxe e formatação aprovadas. Regressões cobrem espera antes da consulta automática, cancelamento ao sair e preservação dos controles sem mudança de versão.
- Ajuste somente na extensão, sem reimplantação da API. Ganho de tempo na sessão real do SEI ainda precisa ser medido.

## 0.16.0 — 2026-10-27

- Usuários que escolheram o bloco 1396 — Secretaria recebem contador, lista de pendências, notificação e som Novo SEI para novas chegadas ainda não recebidas na unidade. A primeira leitura mostra o estoque sem som; consultas repetidas não repetem o aviso.
- Leitor do Controle de Processos usa os marcadores nativos de recebimento, inclui processos sigilosos acessíveis e percorre todas as páginas de Recebidos. Formulário e paginação conferidos nos dois HTMLs fornecidos; teste completo com 217 registros em seis páginas. Filtros são normalizados em documento separado; a tela visível permanece intacta.
- Pendências são compartilhadas em tabela própria, com versões para rejeitar consultas substituídas, tokens por chegada e preservação da última leitura em falhas, sessão expirada ou páginas incompletas. Não interfere em assuntos, status, históricos e alertas de inclusão no bloco 1396. Abrir ou marcar um aviso como visto não confirma recebimento; a listagem do SEI deve confirmar a mudança.
- Consultas automáticas não abrem processos para registrar recebimento. O monitor de assinaturas passa a usar apenas URLs de andamento obtidas de processos já abertos pelo usuário, preservadas na sessão; referências antigas que abriam processos são descartadas.
- API com rota de recebidos restrita à unidade fixa, validação de Secretaria, limite de 10.000 processos e corpo de 2 MiB. Nenhuma nova permissão, token ou configuração de serviço.
- 167 testes passaram; sintaxe e formatação aprovadas. Inclui os dois HTMLs reais, seis páginas/217 processos, fluxo completo do painel, dois navegadores, reinício, falhas, reenvio, silenciamento, isolamento de classificações e restrição ao bloco 1396. Conferência de uma nova chegada na sessão real do SEI pendente.
- API implantada pela stack 18 do Portainer, com backup íntegro, volume e 278 registros de histórico preservados. Editor e administração disponíveis, atualização completed, container healthy e oito módulos conferidos por SHA-256. Rotas de recebidos validadas por HTTPS.

## 0.15.1 — 2026-10-27

- Removida a faixa “Organizador ativo somente no bloco” e o botão de escolha das páginas de outros blocos. A escolha continua nas opções da extensão; o Organizador permanece restrito ao bloco escolhido, preservando os controles nativos dos demais.
- Ajuste somente na extensão, compatível com a API 0.15.0, sem reimplantação do serviço.

## 0.15.0 — 2026-10-27

- Assinaturas efetivas do SEI geram alerta visual, notificação do sistema e som Assinar para todos os usuários que escolheram o mesmo bloco interno nas opções da extensão. Mostra número do documento, nome/login do assinante, data/hora e bloco de assinatura. Inclusão é atribuída ao usuário registrado pelo SEI; não depende do status manual nem da lista de chefes.
- Descobre documentos nos blocos de assinatura da unidade e confirma inclusões/assinaturas no histórico completo. Rodízio limitado a três blocos e cinco processos por ciclo; URLs autenticadas permanecem na sessão do navegador. Mantém processos já descobertos durante navegações e após retirada do documento do bloco. Históricos parciais e falhas de sessão são indicados sem presumir assinaturas.
- API compartilha eventos por bloco interno, deduplica observações de múltiplos navegadores e preserva o grupo de origem das inclusões já acompanhadas. Reconhecimento de assinatura é individual por navegador, com cursor persistente e retomada após falha de conexão. Primeira sincronização não reapresenta eventos anteriores; usa o som e o silenciamento existentes.
- 156 testes passaram, incluindo amostra real do andamento, duas instâncias de navegador, autoria do assinante, retirada/reinclusão, persistência, isolamento por bloco, HTTP e painel. Sintaxe e formatação aprovadas; prévia no Chromium. Validação de uma nova assinatura em sessão real do SEI permanece pendente.
- API 0.15.0 implantada pela stack 18 do Portainer: backup íntegro, 278 registros de histórico e volume preservados, administração/editor disponíveis, atualização completed, container healthy e sete módulos do servidor conferidos por SHA-256. Rollback pela configuração anterior, preservando o banco; tabelas de assinatura são aditivas.

## 0.14.2 — 2026-10-27

- Escolha do bloco de trabalho mostra número + descrição do SEI. Texto de ajuda atualizado; descrições já conhecidas são preservadas ao reabrir páginas sem o campo de descrição.
- Correção somente na extensão, sem reimplantação da VPS.

## 0.14.1 — 2026-10-27

- Corrigido o card que carregava e desaparecia quando não encontrava inclusão no bloco escolhido. O resumo do processo permanece visível; somente status, assuntos e seus controles ficam restritos ao bloco de trabalho.
- Card informa inclusão não encontrada, histórico incompleto ou necessidade de escolher um bloco, sem exibir classificações de outros blocos. Corrigida também a ausência do resumo antes da primeira escolha.
- Lista de escolha usa número + Grupo do SEI, lido pelo cabeçalho da tabela nativa, independentemente da posição da coluna. Grupo vazio aparece como Sem grupo; grupo ainda não lido é identificado explicitamente. Abrir o bloco novamente preserva o grupo já conhecido, sem substituí-lo pela descrição.
- Correção somente na extensão, compatível com a API 0.14.0, sem reimplantação da VPS.
- 149 testes passaram; sintaxe e formatação aprovadas. Opções com número/grupo conferidas no Chromium, ZIP conferido por SHA-256. Relógio dos testes do card fixado para evitar falhas na virada do minuto. Conferência no SEI real pendente.

## 0.14.0 — 2026-10-27

- Opções permitem escolher o bloco de trabalho por unidade, órgão e login neste navegador. O primeiro bloco reconhecido é escolhido automaticamente; salvar outra escolha aplica a alteração às páginas abertas. Lista de blocos pode ser atualizada pela sessão do SEI, sem endereço ou token manual.
- Organizador, card, alertas, vistos e avisos de edição ficam restritos ao bloco escolhido. Em outros blocos, a lista nativa é preservada com aviso e acesso às opções. Trocar a preferência não limpa classificações do bloco anterior. Edição aparece na linha do processo na página do bloco escolhido.
- Consulta completa e não filtrada limpa status e vínculos com assuntos de processos ausentes somente naquele bloco. Mantém pastas, outros processos e outros blocos; registra a limpeza automática no histórico, sem desfazer. Operação atômica com o snapshot e proteção contra consultas substituídas, erros e listas incompletas. A primeira consulta completa também reconcilia classificações antigas ausentes.
- 146 testes passaram; sintaxe e formatação aprovadas. Fluxo das opções, troca entre blocos e edição isolada conferidos no Chromium com dados fictícios. API implantada pela stack 18 do Portainer com backup, volume e histórico preservados, seis módulos conferidos por SHA-256, atualização completed e container healthy. Conferência no SEI real pendente.

## 0.13.0 — 2026-10-27

- Bloco interno e card mostram presença compartilhada de edição, com nome/login, documento e distinção entre editor aberto e edição recente. Múltiplos usuários aparecem separadamente; janelas do mesmo usuário/documento são reunidas.
- Detecta editor_montar com campo editável, incluindo iframe, e identidade da própria página ou da janela de origem. Não registra a simples visualização de documentos. Faixa no editor informa presença confirmada ou falha de conexão.
- Renovação/consulta a cada 20 segundos; atividade recente por 60 segundos. Encerramento ao sair e expiração no servidor após 90 segundos sem renovação, com retirada visual no próximo ciclo. Presenças não são enfileiradas offline e avisos expirados não permanecem como atuais.
- Envia somente identificadores, nome/login e tempo de atividade; não envia texto digitado, valores, cookies ou links autenticados. Aviso informativo, sem bloquear o trabalho ou alterar classificação, vistos e histórico.
- 136 testes passaram; sintaxe e formatação aprovadas. Fluxo de popup/edição/fechamento e layouts 320/520 px validados no Chromium com dados fictícios. API implantada pelo Portainer com backup, volume e 270 registros de histórico preservados; seis módulos conferidos por SHA-256, atualização completed e container healthy. Conferência no editor real do SEI pendente.

## 0.12.0 — 2026-10-27

- Abrir o processo na unidade registra reconhecimento compartilhado das novas entradas. Outros navegadores atualizados retiram o destaque Novo e o contador no próximo ciclo, normalmente em até um minuto. Aberturas fora da unidade e mensagens sem o processo correspondente à página são rejeitadas.
- API mantém referências de entrada por bloco e reconhecimento por processo, com isolamento de unidade, limites e controle de concorrência. Saída/reinclusão detectada cria nova referência; aberturas antigas não reconhecem entradas posteriores à última observação de ausência.
- Migração preserva avisos locais existentes mesmo se outro navegador iniciou uma referência silenciosa. Aberturas offline ficam em fila persistente para nova tentativa. Falhas de sincronização são indicadas no painel.
- Marcar novas entradas como vistas pelo painel também compartilha o reconhecimento. Status manual, assuntos e histórico ficam intactos; pendências de assinatura continuam independentes e seu reconhecimento permanece local.
- 128 testes passaram; sintaxe e formatação aprovadas. API implantada pela stack 18 do Portainer, com backup validado, volume e administração preservados, atualização completed e container healthy. Cinco módulos do servidor conferidos por SHA-256; saúde e rota compartilhada HTTPS 200, outra unidade 403. ZIP 0.12.0 conferido por SHA-256. Validação entre navegadores feita com fixtures; conferência no SEI real pendente.

## 0.11.0 — 2026-10-27

- Card reorganizado em painéis: pendências e assinatura primeiro, controles do bloco antes do histórico, tipo do processo recolhido no final. Fundo suave, painéis claros, espaçamento e foco visível para leitura na coluna estreita.
- Chegada apresenta envio e recebimento em sequência, com explicação do acesso que registra o recebimento. Inclusão e autor permanecem junto de cada bloco; seletor identificado como Status manual.
- Nesta unidade mostra Processo aberto e esclarece que o tempo conta desde a última movimentação, não desde a chegada. Alerta de outra unidade recebe explicação explícita.
- Sem novas consultas, permissões ou alterações na API; não exige reimplantação da VPS.
- 122 testes passaram; sintaxe e formatação aprovadas. Prévia com dados fictícios conferida no Chromium em 320 e 520 px, sem rolagem horizontal. ZIP 0.11.0 atualizado. Conferência no SEI real pendente.

## 0.10.3 — 2026-10-27

- Cada bloco interno no card mostra a data/hora da inclusão do processo e quem incluiu, pelo registro Processo inserido no bloco do andamento. Informação disponível no resumo e ao selecionar documento.
- Retirada e reinclusão usam a última inclusão registrada; blocos e unidades são tratados separadamente. Histórico incompleto é indicado junto da informação. Não confunde inclusão no bloco com recebimento na unidade.
- Sem novas consultas, permissões ou alterações na API; não exige atualização da VPS.
- 121 testes passaram; sintaxe e formatação aprovadas. ZIP 0.10.3 conferido por SHA-256. Testes cobrem retirada/reinclusão, múltiplos blocos, outra unidade, resumo/documento, sincronização e histórico parcial. Conferência visual no SEI real pendente.

## 0.10.2 — 2026-10-27

- Corrigida a duplicação do botão de copiar nos processos marcados como Novo. O botão fica associado ao link do processo, independentemente da posição do marcador inserido pelo monitor.
- Controles duplicados são removidos; substituição do link recria o controle para copiar o número atual. Marcador, seleção e ações nativas são preservados.
- Teste reproduz atualizações repetidas do marcador, remove duplicados e verifica a cópia após substituir o link. Sem alterações na API ou necessidade de atualizar a VPS.
- 119 testes passaram; sintaxe e formatação aprovadas. Versões alinhadas e ZIP 0.10.2 conferido por SHA-256. Validação automatizada local; conferência visual no SEI real pendente.

## 0.10.1 — 2026-10-27

- Card mostra Chegada à unidade no resumo do processo e no documento: data/hora do envio, unidade de origem, autor da remessa e recebimento posterior quando disponível.
- Distingue remetente de recebedor e usa a última entrada destinada à unidade atual pela data real. Nova remessa não reutiliza recebimento anterior; registros ausentes e histórico incompleto são indicados.
- Usa o andamento já consultado pelo card, sem novas permissões ou alterações no servidor. API 0.10.0 permanece compatível; não exige reimplantação na VPS.
- 118 testes passaram, com cobertura de remessas repetidas, ordem das datas, remetente/recebedor, registros ausentes e histórico parcial. Sintaxe e formatação aprovadas; ZIP 0.10.1 atualizado. Validação desta alteração no SEI real pendente.

## Manutenção — 2026-10-27

- Teste de última movimentação usa somente datas fixas e registros fora de ordem, sem depender do relógio do dia.
- Documentação de instalação e empacotamento alinhada à versão 0.10.0 e ao manifesto na raiz do ZIP. Referência aos 35 testes identificada como validação histórica.
- Conferência da VPS pelo Portainer: API 0.10.0 saudável, quatro arquivos do servidor idênticos aos locais por SHA-256, editor acessível, administração exclusiva e volume preservados. HTTPS de saúde e leitura 200; outra unidade 403. Sem necessidade de reimplantação.
- Alterações somente em testes e documentação; versão e ZIP da extensão permanecem 0.10.0.
- Validação desta manutenção: 115 testes passaram; sintaxe e formatação aprovadas.

## 0.10.0 — 2026-10-24

- Card consulta todas as páginas do andamento completo pelo mesmo leitor da tabela; uma leitura completa da tabela atualiza o card aberto. Cache curto por processo, unidade e usuário. Histórico incompleto não afirma que o processo está fora de blocos.
- Último envio mostra data e quantidade de destinos em um acordeão recolhido. Pendências de assinatura abrem o documento pelo link original da árvore, quando disponível.
- Eventos do resumo são escolhidos pela data/hora real. Andamento permite alternar entre Ordem do SEI e Mais recentes primeiro, com preferência por usuário e unidade; a ordem original é restaurada ao sair.
- Status em lote para processos selecionados e visíveis, com confirmação. API aplica o conjunto atomicamente, registra os valores anteriores e permite desfazer pelo histórico. Aviso Assinar considera a mudança individual de cada processo do lote.
- API 0.10.0 implantada pela stack 18 do Portainer, com backup SQLite validado e volume preservado. Instalação continua sem token ou configuração manual.
- 115 testes passaram; sintaxe e formatação verificadas. Imagem implantada validada com status em lote e desfazer em banco isolado. Validação no SEI real ainda pendente.

## 0.9.2 — 2026-10-24

- Corrigida a contagem nativa com faixa, como 129 registros - 1 a 100, que impedia consultar as páginas restantes e podia apresentar leitura completa indevidamente.
- Andamento exibe quantidade carregada em relação ao total e só confirma leitura completa após conferir ambos. Total desconhecido permanece explicitamente não confirmado.
- Leitor compartilhado de contagem também usado no resumo e nas listas de blocos; detector de novas entradas aceita legendas com faixa. Legenda da tabela deixa de mostrar a faixa da primeira página após reunir o histórico completo e é restaurada ao sair.
- 107 testes passaram, incluindo reprodução do caso 129/100, consulta da segunda página, filtros com 30/8 resultados e total não reconhecido. Sem alterações no servidor ou permissões.

## 0.9.1 — 2026-10-24

- Andamento com 30 resultados filtrados por página, controles Anterior/Próxima, página atual e contagem de resultados.
- Consulta às páginas nativas restantes para reunir os registros antes de paginar o resultado do filtro, preservando completo/resumido e os valores do formulário visível.
- Leitura validada por contagem, página, origem e repetições; falhas mantêm os registros iniciais e a paginação nativa com aviso de leitura incompleta. Importações e ocultação dos controles nativos são desfeitas ao sair.
- 105 testes passaram, incluindo páginas de 30/30/5, preenchimento com registros da própria unidade vindos de outras páginas e falha de sessão. Sem novas permissões ou alterações no servidor.

## 0.9.0 — 2026-10-24

- Filtros na tela nativa de andamento para unidade e tipo de movimentação; início em Minha unidade + Envios e recebimentos, com Ver tudo e preferência por usuário/unidade.
- Envios da própria unidade são identificados pela origem no texto do andamento, mesmo quando a linha pertence à unidade de destino. Recebimentos na própria unidade também entram no filtro.
- Contagem dos registros carregados e aviso de outras páginas. Sem consultas adicionais, alterações de registros, formulários ou paginação; cores e controles nativos preservados.
- Recuperação após troca da tabela/remoção da barra e restauração das linhas ao sair. Leitores do resumo continuam acessando todas as linhas, inclusive as filtradas visualmente.
- 102 testes passaram, incluindo classificação de envios/recebimentos, persistência, estilos de ocultação, preservação do histórico e navegação. Sem novas permissões ou alterações no servidor. Validação automatizada local.

## 0.8.4 — 2026-10-24

- Última movimentação do resumo prioriza a unidade atual, com seletor Minha unidade / Todo o processo para consultar também o registro mais recente geral.
- Escolha lembrada por usuário e unidade no navegador; alternância usa os registros carregados, sem novas consultas ao SEI.
- Ausência de registro da própria unidade é informada explicitamente, inclusive em histórico parcial, sem apresentar o registro de outra unidade como local. Siglas com º/° e diferenças de caixa são normalizadas.
- 98 testes passaram, incluindo alternância, preferência persistida, diferença entre registros local/geral e histórico parcial. Sem novas permissões ou alterações no servidor.

## 0.8.3 — 2026-10-24

- Card flutuante substituído por barra fixa no rodapé, em toda a largura, com a cor original do cabeçalho do SEI e contraste adaptado.
- Resumo fino com contagens de novos processos e pendências de assinatura, estado sem novidades e indicador amarelo para avisos/falhas. Detalhes abrem para cima ao clicar, com rolagem e fechamento por Esc; novas entradas não expandem a barra automaticamente.
- Espaço reservado no fluxo ou no layout flex do SEI para preservar a área dos iframes; acompanha a altura da barra e é removido ao sair. Botão nativo de voltar ao topo posicionado acima do rodapé. Sem barra nem reserva na impressão.
- Configurações permanecem no botão Organizador do cabeçalho. Monitoramento, sons, logins e preferências preservados.
- 96 testes passaram, incluindo cor do header, reserva/restauração de layout, expansão manual e tratamento visual de falhas. Sem alterações no servidor ou permissões. Validação automatizada local, sem sessão real do SEI.

## 0.8.2 — 2026-10-23

- Seção Aberto em recolhida por padrão em um acordeão nativo, com quantidade de unidades e maior tempo parado no resumo. Expandir revela as unidades e os tempos individuais.
- Situação na própria unidade, pendências e alerta amarelo/vermelho continuam visíveis fora do acordeão. Atualizações do Organizador preservam a seção aberta durante a consulta.
- 94 testes passaram, com a cobertura existente ajustada para recolhimento, contagem, maior tempo parado e preservação do alerta. Sem novas permissões ou alterações no servidor.

## 0.8.1 — 2026-10-23

- Botão ⚙ Organizador no cabeçalho do SEI, próximo ao usuário, abre a janela Configurações do SEI Organizador.
- Configuração dos chefes, silenciamento, testes de som e diagnóstico de reprodução movidos para essa janela. Preferências existentes preservadas.
- Card reservado aos alertas, links e reconhecimento dos avisos; blocos sem avisos ou erros deixam de ser listados nele.
- Janela com fechamento por Esc/Fechar e retorno do foco ao botão. Atualizações dos alertas preservam o rascunho; erros ao salvar permanecem nas configurações e permitem tentar novamente.
- 94 testes passaram, incluindo recuperação do botão sem duplicação, edição durante sincronização, foco e falha de salvamento. Sem alterações no servidor, banco ou permissões.

## 0.8.0 — 2026-10-23

- Removidos o toque padrão de três toques e o seletor genérico. Novo SEI toca em entradas no bloco; Assinar toca em mudanças do status manual para Assinar.
- Lista configurável de chefes de seção por login do SEI, com identificação do usuário conectado, inclusão do próprio login e salvamento por unidade neste navegador. Som e avisos automáticos de Assinar ficam restritos aos logins configurados.
- Consulta ao estado e histórico compartilhados permite detectar alterações feitas por colegas. Primeira leitura silenciosa, controle de versão entre respostas e prevenção de avisos repetidos ou causados apenas pela inserção de um processo já marcado como Assinar.
- Painel e contador separam entradas e pendências de assinatura, com links, reconhecimento e testes dos dois sons. Falhas do Organizador preservam a referência anterior sem impedir alertas de entrada.
- 92 testes passaram. Sem alterações no servidor, banco ou permissões da extensão. A configuração de chefes não é compartilhada entre computadores.

## 0.7.0 — 2026-10-23

- Seletor de áudio no painel dos alertas: Padrão — três toques, Novo SEI e Assinar, com preferência persistida no navegador e teste do áudio escolhido.
- MP3 da pasta sound incluídos integralmente na distribuição, sem alterar os originais. Catálogo fixo compartilhado entre painel, worker e reprodutor; URLs ou caminhos arbitrários são recusados.
- Trocar o áudio mantém a preferência de silenciamento. Avisos enfileirados preservam o áudio selecionado para cada reprodução.
- 86 testes passaram, incluindo três novos cenários de escolha, persistência, reprodução, arquivos empacotados e interface. Sem novas permissões, serviços ou alterações no banco.

## 0.6.1 — 2026-10-23

- Aviso sonoro mais perceptível: três toques em 1,9 segundo e volume de reprodução de 85%, substituindo o toque de 0,65 segundo a 35%.
- Reprodutor confirma somente após o fim do arquivo, detecta erro de mídia e tempo excedido e enfileira avisos para não cortar sons anteriores.
- Worker aguarda o reprodutor ficar pronto antes de tocar; falhas no teste ficam registradas no painel sem remover os controles nem as preferências.
- Painel informa som ativado/silenciado, progresso do teste e horário da última reprodução concluída, com orientação para conferir o áudio do sistema se necessário.
- 83 testes passaram, incluindo quatro novos cenários de reprodução, inicialização, sinal de áudio e retorno do teste. Sem novas permissões ou mudanças no servidor. A saída física de áudio do usuário não foi validada nesta sessão.

## 0.6.0 — 2026-10-23

- Resumo do processo na árvore assim que ela abre, sem depender da seleção de documento: número, tipo, última movimentação, último envio, unidades abertas, tempo parado, pendências e classificação nos blocos internos.
- Card único alterna para os detalhes do documento selecionado e restaura o resumo ao sair dele ou voltar à raiz; documentos de outras unidades mantêm o resumo do processo.
- Respostas atrasadas não substituem o card atual; consultas periódicas do card anterior são encerradas quando ele é substituído.
- Resumo sem documento não presume assinatura, unidade geradora ou bloco de assinatura de um documento arbitrário. Histórico parcial ou indisponível preserva as mensagens de incerteza.
- 79 testes passaram, incluindo seis novos cenários de resumo e navegação. Sem mudanças no servidor, banco ou permissões. Validação automatizada local, sem sessão real do SEI.

## 0.5.0 — 2026-10-23

- Monitor automático dos blocos internos abertos na sessão, com consultas a cada minuto durante a navegação em outras telas do SEI e coordenação para evitar duplicação entre abas.
- Primeira leitura silenciosa; comparação por IDs em leitura completa sem pesquisa e com paginação, preservando a referência anterior em falhas ou sessão expirada.
- Painel com links, marcador Novo nas linhas carregadas, contador no ícone e notificação do sistema que abre o bloco.
- Toque local em documento offscreen, com silenciamento e teste; reconhecimento dos avisos por bloco ou em conjunto.
- URLs autenticadas restritas ao armazenamento de sessão do navegador; dados do monitor não passam pela API. Limites documentados de consultas e quantidade de blocos.
- Chrome mínimo 120; novas permissões de storage, alarms, notifications, offscreen e host do SEI.
- 11 testes do monitor adicionados; nenhuma mudança no servidor ou banco. Validação real de áudio/notificação no navegador não executada nesta sessão.

## 0.4.3 — 2026-10-23

- Histórico não reconhecido informa erro; registros vazios ou incompletos não declaram processo concluído nem ausência de envio.
- Assuntos e status no card sincronizam a cada dez segundos com a página visível, sem sobrepor gravações. Consultas cessam ao sair ou substituir o card.
- Falhas de sincronização identificam os dados anteriores e desabilitam a edição até reconectar, inclusive após falha na recuperação de uma gravação.
- Confirmação de envio também intercepta a submissão do formulário, preservando o envio nativo e evitando pergunta duplicada após o clique confirmado.
- Cinco testes de regressão adicionados. Sem mudança no servidor, banco ou permissões.

## 0.4.2 — 2026-10-19

- Animação de carregamento no card: barra animada sob o cabeçalho e linhas pulsantes no lugar do andamento até o andamento, os blocos e o Organizador responderem; removida ao concluir ou falhar.
- Respeita a preferência de reduzir movimento do sistema, com indicação estática; card marcado como ocupado (aria-busy) durante a espera.
- Contorno do card em azul mais forte.
- 57 testes passaram. Sem mudança no servidor nem nas permissões.

## 0.4.1 — 2026-10-19

- Card do processo em azul pastel, com cabeçalho destacado e faixa lateral azul, para chamar atenção na árvore sem atrapalhar a leitura.
- Amarelo e vermelho continuam reservados ao alerta de tempo parado, que substitui a faixa lateral quando aparece.
- 56 testes passaram. Sem mudança no servidor nem nas permissões.

## 0.4.0 — 2026-10-19

- Novo status Assinar (✍), entre Urgente e Arquivar, no bloco interno, no filtro e no card do processo.
- Para arquivar passa a se chamar Arquivar; a chave gravada não mudou, então marcações existentes continuam valendo sem migração.
- Servidor aceita o novo status; exige reimplantação da API antes de usar Assinar. Até lá, escolher Assinar mostra erro e não grava.
- 56 testes passaram. Sem mudança no banco nem nas permissões.

## 0.3.2 — 2026-10-19

- Documento aberto deixa de se repetir em Pendências antes de enviar; sua situação continua na linha Assinatura, e a linha some quando não há outros pendentes.
- Os demais documentos sem assinatura e a tela Enviar Processo continuam listando todas as pendências.
- 55 testes passaram. Sem mudança no servidor nem nas permissões.

## 0.3.1 — 2026-10-19

- Alerta de tempo parado no topo do card: unidade aberta há mais tempo e quantas outras passam de 3 dias, em amarelo (3 a 6 dias) ou vermelho (7 dias ou mais).
- Borda lateral do card na cor do alerta; o alerta continua visível com o card oculto, e a dica lista as datas de cada unidade.
- 54 testes passaram. Sem mudança no servidor nem nas permissões.

## 0.3.0 — 2026-10-19

- Aviso de pendência antes de enviar: documentos internos da unidade sem nenhuma assinatura, lidos da árvore do processo.
- Card da árvore com a linha Pendências antes de enviar; em documentos de outras unidades, card reduzido só com a pendência.
- Tela Enviar Processo, aberta pela árvore: faixa de aviso acima da lista e confirmação ao clicar em Enviar, sem bloquear nem alterar o envio nativo.
- Envio em lote, processos sem pendência e árvore de outro processo ficam sem aviso.
- Contexto do SEI e leitura da árvore compartilhados entre o card e a tela de envio; novo send.js no mesmo content script.
- 53 testes passaram. Sem mudança no servidor nem nas permissões.

## 0.2.2 — 2026-10-19

- Seletor de status compacto, na mesma linha do assunto, em vez de ocupar a largura do card.
- Bloco de assinatura incorporado à linha da assinatura: "Aguardando assinatura · bloco nº N (descrição)" quando não assinado; documento assinado mostra o bloco discretamente abaixo.
- Rótulos sem dois-pontos e sem caixa alta, com visual mais leve.
- 49 testes passaram. Sem mudança no servidor nem nas permissões.

## 0.2.1 — 2026-10-19

- Card de situação movido do topo do documento para a árvore do processo, abaixo de Consultar Andamento; o documento fica sem sobreposição.
- Layout vertical para a coluna estreita: rótulo acima do valor, um signatário e um destino por linha, unidades abertas com o tempo parado alinhado à direita.
- O card acompanha o documento aberto: é substituído ao abrir outro documento e removido ao sair dele, inclusive quando o novo documento é de outra unidade.
- 48 testes passaram. Sem mudança no servidor nem nas permissões.

## 0.2.0 — 2026-10-19

- Quadro de situação no topo dos documentos gerados pela unidade: assinaturas (nome, cargo, data e hora), último envio (destinos, horário e quem enviou) e aviso quando o envio é anterior ao documento.
- Tempo parado em cada unidade com o processo aberto, em amarelo a partir de 3 dias e vermelho a partir de 7.
- Blocos de assinatura do documento e blocos internos do processo, conforme o andamento da unidade e a lista de blocos do SEI.
- Assunto e status do Organizador por bloco interno, com alteração no próprio quadro.
- Andamento e listas consultados no SEI com a sessão do usuário, decodificados em ISO-8859-1, com cache curto na aba; nada disso é enviado à API.
- O quadro não aparece em documentos de outras unidades nem na impressão; Ocultar/Mostrar fica lembrado.
- Novo content script em todos os quadros do SEI (document-data.js e document.js); sem novas permissões.
- 47 testes passaram. Servidor sem mudança; não exige reimplantação.

## 0.1.6 — 2026-10-13

- Histórico do servidor guarda a lista de abas e somente os processos alterados, em vez do estado completo do bloco a cada operação.
- Diferenças de cada registro calculadas uma vez por consulta; índice por unidade, bloco e registro.
- Registros antigos com estado completo continuam compatíveis; teste de equivalência compara o desfazer com o algoritmo anterior.
- Órgão atendido passa para extension/config.js junto com serviço e unidade.
- Verificações de página, unidade e bloco feitas uma única vez; variável sem uso removida.
- CSS consolidado em uma regra por seletor e sem estilos de elementos inexistentes; estilos calculados idênticos aos da 0.1.5 em 24 cenários.
- Código da extensão formatado com Prettier 3.9.8; npm run format e verificação de formatação em npm run check.
- 40 testes passaram. Servidor exige reimplantação para os snapshots compactos; sem migração de banco nem novas permissões.

## 0.1.5 — 2026-10-13

- Mensagens de erro permanecem visíveis após a sincronização automática, até a próxima ação do usuário.
- Somente o aviso de falha de sincronização é limpo quando a conexão volta.
- Confirmações de sucesso aparecem em verde e somem após alguns segundos.
- Respostas do serviço que não são JSON, como erro 502 do proxy, mostram mensagem amigável com o código HTTP.
- Dependência de teste jsdom corrigida para 30.1.2; a 30.1.4 não existe no registro e impedia npm ci.
- Dois testes de regressão; 37 testes passaram. Sem mudança na API, no banco ou nas permissões.

## 0.1.4 — 2026-10-02

- Descrição e Palavras-chave para pesquisa ficam lado a lado na página do bloco interno.
- Campos nativos, rótulos, valores, eventos e associação ao formulário preservados.
- Layout volta a uma coluna em telas estreitas; estrutura original restaurada ao sair.

## 0.1.3 — 2026-10-02

- Botão Desfazer removido de registros já desfeitos ou bloqueados, em vez de permanecer cinza.
- Registro original preservado no histórico com indicação Desfeita após reversão.
- Histórico da VPS confirmou reversão de status concluída; correção somente na interface.

## 0.1.2 — 2026-10-02

- Botão Desfazer posicionado depois do texto de cada registro, à direita, com espaçamento.

## 0.1.1 — 2026-10-02

- Instalação sem configuração: serviço HTTPS e unidade fixos, sem token individual.
- Coluna Assunto somente em Geral; Status permanece nas demais abas.
- Retirada dos botões Atualizar e Limpar filtros; sincronização automática mantida.
- Desfazer junto ao registro próprio no histórico, com confirmação e validação no servidor.
- Reversão seletiva preserva alterações posteriores independentes e bloqueia conflitos, dependências e repetição.
- Nome completo registrado aparece ao passar o mouse sobre o login no histórico.
- API atualizada na VPS, persistência e HTTPS validados; 34 testes passaram.
- Versionamento obrigatório a cada atualização entregue da extensão.

## 0.1.0 — 2026-10-01

- Serviço Node.js/SQLite por unidade e bloco, versões, histórico e desfazer.
- Extensão MV3 com opções de origem/unidade e permissões por destino.
- Assuntos múltiplos, visão Sem assunto e menu contextual por processo.
- Histórico legível, status manual e cópia do número completo.
- Barra compacta com tema nativo, somente aba ativa destacada e indicação Visualizando.
- Colunas próprias Assunto/Status, mantendo Anotações e ações nativas livres.
- Tabela compacta com rolagem horizontal e cabeçalho original fixo sob a barra.
- Correção da ativação após retorno nativo de exclusão no SEI.
- Fixtures, 21 testes, documentação local/VPS e referência SEI++ como submódulo.
- Funcionamento confirmado pelo usuário no SEI real; sem deploy de produção.

Checkpoints anteriores preservados: 66c764d (barra aprovada) e f0bc4c2 (primeiro ajuste de Geral). O destaque permanente de Geral foi substituído no estado final pela indicação exclusiva da aba ativa.

### Correção posterior de navegação

- Reconhece a lista interna pelo título/cabeçalho e rota, sem depender da origem de retorno após anotar/excluir/navegar.
- Regressão para páginas de processo e outros tipos de bloco; 22 testes passam.

### Salvaguardas de ciclo de vida

- Recuperação da barra, chegada tardia da lista e substituição de formulário/tabela.
- Reinicialização ao retornar pelo histórico, sem timers/eventos duplicados.
- Limpeza ao sair da lista e proteção contra respostas atrasadas.
- 24 testes passam; conferência local no navegador sem erros de inicialização.

### Usabilidade e desfazer seguro

- Assunto clicável e acessível abre o menu de vínculos, preservando clique direito, teclado e múltiplas pastas.
- Filtro de status combinado com assunto, contagens locais, indicação de filtros e limpeza; status desconhecido não vira Sem status.
- Desfazer consulta a última ação e autor para confirmação; versão e identificador protegem contra histórico desatualizado e alterações concorrentes.
- Salvaguardas de navegação, reconstrução e retorno pelo histórico preservadas; 27 testes.
- Atualização: recarregar extensão e página do bloco; atualizar/reiniciar o serviço preservando SQLite/volume para validar o identificador da ação no desfazer. Sem migração de banco ou novas permissões.
