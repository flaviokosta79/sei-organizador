# SEI Organizador — 0.11.0

Extensão Chrome MV3 para organizar os processos de blocos internos do SEI-RJ por assunto e status manual. A API Node.js/SQLite compartilha as classificações entre colegas da unidade. A extensão preserva os controles, as anotações e as operações nativas do SEI.

## Instalação

1. Clone o projeto e carregue a pasta `extension` em `chrome://extensions`, com o modo desenvolvedor habilitado. Como alternativa, extraia o ZIP de distribuição em uma pasta e carregue essa pasta, que contém `manifest.json` na raiz.
2. Abra a lista de processos de um bloco interno do SEI na unidade atendida pela extensão.
3. Após atualizar, recarregue a extensão no Chrome e depois a página do bloco.

O serviço HTTPS `https://ext.5cpa.com.br`, a unidade e o órgão estão fixos em `extension/config.js`. Não há campos de endereço, unidade ou token para preencher. Valores antigos salvos no navegador são ignorados. A extensão só inicializa nas listas internas reconhecidas e na unidade definida.

```powershell
git clone --recurse-submodules https://github.com/flaviokosta79/sei-organizador.git
cd sei-organizador
npm ci
```

Para clone existente, execute `git submodule update --init`. `referencias/sei` é o submódulo do [SEI++ original](https://github.com/jonatasrs/sei), usado como referência independente; não é necessário para executar o organizador. Sua licença e seu histórico são preservados.

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

Ao abrir um bloco interno da unidade atendida, a extensão começa a acompanhá-lo automaticamente. A barra de alertas fixa no rodapé, com a cor do cabeçalho do SEI, continua disponível enquanto você navega em outras telas do SEI. Até 20 blocos abertos nesta sessão do navegador são acompanhados, com uma consulta por minuto e uma única aba consultando por usuário, mesmo com várias abas abertas. É preciso manter ao menos uma tela do SEI aberta na unidade atendida e a sessão válida; depois de fechar e reabrir o navegador, abra novamente os blocos desejados.

- A primeira leitura completa de cada bloco e usuário cria a referência sem avisar os processos existentes. As referências e os avisos ainda não reconhecidos ficam no navegador. Nas leituras seguintes, a comparação usa os IDs, inclusive quando saídas e entradas mantêm a mesma quantidade total. Uma reinclusão detectada depois de uma saída também gera aviso.
- Uma entrada detectada gera notificação do sistema, o áudio Novo SEI (volume de reprodução de 85%), contador no ícone da extensão e aviso no painel com links para os processos. Clique na notificação para abrir o bloco; clique no ícone da extensão para abrir o painel em uma tela do SEI. A linha carregada de um processo novo recebe o marcador **Novo**. O painel permite marcar os avisos como vistos por bloco ou de uma vez.
- Os sons são fixos por evento: **Novo SEI** (sound/novosei.mp3) para entrada de processo no bloco, e **Assinar** (sound/assinar.mp3) para mudança do status manual do Organizador para Assinar. O toque padrão de três toques foi removido. Os MP3 originais continuam sem alteração e incluídos no ZIP.
- No cabeçalho do SEI, clique em **⚙ Organizador** para abrir **Configurações do SEI Organizador**. Em **Chefes de seção**, informe os logins do SEI separados por vírgula ou linha e clique em **Salvar chefes**. **Adicionar meu login** preenche o login conectado, que também aparece no painel. A lista é salva por unidade neste navegador; configure-a no navegador de cada chefe. Os outros logins continuam recebendo Novo SEI, mas não recebem avisos automáticos de Assinar. A lista é uma preferência de avisos, não uma alteração das permissões do SEI.
- O monitor consulta também o estado e o histórico compartilhados do Organizador nos blocos acompanhados, a cada minuto. Assim, o chefe recebe aviso de mudanças feitas por colegas em outros computadores, desde que tenha o bloco monitorado e o login configurado. A primeira leitura de status é silenciosa; repetir o mesmo status não repete o som. Pendências reconhecidas não voltam a avisar sem nova mudança. Se o status sair de Assinar ou o processo sair do bloco, a pendência é retirada. Uma entrada de processo já marcado como Assinar não é presumida como mudança de status.
- O rodapé fica reservado aos alertas: separa **Novos no bloco** e **Para assinar**, com links, reconhecimento dos avisos e erros de consulta independentes. A barra permanece fina e recolhida, com contagens de novos processos e pendências de assinatura; sem novidades, mostra Nenhum alerta novo. Um pequeno indicador amarelo destaca avisos ou falhas sem mudar a cor de toda a barra. Ao clicar, os detalhes abrem para cima e têm rolagem própria. Novos avisos não expandem o painel automaticamente. Esc recolhe os detalhes e devolve o foco ao resumo. Blocos sem avisos ou erros não são listados. O espaço da barra é reservado no layout da página, incluindo a área dos iframes do processo; a reserva acompanha a altura da barra e é removida ao sair da unidade ou da página. O botão nativo de voltar ao topo fica acima dela. Cor e contraste acompanham o cabeçalho; a barra não entra na impressão. Configurações e testes de som ficam exclusivamente na janela aberta pelo cabeçalho. A janela fecha por **Fechar** ou **Esc** e preserva o texto em edição durante atualizações dos alertas. Se o estado e o histórico chegarem em versões diferentes, mantém a referência anterior e tenta novamente no próximo ciclo. São usados os últimos 100 registros fornecidos pelo histórico; muitas mudanças entre consultas podem exceder essa janela.
- **Silenciar som**, **Ativar som**, **Testar som** (Novo SEI) e **Testar Assinar** ficam nessa janela de configurações, junto com o diagnóstico de reprodução. Os testes são manuais e podem ser ouvidos mesmo por quem não está na lista de chefes, sem alterar o silenciamento. A reprodução usa volume de 85%, aguarda a conclusão do arquivo e informa erro ou horário de término. O reprodutor offscreen usa apenas arquivos locais e enfileira os avisos para não interrompê-los. Se houver confirmação de término sem som audível, confira o volume e a saída de áudio do navegador no sistema operacional.

- A consulta não recarrega a tela, não muda filtros nem seleções e não executa ações sobre processos. A leitura consulta o próprio SEI sem pesquisa, percorre as páginas e só aceita o resultado depois de confirmar a contagem completa. Histórico de classificações e dados da API não são usados para presumir entradas.
- Login expirado, página inesperada, erro de rede, contagem inconsistente ou paginação repetida preservam a referência anterior e mostram falha de atualização. O monitor tenta novamente no próximo ciclo. A leitura tem limites de 50 páginas, 10.000 processos por bloco e um minuto por bloco; resultados incompletos não geram entradas presumidas.
- O acompanhamento identifica diferenças entre consultas; não é uma notificação em tempo real do servidor SEI. Entradas removidas antes da consulta podem não ser vistas. O Chrome pode atrasar consultas quando o computador suspende ou o navegador limita sua execução.

A versão exige Chrome 120 ou superior e acrescenta permissões de armazenamento, alarmes, notificações, áudio offscreen e acesso ao host do SEI. IDs, números, preferências e avisos ficam no armazenamento local da extensão. URLs autenticadas ficam apenas no armazenamento de sessão do navegador e não são enviadas à API do Organizador. Não há endereço, unidade ou token para configurar. Esta entrega foi validada com testes automatizados de leitura, coordenação entre abas, painel e áudio; não houve confirmação de som/notificação em uma sessão real do Chrome/SEI.

## Filtro do andamento nativo

Na tela **Consultar Andamento**, aberta dentro do processo na unidade atendida, a barra **Filtrar andamento** permite escolher **Minha unidade / Todas as unidades** e **Envios e recebimentos / Todas as movimentações**. Por padrão, mostra os envios e recebimentos relacionados à unidade atual. **Ordem** permite manter a ordem original do SEI ou mostrar **Mais recentes primeiro**, comparando data e hora e preservando a ordem original nos empates. **Ver tudo** retira os dois filtros; a escolha fica salva por usuário e unidade neste navegador.

O filtro reconhece a unidade da linha e também a origem escrita em **Processo remetido pela unidade**. Assim, um envio feito pela própria unidade não desaparece só porque o SEI o registra na unidade de destino. Entradas remetidas por outra unidade para a própria unidade e registros **Processo recebido na unidade** também são considerados.

A lista é dividida em **30 resultados do filtro por página**, com **Anterior / Próxima**, quantidade de resultados e página atual. Se o andamento tiver outras páginas nativas, a extensão as consulta no próprio SEI, com a sessão do usuário, para que o filtro não fique limitado aos poucos registros da página inicial. A leitura usa o mesmo tipo de histórico escolhido no SEI (completo/resumido), sem alterar nem submeter o formulário visível. Há limites de 50 páginas, 10.000 registros e um minuto por leitura. Páginas repetidas, contagem alterada ou sessão expirada impedem a importação de uma leitura incompleta. A contagem reconhece também o formato nativo com faixa, como **129 registros - 1 a 100**. O status mostra a quantidade carregada em relação ao total anunciado e só confirma leitura completa quando os números conferem. Se o total não for reconhecido, informa a limitação.

Após uma leitura completa, os controles de paginação nativos ficam temporariamente ocultos, dando lugar à paginação de 30 resultados. Se a leitura falhar ou não puder ser confirmada, os registros já carregados e a paginação nativa continuam disponíveis, com aviso explícito da limitação. Após reunir todas as páginas, a faixa da primeira página é retirada da legenda para não contradizer a paginação local; a legenda original é restaurada ao sair. Registros originais, cores e links são preservados, e a ordem original é restaurada ao sair; os registros importados são removidos e a paginação nativa é restaurada ao sair. Leitores do resumo continuam acessando todas as linhas carregadas, mesmo quando estão escondidas pela paginação visual. A interface se recupera se a tabela ou a barra forem substituídas.

## Resumo do processo e situação do documento

Na versão 0.11.0, o card usa painéis separados e prioriza pendências, assinatura e controles do bloco. O seletor aparece como **Status manual**. Envio e recebimento formam uma sequência visual; uma nota explica o registro do recebimento. **Nesta unidade** mostra **Processo aberto** e informa que o tempo conta desde a última movimentação, não desde a chegada. Alertas identificam quando se referem a outra unidade. O tipo do processo fica em um detalhe recolhido no final; clique para abrir. Último envio e outras unidades continuam recolhidos por padrão.

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
Compress-Archive -Path extension/* -DestinationPath artifacts/sei-organizador-extension-0.11.0.zip -Force
```

Resultado da entrega 0.11.0: **122 testes passaram**, além da verificação de sintaxe e de formatação. A chegada à unidade e a inclusão no bloco foram validadas em fixtures, sem validação desta alteração no SEI real. Use `npm run format` antes de entregar alterações na extensão. A estrutura dos campos foi conferida na página real em entregas anteriores; o layout foi validado em fixture com dados fictícios em 1280 e 520 px. A pesquisa real não foi submetida durante a validação visual. Testes cobrem navegação, recuperação da interface, múltiplos assuntos, filtros, controles nativos, indisponibilidade, histórico, reversão seletiva, autoria informada, conflitos, repetição e persistência.

O container foi validado com usuário não root, limites de recursos, unidade restrita, acesso sem token e persistência após recriação. As camadas da imagem foram verificadas quanto a credenciais conhecidas, arquivos privados e banco. Na API implantada, testes sintéticos confirmaram autoria, preservação do colega no mesmo processo, conflitos e repetição; os registros técnicos foram removidos. HTTPS confiável, tarefa healthy e gestão pelo Portainer foram conferidos.

Os arquivos em `artifacts/` são resultados locais, fora do Git: ZIPs, imagens de validação, backups e configurações operacionais anteriores. A fonte da extensão está versionada e permite regenerar o ZIP. A cada nova entrega da extensão, incrementar manifesto, pacote e lockfile, registrar o CHANGELOG e atualizar a distribuição.
