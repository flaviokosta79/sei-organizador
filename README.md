# SEI Organizador — 0.16.0

Extensão Chrome MV3 para organizar os processos de blocos internos do SEI-RJ por assunto e status manual. A API Node.js/SQLite compartilha as classificações entre colegas da unidade. A extensão preserva os controles, as anotações e as operações nativas do SEI.

## Instalação

1. Clone o projeto e carregue a pasta `extension` em `chrome://extensions`, com o modo desenvolvedor habilitado. Como alternativa, extraia o ZIP de distribuição em uma pasta e carregue essa pasta, que contém `manifest.json` na raiz.
2. Abra a lista de processos de um bloco interno do SEI na unidade atendida pela extensão.
3. Após atualizar, recarregue a extensão no Chrome e depois a página do bloco.

O serviço HTTPS `https://ext.5cpa.com.br`, a unidade e o órgão estão fixos em `extension/config.js`. Não há campos de endereço, unidade ou token para preencher. Valores antigos salvos no navegador são ignorados. A organização das listas atua nos blocos internos reconhecidos; os alertas continuam nas demais telas do SEI, sempre na unidade definida.

```powershell
git clone --recurse-submodules https://github.com/flaviokosta79/sei-organizador.git
cd sei-organizador
npm ci
```

Para clone existente, execute `git submodule update --init`. `referencias/sei` é o submódulo do [SEI++ original](https://github.com/jonatasrs/sei), usado como referência independente; não é necessário para executar o organizador. Sua licença e seu histórico são preservados.

## Escolha do bloco de trabalho

Abra **Opções** da extensão ou use **⚙ Organizador → Escolher bloco nas opções da extensão**. Selecione seu usuário, escolha o **Bloco interno**, identificado por **número + grupo do SEI**, e clique em **Salvar bloco de trabalho**. Sem grupo indica campo vazio no SEI; Grupo não identificado pede atualizar a lista pela sessão aberta, sem usar a descrição como substituto. A lista reúne blocos reconhecidos no SEI e pode ser atualizada pela sessão aberta; se algum faltar, abra esse bloco no SEI e clique em **Atualizar lista do SEI**. Serviço, unidade e acesso sem token continuam fixos.

O primeiro bloco reconhecido é escolhido automaticamente, preservando o uso após instalar. A preferência é separada por unidade, órgão e login neste navegador. Trocar a preferência aplica a mudança às páginas abertas; não remove classificações do bloco anterior. Para iniciar consultas após reiniciar o navegador ou escolher um bloco que ainda não foi aberto, abra o bloco escolhido.

Abas, status, assuntos, alertas, reconhecimento de novas entradas e avisos de edição ficam restritos ao bloco escolhido. Em outros blocos, os controles nativos permanecem disponíveis, sem faixa nem botão de escolha do Organizador. O resumo do processo permanece visível mesmo sem confirmação de inclusão no bloco de trabalho. Somente as classificações e os controles de assuntos/status ficam restritos ao bloco escolhido; ausência de registro ou histórico incompleto são informados no card. A presença de edição também usa o bloco escolhido, mesmo quando o mesmo processo aparece em mais de um bloco. Todos precisam atualizar a extensão; versões antigas mantêm seu comportamento anterior. A preferência organiza o fluxo da extensão e não altera as permissões do SEI.

## Limpeza após retirada do processo

Quando uma leitura completa e sem pesquisa confirmar que um processo saiu do bloco, o servidor limpa o status manual e seus vínculos com assuntos **somente naquele bloco**. As pastas de assuntos, os outros processos e as classificações de outros blocos permanecem. A primeira leitura completa também reconcilia classificações antigas de processos que já não estão no bloco. Se o processo voltar depois da retirada confirmada, volta sem status e sem assuntos.

A limpeza é atômica com a confirmação da lista e fica registrada no histórico como operação automática do Organizador. Não pode ser desfeita pelo histórico para restaurar vínculos de um processo ausente. Filtros visuais, paginação, leitura incompleta, falha de sessão ou consulta substituída não confirmam retirada. O monitor precisa estar ativo; saída e reinclusão entre duas consultas, sem observação da ausência, não permitem confirmar a retirada e não disparam limpeza.

## Comportamento atual

- **Geral** reúne os processos carregados na página. Classificar por assunto mantém o processo em Geral. O filtro de status também se aplica a Geral e pode esconder linhas.
- Um processo pode ter vários assuntos. **Sem assunto** reúne os processos sem vínculo válido. Contagens consideram somente os processos carregados pela página e pela pesquisa atuais.
- A coluna **Assunto** aparece somente em Geral. Clique no assunto, use o clique direito na linha ou a tecla de menu para atribuir ou retirar vínculos. O menu da linha também funciona nas demais abas.
- **Status** aparece em todas as abas: Sem status, Atenção, Acompanhar, Urgente, Assinar e Arquivar. Processos marcados antes como "Para arquivar" aparecem como Arquivar, sem migração. É manual, independente dos assuntos e das anotações nativas.
- A barra oferece Criar assunto, o filtro de status, status em lote e Histórico/Fechar histórico. Para mudar vários processos, marque as caixas das linhas visíveis, escolha Status dos selecionados e clique em Aplicar em N. A confirmação mostra a quantidade, o status e os primeiros dez processos. Cancelar não grava. O conjunto é uma única alteração compartilhada e pode ser desfeito pelo histórico; seleções ocultas não entram na ação. Renomear e Excluir aba aparecem quando uma pasta está ativa. Os botões Atualizar e Limpar filtros foram retirados; para voltar à visão completa, selecione Geral e Todos os status.
- A sincronização acontece ao abrir e a cada dez segundos enquanto a página está visível, além de ocorrer após uma alteração. Falhas retornam a Geral e desabilitam gravações até reconectar; status não sincronizado não é apresentado como Sem status.
- Trocar de aba ou filtrar desmarca as seleções que ficaram escondidas, preservando as ações nativas do SEI sobre os processos visíveis.
- Descrição e Palavras-chave para pesquisa ficam lado a lado, com a descrição à esquerda. Abaixo de 760 px, ficam empilhadas. Os campos, valores, rótulos, eventos e associação ao formulário nativos são preservados; a estrutura original é restaurada ao sair da lista.
- A tabela usa colunas compactas, rolagem horizontal e cabeçalho original fixo sob a barra. O controle de copiar usa o número completo do link do processo. O tema acompanha o SEI, com contraste claro/escuro.
- A interface se recupera quando a lista chega depois do script, a barra é removida ou a tabela é substituída, e ao retornar pelo histórico do navegador. Não se aplica ao Controle de Processos nem a blocos de outros tipos.

## Alertas de entrada nos blocos internos

Ao abrir o primeiro bloco interno da unidade atendida, ele é escolhido automaticamente como bloco de trabalho. Nas opções da extensão, é possível escolher outro bloco para o usuário conectado. A barra de alertas fixa no rodapé, com a cor do cabeçalho do SEI, continua disponível enquanto você navega em outras telas do SEI. Somente o bloco escolhido é acompanhado, com uma consulta por minuto e uma única aba consultando por usuário, mesmo com várias abas abertas. É preciso manter ao menos uma tela do SEI aberta na unidade atendida e a sessão válida; depois de fechar e reabrir o navegador, abra novamente o bloco escolhido para retomar o monitoramento. A preferência permanece salva.

- A primeira leitura completa de cada bloco e usuário cria a referência sem avisar os processos existentes. As referências locais continuam no navegador; o reconhecimento de novas entradas é compartilhado pela API entre os usuários da extensão atualizada. Nas leituras seguintes, a comparação usa os IDs, inclusive quando saídas e entradas mantêm a mesma quantidade total. Uma reinclusão detectada depois de uma saída também gera aviso. Cada entrada tem uma referência própria no servidor, para que uma abertura antiga não reconheça uma nova entrada. Aberturas ocorridas após a última observação do bloco também são consideradas quando a entrada só é detectada na consulta seguinte; a ordem exata de saída/reinclusão entre duas consultas não pode ser reconstruída.
- Uma entrada detectada gera notificação do sistema, o áudio Novo SEI (volume de reprodução de 85%), contador no ícone da extensão e aviso no painel com links para os processos. Clique na notificação para abrir o bloco; clique no ícone da extensão para abrir o painel em uma tela do SEI. A linha carregada de um processo novo recebe o marcador **Novo**. Ao abrir o processo no SEI, suas novas entradas no bloco de trabalho são marcadas como vistas para os colegas que escolheram o mesmo bloco. Os demais navegadores retiram o destaque Novo e o contador no próximo ciclo, normalmente em até um minuto, com uma tela do SEI aberta e sessão válida. O painel também permite marcar as novas entradas como vistas por bloco ou de uma vez, compartilhando esse reconhecimento; avisos de assinatura continuam com reconhecimento local.
- Os sons são fixos por evento: **Novo SEI** (sound/novosei.mp3) para entrada de processo no bloco, e **Assinar** (sound/assinar.mp3) para mudança do status manual do Organizador para Assinar e para assinatura efetiva confirmada no SEI. O toque padrão de três toques foi removido. Os MP3 originais continuam sem alteração e incluídos no ZIP.
- No cabeçalho do SEI, clique em **⚙ Organizador** para abrir **Configurações do SEI Organizador**. Em **Chefes de seção**, informe os logins do SEI separados por vírgula ou linha e clique em **Salvar chefes**. **Adicionar meu login** preenche o login conectado, que também aparece no painel. A lista é salva por unidade neste navegador; configure-a no navegador de cada chefe. Os outros logins continuam recebendo Novo SEI, mas não recebem os avisos de status manual Assinar; todos que escolheram o mesmo bloco interno recebem os avisos de assinatura efetiva. A lista é uma preferência de avisos, não uma alteração das permissões do SEI.
- O monitor consulta também o estado e o histórico compartilhados do Organizador nos blocos acompanhados, a cada minuto. Assim, o chefe recebe aviso de mudanças feitas por colegas em outros computadores, desde que tenha o bloco monitorado e o login configurado. A primeira leitura de status é silenciosa; repetir o mesmo status não repete o som. Pendências reconhecidas não voltam a avisar sem nova mudança. Se o status sair de Assinar ou o processo sair do bloco, a pendência é retirada. Uma entrada de processo já marcado como Assinar não é presumida como mudança de status.
- O rodapé fica reservado aos alertas: separa **Novos no bloco** e **Para assinar**, com links, reconhecimento dos avisos e erros de consulta independentes. A barra permanece fina e recolhida, com contagens de novos processos e pendências de assinatura; sem novidades, mostra Nenhum alerta novo. Um pequeno indicador amarelo destaca avisos ou falhas sem mudar a cor de toda a barra. Ao clicar, os detalhes abrem para cima e têm rolagem própria. Novos avisos não expandem o painel automaticamente. Esc recolhe os detalhes e devolve o foco ao resumo. Blocos sem avisos ou erros não são listados. O espaço da barra é reservado no layout da página, incluindo a área dos iframes do processo; a reserva acompanha a altura da barra e é removida ao sair da unidade ou da página. O botão nativo de voltar ao topo fica acima dela. Cor e contraste acompanham o cabeçalho; a barra não entra na impressão. Configurações e testes de som ficam exclusivamente na janela aberta pelo cabeçalho. A janela fecha por **Fechar** ou **Esc** e preserva o texto em edição durante atualizações dos alertas. Se o estado e o histórico chegarem em versões diferentes, mantém a referência anterior e tenta novamente no próximo ciclo. São usados os últimos 100 registros fornecidos pelo histórico; muitas mudanças entre consultas podem exceder essa janela.
- **Silenciar som**, **Ativar som**, **Testar som** (Novo SEI) e **Testar Assinar** ficam nessa janela de configurações, junto com o diagnóstico de reprodução. Os testes são manuais e podem ser ouvidos mesmo por quem não está na lista de chefes, sem alterar o silenciamento. A reprodução usa volume de 85%, aguarda a conclusão do arquivo e informa erro ou horário de término. O reprodutor offscreen usa apenas arquivos locais e enfileira os avisos para não interrompê-los. Se houver confirmação de término sem som audível, confira o volume e a saída de áudio do navegador no sistema operacional.

- A consulta não recarrega a tela, não muda filtros nem seleções e não executa ações sobre processos. A leitura consulta o próprio SEI sem pesquisa, percorre as páginas e só aceita o resultado depois de confirmar a contagem completa. Histórico de classificações e dados da API não são usados para presumir entradas.
- Login expirado, página inesperada, erro de rede, contagem inconsistente ou paginação repetida preservam a referência anterior e mostram falha de atualização. O monitor tenta novamente no próximo ciclo. A leitura tem limites de 50 páginas, 10.000 processos por bloco e um minuto por bloco; resultados incompletos não geram entradas presumidas.
- O acompanhamento identifica diferenças entre consultas; não é uma notificação em tempo real do servidor SEI. Entradas removidas antes da consulta podem não ser vistas. O Chrome pode atrasar consultas quando o computador suspende ou o navegador limita sua execução.

A versão exige Chrome 120 ou superior e acrescenta permissões de armazenamento, alarmes, notificações, áudio offscreen e acesso ao host do SEI. IDs, números, preferências e avisos ficam no armazenamento local da extensão. URLs autenticadas ficam apenas no armazenamento de sessão do navegador e não são enviadas à API do Organizador. Não há endereço, unidade ou token para configurar. Esta entrega foi validada com testes automatizados de leitura, coordenação entre abas, painel e áudio; não houve confirmação de som/notificação em uma sessão real do Chrome/SEI.

## Alertas de recebimento para a Secretaria

Quem escolheu **1396 — Secretaria** nas opções recebe uma seção **Secretaria · aguardando recebimento na unidade** no painel e um contador no rodapé/ícone da extensão. A função consulta os processos não recebidos da unidade inteira; não exige que esses processos tenham sido incluídos no bloco 1396. Outros blocos não recebem esses alertas.

A primeira leitura mostra as pendências existentes sem som. Novas chegadas geram o som **Novo SEI** e notificação do sistema uma vez por navegador. O silenciamento existente também vale para esse som. A listagem é compartilhada: quando o SEI deixa de indicar o processo como não recebido, a pendência sai dos demais navegadores na próxima atualização completa. Reenvio detectado após uma atualização de recebimento ou ausência gera uma nova referência e pode avisar novamente.

O monitor lê somente **Controle de Processos**, usando `processoNaoVisualizado` e sua variante sigilosa. Não abre processos automaticamente. O link no painel permite que o próprio usuário abra o processo para receber no SEI. Quando o link do processo ainda não foi obtido na sessão local, o painel oferece acesso ao Controle de Processos. Marcar outros avisos como vistos não elimina a pendência de recebimento.

É necessário manter uma tela do SEI aberta na unidade atendida e a sessão válida. Há uma consulta por usuário aproximadamente a cada minuto, coordenada entre abas. São lidas todas as páginas de Recebidos (as amostras têm 217 processos em seis páginas), com limite de 10.000 registros e prazo de 110 segundos por leitura. Filtros de atribuição, marcador, tipo e prioridade são retirados das requisições do monitor em um formulário separado, sem alterar o DOM da tela visível. Leituras incompletas, repetidas, filtradas, alteradas ou substituídas não confirmam entradas nem retiradas; o painel conserva a última leitura e informa a falha.

A API guarda apenas IDs, números e referências das pendências em `secretariat_receipts`, sem links autenticados, cookies ou conteúdo dos processos. Os dados dessa função são independentes das classificações, dos vistos e da limpeza do bloco interno 1396. A extensão e a API precisam estar atualizadas para 0.16.0.

## Assinaturas confirmadas para o grupo

Quem escolheu o mesmo bloco interno nas opções participa do mesmo grupo de alertas. Quando um documento incluído em bloco de assinatura por um desses usuários é assinado no SEI, o grupo recebe o som **Assinar**, notificação e aviso no rodapé com o documento, nome/login do assinante, data/hora e bloco de assinatura. Não exige cadastro na lista de chefes. O botão **Marcar assinaturas como vistas** reconhece apenas os avisos daquele navegador. Silenciar o som mantém os avisos visuais.

Todos devem instalar a extensão atualizada e manter uma tela do SEI aberta na unidade atendida, com a sessão válida. A associação do login ao bloco é sincronizada ao usar o SEI. A leitura inicial não repete eventos compartilhados anteriores. O monitor identifica os blocos de assinatura e consulta os andamentos dos processos que o usuário já abriu normalmente no SEI. As URLs desses andamentos ficam na sessão do navegador e continuam sendo consultadas após a retirada do documento do bloco. O monitor não abre processos automaticamente para obter essas referências. Não é necessário que o processo esteja no bloco interno: o agrupamento considera quem incluiu o documento.

As consultas rodam em ciclos de aproximadamente um minuto, com rodízio de até cinco históricos de processos por ciclo para limitar requisições ao SEI. Em listas maiores, a confirmação pode levar vários ciclos; o aviso não é instantâneo. O nome de quem assinou vem da descrição do andamento, inclusive quando o autor da linha é um delegado. Somente históricos completos são aceitos; falhas e leituras parciais aparecem no painel. Documentos sem acesso pela sessão do SEI não podem ser acompanhados. Fechar todas as telas do SEI interrompe as leituras até reabri-las.

Metadados compartilhados são observações da sessão do usuário, com o mesmo modelo público e restrito à unidade da API existente. Não são enviados conteúdo do documento, cookies ou URLs autenticadas. Inclusões já observadas mantêm o grupo de origem se o usuário trocar de bloco posteriormente. As tabelas novas são aditivas e o rollback da imagem preserva o banco.

## Filtro do andamento nativo

Na tela **Consultar Andamento**, aberta dentro do processo na unidade atendida, a barra **Filtrar andamento** permite escolher **Minha unidade / Todas as unidades** e **Envios e recebimentos / Todas as movimentações**. Por padrão, mostra os envios e recebimentos relacionados à unidade atual. **Ordem** permite manter a ordem original do SEI ou mostrar **Mais recentes primeiro**, comparando data e hora e preservando a ordem original nos empates. **Ver tudo** retira os dois filtros; a escolha fica salva por usuário e unidade neste navegador.

O filtro reconhece a unidade da linha e também a origem escrita em **Processo remetido pela unidade**. Assim, um envio feito pela própria unidade não desaparece só porque o SEI o registra na unidade de destino. Entradas remetidas por outra unidade para a própria unidade e registros **Processo recebido na unidade** também são considerados.

A lista é dividida em **30 resultados do filtro por página**, com **Anterior / Próxima**, quantidade de resultados e página atual. Se o andamento tiver outras páginas nativas, a extensão as consulta no próprio SEI, com a sessão do usuário, para que o filtro não fique limitado aos poucos registros da página inicial. A leitura usa o mesmo tipo de histórico escolhido no SEI (completo/resumido), sem alterar nem submeter o formulário visível. Há limites de 50 páginas, 10.000 registros e um minuto por leitura. Páginas repetidas, contagem alterada ou sessão expirada impedem a importação de uma leitura incompleta. A contagem reconhece também o formato nativo com faixa, como **129 registros - 1 a 100**. O status mostra a quantidade carregada em relação ao total anunciado e só confirma leitura completa quando os números conferem. Se o total não for reconhecido, informa a limitação.

Após uma leitura completa, os controles de paginação nativos ficam temporariamente ocultos, dando lugar à paginação de 30 resultados. Se a leitura falhar ou não puder ser confirmada, os registros já carregados e a paginação nativa continuam disponíveis, com aviso explícito da limitação. Após reunir todas as páginas, a faixa da primeira página é retirada da legenda para não contradizer a paginação local; a legenda original é restaurada ao sair. Registros originais, cores e links são preservados, e a ordem original é restaurada ao sair; os registros importados são removidos e a paginação nativa é restaurada ao sair. Leitores do resumo continuam acessando todas as linhas carregadas, mesmo quando estão escondidas pela paginação visual. A interface se recupera se a tabela ou a barra forem substituídas.

O registro compartilhado de abertura não altera status manual, assuntos, assinaturas ou histórico de classificação. Em falha de rede, a extensão guarda a abertura no navegador e tenta novamente; o painel informa falhas de sincronização de vistos. Consultas concorrentes usam versões para não restaurar um aviso já reconhecido. Avisos locais existentes podem ser migrados sem confundir uma referência inicial silenciosa com reconhecimento por um colega. Links autenticados, cookies e conteúdo dos documentos não são enviados à API. Todos os usuários precisam atualizar a extensão para 0.14.0; versões anteriores não aplicam todas as restrições de bloco desta versão.

## Resumo do processo e situação do documento

Na versão 0.14.0, o card usa painéis separados e prioriza pendências, assinatura e controles do bloco. O seletor aparece como **Status manual**. Envio e recebimento formam uma sequência visual; uma nota explica o registro do recebimento. **Nesta unidade** mostra **Processo aberto** e informa que o tempo conta desde a última movimentação, não desde a chegada. Alertas identificam quando se referem a outra unidade. O tipo do processo fica em um detalhe recolhido no final; clique para abrir. Último envio e outras unidades continuam recolhidos por padrão.

Ao entrar no processo na unidade atendida, aparece um card na árvore, logo abaixo de **Consultar Andamento**, sem precisar selecionar um documento. O card consulta todas as páginas do histórico completo, com os mesmos limites e validações do leitor da tabela. Leituras completas ficam em cache por até um minuto, por processo, unidade e usuário. Ao completar a leitura do andamento na tabela, o card aberto é atualizado com esses dados. Eventos são comparados por data e hora real. O resumo mostra o número e o tipo do processo, a última movimentação carregada (data, unidade, descrição e autor), por padrão da unidade atual, o último envio, as unidades abertas e o tempo parado, as pendências de assinatura e os assuntos/status dos blocos internos. Tipo e pendências aparecem assim que a árvore está disponível; o restante carrega em seguida, com indicação de espera. Em **Última movimentação**, o seletor **Minha unidade / Todo o processo** permite alternar entre o registro mais recente da unidade atual e o mais recente do processo. A escolha fica salva por usuário e unidade neste navegador e usa os registros já carregados, sem novas consultas ao alternar. Quando não há registro local disponível, o card informa que não encontrou movimentação da unidade nos registros carregados, sem substituí-la por outra unidade. É um resumo dos dados do SEI, sem leitura ou resumo automático do conteúdo dos documentos.

Ao selecionar um documento da unidade, o mesmo card acrescenta as informações específicas dele. Ao sair do documento ou voltar à raiz do processo, o resumo é restaurado. Documentos de outras unidades mantêm o resumo do processo. Há sempre um único card; o conteúdo do documento fica livre, sem sobreposição, e o card não entra na impressão. As informações ficam empilhadas para caber na coluna estreita da árvore:

- **Assinatura do documento selecionado**: quem assinou, cargo, data e hora, lidos do rodapé. Na falta do rodapé, usa a árvore ou o andamento. Sem assinatura, indica **Não assinado** ou, se o documento estiver em bloco de assinatura, **Aguardando assinatura · bloco nº N (descrição)** na mesma linha.
- **Chegada à unidade**: data e hora do último envio destinado à unidade atual, unidade de origem e quem enviou, lidos de "Processo remetido pela unidade". Mostra também o recebimento posterior quando registrado. O autor do recebimento não é apresentado como remetente. Nova remessa posterior ao recebimento inicia outra entrada; registros são comparados pela data, independentemente da ordem da tabela. Ausência de envio/recebimento e histórico incompleto são informados explicitamente. Aparece tanto no resumo quanto ao selecionar documento, sem novas consultas além do andamento já usado pelo card.
- **Último envio** (recolhido por padrão, com data e quantidade de destinos no resumo; clique para ver destinos e autor): data e hora, unidades de destino e quem enviou, a partir do último "Processo remetido pela unidade" do andamento. Avisa quando esse envio é anterior ao documento.
- **Tempo parado**: para cada unidade com o processo aberto, o tempo desde o último andamento ali. Fica amarelo a partir de 3 dias e vermelho a partir de 7. Também mostra quando o processo está aberto na própria unidade. As outras unidades ficam no acordeão **Aberto em N unidades · maior tempo parado: X**, fechado por padrão; ao abrir, aparecem os tempos individuais. A situação na própria unidade e o alerta de tempo parado ficam fora do acordeão. Quando alguma unidade passa de 3 dias, um alerta no topo do card mostra a mais antiga, por exemplo "⏱ Parado há 10 dias em SEPM/3°CPA", e quantas outras estão acima do limite. A borda do card fica na mesma cor, e o alerta continua visível com o card oculto.
- **Blocos**: blocos internos em que o processo está (os de assinatura aparecem na linha da assinatura), com descrição e estado quando constam da lista de blocos. Blocos de outras unidades são ignorados.
- **Inclusão no bloco interno**: junto de cada bloco, mostra **Incluído no bloco em** (data e hora) e **Incluído por** (nome/login), com base no andamento. Se houve retirada e reinclusão, mostra a última inclusão. É diferente do recebimento na unidade; histórico incompleto recebe aviso explícito.
- **Organizador**: em cada bloco interno, assunto e status compartilhados. É possível alterar o status e os assuntos ali mesmo, com as mesmas regras de versão e histórico da lista do bloco. O Organizador do card sincroniza a cada dez segundos enquanto a página está visível; sem sincronização, os dados anteriores ficam identificados e a edição é desabilitada até reconectar.

Enquanto o andamento, os blocos e o Organizador carregam, uma barra animada sob o cabeçalho e linhas pulsantes indicam a espera (estáticas com "reduzir movimento" do sistema). Documentos de outras unidades e anexos externos não acrescentam detalhes de assinatura; o resumo do processo continua na árvore. Outra unidade atual não exibe o card. **Ocultar/Mostrar** é lembrado no navegador. O andamento e as listas de blocos são consultados no próprio SEI, com a sessão do usuário, e ficam em cache na aba por 1 e 2 minutos. Quando o andamento tem mais de uma página, valem só os registros carregados. Histórico vazio, incompleto ou não reconhecido não permite declarar o processo concluído nem afirmar ausência de envio. Histórico incompleto também não afirma ausência de blocos: mostra Blocos não confirmados. Os blocos vêm dos registros "inserido no bloco"/"retirado do bloco" do andamento.

## Avisos de edição compartilhados

Na lista do bloco e no card do processo, a extensão mostra quem está com um documento no editor do SEI. O aviso distingue **editor aberto** de **edição recente** (entrada no campo editável nos últimos 60 segundos), com nome/login e número do documento quando identificado. Na falta do número de protocolo, mostra o identificador interno explicitamente como ID. Várias pessoas no mesmo processo aparecem separadamente; várias janelas do mesmo usuário/documento são reunidas no aviso.

A detecção exige a página editor_montar, processo/documento/unidade confirmados e um campo editável, inclusive em iframe. A identidade vem do cabeçalho do SEI ou da janela que abriu o editor. Visualizar um documento não registra edição. Uma faixa discreta no editor confirma que a presença foi informada ou aponta falha de conexão.

A presença é renovada e consultada a cada 20 segundos. Ao sair do editor, a extensão tenta encerrar a presença imediatamente. Sem confirmação, o servidor expira o aviso após 90 segundos; a remoção visual ocorre na próxima atualização. Em falha de conexão, não enfileira presença para reprodução posterior e não mantém avisos expirados como atuais. O aviso é informativo e não bloqueia edição nem prova que uma alteração foi salva.

O conteúdo digitado, valores dos campos, cookies e URLs autenticadas não são enviados: apenas unidade, processo, documento, número identificado, usuário, identificador aleatório da janela e tempo desde a última entrada. Assuntos, status, reconhecimento de novos e histórico continuam independentes. Todos precisam da extensão 0.14.0 e da API atualizada. Testes com fixtures e popup no Chromium confirmaram abertura, atividade, fechamento e ausência de conteúdo nas requisições; validação no editor real do SEI ainda pendente.

## Pendência antes de enviar

Documento pendente é um documento interno gerado pela unidade e ainda sem nenhuma assinatura, segundo a árvore do processo. Documentos externos e anexos não contam.

- **No card da árvore**: a linha **Pendências antes de enviar** lista esses documentos, exceto o documento aberto, cuja situação já aparece na linha Assinatura. Quando há endereço nativo válido, clicar na pendência seleciona e abre o documento pela árvore do SEI. Aparece também no resumo inicial do processo e ao abrir documentos de outras unidades.
- **Na tela Enviar Processo** aberta pela árvore: uma faixa amarela acima da lista de processos. Ao clicar em Enviar, por clique, Enter ou Alt+E, a extensão pede confirmação. Cancelar mantém a tela; confirmar segue o envio nativo do SEI sem alteração. Depois de confirmar, não pergunta de novo na mesma tela.

O aviso nunca bloqueia o envio. Sem pendência, nada aparece. Envios em lote pelo Controle de Processos não são verificados. Assinaturas parciais contam como assinadas, porque o SEI não informa quem ainda precisa assinar. Documentos em pastas da árvore ainda não abertas não entram na verificação.

## Histórico e desfazer

O painel mostra as últimas 100 operações; o SQLite conserva todo o histórico. As cores distinguem criação, exclusão, atribuição, retirada, renomeação, status e desfazer, com descrição textual independente da cor. Passe o mouse sobre o login para ver o nome completo e o órgão registrados. Registros antigos sem nome completo informam que ele não está disponível.

**Desfazer** fica à direita, depois da frase do registro, somente nos registros do próprio login e órgão que ainda possam ser revertidos. A operação consulta novamente o estado e o histórico antes de confirmar, mostra a alteração escolhida e o autor, e envia o identificador do registro com a versão consultada. Cancelar não grava.

O servidor compara o autor novamente e aplica somente as diferenças produzidas pela operação escolhida. Uma alteração posterior em outro campo do mesmo processo, em outro vínculo ou em outro processo permanece. Se um campo afetado mudou depois, mesmo que tenha voltado ao valor anterior, ou surgiu dependência da pasta, a reversão inteira é bloqueada. Operações em lote não são parcialmente desfeitas. Alterações concorrentes são rejeitadas pela versão.

Registros já desfeitos, sem efeito ou que representam um desfazer não oferecem novo desfazer. O botão desaparece depois da reversão e o registro original continua no histórico com a indicação **Desfeita**. A reversão também gera seu próprio registro.

## Dados e identificação

Persistimos unidade, bloco, IDs internos de processos, números formatados usados nas operações, abas, vínculos, status, versões e histórico com autor, horário e snapshots anterior/posterior. Desde a 0.1.6, cada registro guarda a lista de abas e somente os processos que a operação alterou; registros antigos com o estado completo continuam válidos para desfazer. Não enviamos documentos, anotações, URLs autenticadas, cookies ou hashes do SEI. O card do documento lê o andamento e os blocos diretamente no SEI e não envia esses dados à API; à API vão apenas o bloco interno e o processo, como na lista do bloco. O worker faz as chamadas sem cookies e sem referrer.

O autor vem do título do ícone do usuário no SEI: nome, login e órgão. A API não autentica essa identidade; comparar login e órgão é uma regra funcional para o uso normal da extensão, não uma garantia contra chamadas que declarem outra identidade. O usuário autorizou API pública sem token e instalação sem configuração. O servidor restringe a unidade, valida dados e tamanho das requisições e usa transações com controle de versão. A administração da VPS e do Portainer permanece restrita.

## Serviço e implantação

A API está implantada na KMV2, com HTTPS via Traefik e imagem pública sem credenciais ou banco. A stack `sei-organizador` é gerenciada integralmente pelo Portainer, com edição, reimplantação e acesso exclusivo dos administradores. Uma réplica escreve no volume persistente; não escalar SQLite em volume compartilhado/NFS.

[Operação, imagem implantada, backups e rollback](deploy/KMV2.md). [Todas as versões e mudanças](CHANGELOG.md).

Ações HTTP: `GET /healthz`, `GET /v1/units/:unit/blocks/:block`, `GET .../history` e `POST ...` com `{version, actor, action}`. Ações: create, rename, delete, assign, unassign, status e undo. Status aceita de 1 a 1.000 IDs únicos e aplica o lote em uma transação, sujeito ao limite HTTP de 64 KiB; valores anteriores ficam registrados por processo. Desfazer exige `historyId`; o histórico inclui `undoable` e `undoReason`. O banco existente é compatível e não exige migração para estas mudanças.

Para desenvolvimento local, com Node.js 24 ou superior:

```powershell
$env:SEI_UNIT_ID='ID_DA_UNIDADE'
npm start
```

O serviço local usa loopback e `data/organizador.sqlite`. A extensão distribuída continua apontando para a VPS; testar contra uma API local exige uma cópia de desenvolvimento com destino e permissão ajustados. O compose local lê a unidade e publica somente no loopback:

```powershell
docker compose -f deploy/compose.yaml up -d --build
```

`SEI_ALLOW_PUBLIC_ACCESS=true` habilita acesso sem token explicitamente. Fora desse modo, o servidor oferece hashes de tokens e recusa bind em rede sem configuração de autenticação. Essas ferramentas foram preservadas para desenvolvimento e rollback; usuários da extensão atual não precisam de token.

## Validação e distribuição

```powershell
npm test
npm run check
Compress-Archive -Path extension/* -DestinationPath artifacts/sei-organizador-extension.zip -Force
```

Resultado da entrega 0.16.0: **167 testes passaram**, além das verificações de sintaxe e formatação. O leitor de Recebidos foi conferido nos dois HTMLs reais fornecidos, e a leitura completa de seis páginas/217 processos foi validada por simulação, integrada ao painel e à API. Dois navegadores, persistência, recebimento, reenvio e falhas foram testados. Uma nova chegada na sessão real do SEI ainda precisa de conferência.

O container foi validado com usuário não root, limites de recursos, unidade restrita, acesso sem token e persistência após recriação. As camadas da imagem foram verificadas quanto a credenciais conhecidas, arquivos privados e banco. Na API implantada, testes sintéticos confirmaram autoria, preservação do colega no mesmo processo, conflitos e repetição; os registros técnicos foram removidos. HTTPS confiável, tarefa healthy e gestão pelo Portainer foram conferidos.

Os arquivos em `artifacts/` são resultados locais, fora do Git: ZIPs, imagens de validação, backups e configurações operacionais anteriores. A fonte da extensão está versionada e permite regenerar o ZIP. A cada nova entrega da extensão, incrementar manifesto, pacote e lockfile, registrar o CHANGELOG e atualizar a distribuição.

### Navegação em documentos (0.16.2)

Nas telas de processo, o monitor sincroniza avisos pela API sem iniciar consultas automáticas de listas ou históricos no SEI. O card aproveita andamento completo recente em cache; sem cache, use **Consultar andamento** para carregar os detalhes. As varreduras automáticas continuam nas demais telas do SEI.

O ZIP dos releases usa sempre o nome `sei-organizador-extension.zip`. Link permanente da versão mais recente: https://github.com/flaviokosta79/sei-organizador/releases/latest/download/sei-organizador-extension.zip

### Desempenho da API (0.16.4)

O servidor reutiliza o cálculo do histórico enquanto os dados permanecem iguais, com cache limitado e invalidação nas gravações e alterações externas. O cabeçalho `Server-Timing` indica o tempo de processamento da resposta. Medições da implantação e seus limites estão em `deploy/performance-0.16.4.json`. Essa otimização não altera o carregamento nativo de documentos pelo SEI.

### Atualidade do alerta da Secretaria (0.16.5)

O som e a notificação de processo para receber exigem uma leitura do SEI de até 90 segundos. Uma leitura mais antiga permanece identificada no painel, sem gerar aviso sonoro. Se o processo ainda estiver pendente numa confirmação recente, o aviso ocorre uma vez; se já tiver sido recebido ou retirado, não há aviso atrasado. Outros usuários podem receber ou encaminhar o processo entre a leitura e a abertura da lista.

### Configurações no próprio SEI (0.16.6)

Clique em **⚙ Organizador** no cabeçalho do SEI. O modal reúne bloco de trabalho, atualização da lista de blocos, sons e chefes de seção. Escolha o bloco e clique em **Salvar bloco de trabalho** para aplicar às páginas abertas, sem sair do SEI. A alteração vale para o usuário conectado neste navegador. A página de opções do Chrome continua disponível como alternativa para os perfis locais.

### Sugestões de chefes (0.17.0)

Em **⚙ Organizador → Chefes de seção**, digite parte do nome ou login em **Buscar usuário pelo nome ou login**. Selecione a sugestão por clique ou pelas setas e Enter. O campo abaixo recebe apenas o login; clique em **Salvar chefes** para aplicar. Escape fecha primeiro as sugestões e depois o modal.

O catálogo inicial contém os 65 usuários do 5º CPA fornecidos no seletor de atribuição. Ele não consulta um diretório em tempo real: ao abrir a tela nativa de atribuição na unidade atendida, a extensão lê o seletor já carregado e atualiza a cópia local. Não faz novas consultas, não muda a atribuição e não envia o catálogo à API. A digitação manual continua disponível para usuários novos.
