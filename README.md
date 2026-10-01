# SEI Organizador — 0.1.0

## Obter o projeto completo

```powershell
git clone --recurse-submodules https://github.com/flaviokosta79/sei-organizador.git
cd sei-organizador
npm ci
```

Para clone existente: `git submodule update --init`. SEI++ é referência independente do [projeto original](https://github.com/jonatasrs/sei), não necessário para executar o organizador. Sua licença e histórico são preservados; não há Git interno copiado como arquivo do projeto principal.

Extensão Chrome MV3 própria para a lista de processos dos blocos internos do SEI-RJ. Referências em `referencias/sei` permanecem intactas como submódulo. Sem dependências de produção; requer Node.js 24. Para os testes de DOM, execute `npm ci` (jsdom é dependência de desenvolvimento).

## Executar localmente

No PowerShell: `$env:SEI_UNIT_ID='ID_DA_UNIDADE'; npm start`. Serviço em `http://127.0.0.1:8787`; SQLite em `data/organizador.sqlite`. Configure o ID numérico lido do parâmetro `infra_unidade_atual` na página do SEI, sem copiar a URL autenticada.

Em `chrome://extensions`, habilite modo desenvolvedor e carregue a pasta `extension`. Abra as opções da extensão e informe origem do serviço e unidade. Aceite a permissão apenas para essa origem. Reabra o bloco interno. Cada colega instala e configura a mesma origem/unidade.

## Comportamento

- Geral conserva todos os processos carregados e os comandos originais. Classificar nunca chama operações do SEI.
- Crie assuntos manualmente; clique no controle da coluna Assunto ou use o clique direito na área da linha para Atribuir a/Retirar de uma pasta. Um processo pode estar em várias abas. Renomear/excluir aba mantém os processos no bloco.
- Trocar de aba desmarca seleções que ficaram ocultas para evitar ações nativas sobre linhas invisíveis.
- Sincronização a cada 10 segundos enquanto a página está visível. Conflitos de versão são rejeitados; recarregue e repita a intenção. Não há gravação offline: falhas retornam ao Geral e desabilitam alterações até reconexão.
- Histórico mostra as últimas 100 operações; todo histórico permanece no SQLite. Desfazer restaura o estado anterior à última operação do bloco, incluindo operações de colegas. Desfazer novamente alterna os estados; não é uma pilha pessoal de undo.
- Paginação/pesquisa: apenas processos presentes no DOM podem ser selecionados. Classificações são persistidas por ID e reaplicadas quando a página é carregada. Contagens globais de processos não são apresentadas. Mudanças de linhas na tabela são observadas; substituição completa da tabela é detectada e reinicializa a interface.

## Dados e limites de confiança

Persistimos unidade, bloco, IDs internos de processos, abas, vínculos, versões e histórico (autor, horário UTC, ação e estados anterior/posterior). Números formatados dos processos selecionados são enviados e guardados no histórico, junto aos IDs internos. Não enviamos anotações, documentos, URLs autenticadas, cookies ou hashes SEI. As chamadas partem do worker com credenciais omitidas e sem referrer.

Autor vem do title `a#lnkUsuarioSistema`: Nome (login/órgão). Na ausência do formato, Usuário não identificado. Identidade sempre não verificada. A unidade vem do href desse elemento; serviço restringe a uma unidade configurada. A extensão não equivale a autenticação: qualquer pessoa com acesso ao serviço pode declarar autor e alterar classificações. Para cumprir ausência de login adicional, hospede em rede privada acessível aos colegas (VPN/rede da unidade) ou atrás de uma política de acesso existente. Não exponha diretamente na Internet sem definir controle de acesso. Esse controle de rede e o destino VPS ainda precisam ser definidos.

## VPS preparado, sem deploy

Defina `SEI_UNIT_ID` e execute `docker compose -f deploy/compose.yaml up -d --build` no host escolhido. Porta publicada apenas no loopback; configure proxy HTTPS e acesso privado no host antes de disponibilizar aos colegas. Para proxy em outra rede/container adapte a rede Docker explicitamente. Volume nomeado preserva o SQLite entre recriações. Faça backup usando a API de backup do SQLite ou com o serviço parado (incluindo arquivos WAL se copiar enquanto ativo). Restaurar: pare serviço, restaure banco e permissões do volume, reinicie. Não remover o volume ao atualizar.

`GET /healthz`; `GET /v1/units/:unit/blocks/:block`; `GET .../history`; `POST ...` com `{version,actor,action}`. Ações create/rename/delete/assign/unassign/undo/status. Serviço usa transação e versão para serializar alterações; execute uma instância com volume local, não compartilhe SQLite em NFS ou escale réplicas.

## Validação


`npm test` testa persistência, classificação, exclusão, recuperação, conflitos e isolamento. `npm run check` verifica sintaxe. Fixtures locais documentadas em `test`; nenhuma operação de gravação foi executada no SEI real pelo agente. Seletores conferidos por inspeção somente leitura: formulário `#frmRelBlocoProtocoloLista`, tabela `#tblProtocolosBlocos`, links `id_procedimento`, inserção antes de `#divInfraAreaPaginacaoSuperior`. IDs de linha repetem `trPos0` e não são usados como identidade.


## Histórico atualizado

Cada registro exibe data/hora, somente login, ação em português, números dos processos e nome da aba no momento da operação. Unidade, bloco e nome completo permanecem nos metadados, sem aparecer no registro. Registros antigos recuperam nomes pelos snapshots; números são resolvidos pelo DOM atual ou exibem Identificador interno, sem fabricar informação. Não exige migração nem apagar o banco.

Para atualizar: substitua os arquivos da extensão, clique em Recarregar em chrome://extensions e recarregue a página do bloco. Reinicie também o serviço para disponibilizar os rótulos antigos e persistir números nas novas operações. Para executar testes: npm ci e npm test.


Compatibilidade com serviço antigo: a extensão usa o nome atual apenas se a versão corresponder ao histórico e nenhuma alteração posterior tiver renomeado/excluído a aba ou desfeito ações. Em situações ambíguas, reinicie o serviço atualizado para recuperar o nome exato dos snapshots. Não apagar o banco.

## Menu por processo e cores do histórico

Clique direito na área da linha (fora de links, checkboxes e controles) para escolher uma pasta e atribuir somente aquele processo. Outras seleções não participam. Links e controles mantêm o menu nativo; offline ou sem pastas, o menu nativo também permanece. Pelo teclado, foque a linha com Tab e use Shift+F10 ou tecla de menu; navegue com setas/Home/End e confirme com Enter. Escape, clique fora, rolagem, redimensionamento ou escolha fecham o menu.

Histórico: criação verde, exclusão vermelho, atribuição azul, retirada laranja, renomeação roxo e desfazer cinza. A ação continua escrita em português, sem depender da cor. Atualize os arquivos, recarregue a extensão em chrome://extensions e recarregue o bloco. Esta melhoria não exige mudar banco nem serviço.

O menu contextual mostra todas as pastas: vínculos existentes aparecem marcados (✓ Retirar de), os demais oferecem Atribuir a. Cada item expõe seu estado marcado ao leitor de tela. Retirar uma classificação mantém os demais vínculos e o processo no Geral; na aba retirada, a linha deixa de aparecer após salvar. Sincronização fecha menus abertos para evitar ações baseadas em estados antigos. Banco e serviço não precisam de migração.

## Sem assunto e contagens locais

Geral continua como aba inicial. Sem assunto é uma aba virtual, sem edição/exclusão, para processos sem vínculo com pastas existentes. Vínculos obsoletos são ignorados. Retirar o último assunto faz o processo entrar nela; múltiplos vínculos não duplicam a contagem do Geral. Nada novo é persistido para essa aba.

As contagens das abas e o resumo consideram IDs únicos efetivamente carregados na página, inclusive após pesquisa/paginação; não são totais globais do bloco. Linhas novas e sincronização atualizam os números. Filtro ativo mostra aviso e Mostrar todos retorna ao Geral. Offline: retorna ao Geral e exibe classificação desconhecida, sem inventar contagem de Sem assunto. Atualize arquivos, recarregue a extensão e a página; sem migração de banco ou serviço.

O único botão da barra alterna entre Histórico (fechado) e Fechar histórico (aberto); não há botão duplicado no painel. O estado é preservado nas atualizações da barra, com aria-expanded/aria-controls. Requisições pendentes são compartilhadas e respostas atrasadas não reabrem painel fechado. Para atualizar, apenas recarregue extensão e página.


## Copiar número do processo

O botão ⧉ ao lado do link copia apenas seu texto normalizado (espaços externos removidos e espaços consecutivos reduzidos), nunca URL ou ID interno. Usa navigator.clipboard.writeText no clique, sem novas permissões. Sucesso mostra Copiado temporariamente; falha orienta selecionar o número manualmente. Link, seleção e ações nativas permanecem; novas linhas recebem um único botão por link. Recarregue extensão e página para atualizar.

## Status manual compartilhado

Na coluna própria Status, o marcador permite escolher Atenção, Acompanhar, Urgente, Para arquivar ou Sem status. Um status por processo, independente dos assuntos. Clique abre seletor local; setas/Home/End, Enter, Escape e clique fora são suportados. Anotações e ações nativas permanecem. Não calcula prazos nem arquiva/tramita processos.

O serviço valida allowlist, persiste mapa statuses por ID, registra anterior/novo e número no histórico, e mantém conflitos por versão e desfazer. Estados e snapshots antigos sem statuses são tratados como mapa vazio sem alterar esquema ou apagar histórico. Falha de conexão ou servidor antigo mostra Status indisponível; não afirma Sem status nem grava offline.

Atualização necessária: reinicie o serviço com os arquivos atuais, mantendo o banco; recarregue a extensão em chrome://extensions e depois o bloco. Não requer migração destrutiva ou novas permissões. Dados mínimos adicionais: status manual por ID; número apenas no histórico da ação.

## Barra compacta e visível

Abas começam à esquerda, sem nome ou ícone visível de identidade; a região mantém nome acessível. Todos os comandos permanecem visíveis no canto direito da mesma linha em desktop: Criar assunto, Histórico/Fechar histórico, Desfazer, Atualizar. Atribuição e retirada usam o menu de cada processo, aberto pelo controle Assunto, clique direito ou teclado; não há seletor de pastas ou ações em lote na toolbar. Renomear/excluir aparecem quando uma pasta real está ativa. Não há Mais opções nem card expansível. Botões com rótulos pequenos, espaços reduzidos e abas com rolagem horizontal; em telas estreitas, os comandos quebram linha sem desaparecer. Somente a aba ativa tem fundo colorido com contraste; as demais ficam brancas com texto preto. O foco de teclado permanece interno, somente em focus-visible.

A barra usa position:sticky no contêiner de rolagem e mede o cabeçalho SEI para evitar sobreposição. Histórico fica fora da parte sticky com rolagem própria, limitado a 45vh. Avisos de conexão permanecem visíveis; o limite das contagens está no tooltip e descrição acessível. Layout conferido em fixture longa de 50 processos, desktop e 520px, com cabeçalho de 65px e contêiner de rolagem. Fixture: node tools/preview.mjs. Atualize apenas extensão e bloco, sem reiniciar backend.





## Tema e integração visual

A barra acompanha a variável oficial --infra-esquema-cor-barra-sistema observada no SEI; fallback lê a cor do navInfraBarraNavegacao ou usa tom neutro. A faixa, a indicação de visualização e o foco usam contraste calculado. Abas Sem assunto e pastas têm fundo branco, texto e contagens pretos, com fonte, padding, altura e espaçamento iguais aos comandos. A aba ativa usa tom mais escuro derivado do tema e texto branco com contraste mínimo 4,5:1. Botões recebem somente a classe visual infraButton e dimensões/fonte/cores lidas de um botão nativo, sem copiar handlers. Observadores seletivos de tema e load de estilos atualizam cores, sem polling. Status e histórico mantêm cores semânticas. Não altera preferência de tema do SEI.

Espaço antes da tabela: contêiner divInfraAreaPaginacaoSuperior vazio é recolhido somente dentro do formulário marcado da lista de bloco; controles ou texto de paginação fazem ele reaparecer. Margem inferior da barra reduzida a 3px. Recarregue extensão e bloco; sem alteração no serviço/banco.


Foreground da faixa: lê o texto do identificador do cabeçalho (#spnInfraIdentificacaoSistema/.infraTituloLogoSistema), pois a variável de texto geral é do corpo. Preserva branco quando adequado; ajusta levemente o fundo para contraste mínimo 4,5:1 ou usa fallback preto/branco em temas muito claros. Botões mantêm foreground nativo próprio. Separador vertical distingue abas de ações no desktop e horizontal na quebra responsiva.


Geral não exibe contagem e não tem destaque permanente. Somente a aba selecionada recebe cor, inclusive Geral e Sem assunto. A indicação compacta Visualizando mostra a pasta atual ou todos os processos; não há botão Mostrar todos. O retorno ocorre pela aba Geral. Contagens das demais abas são preservadas.

O clone de referência em referencias/sei mantém seu Git independente. Não integrou os primeiros checkpoints; a publicação final o registra como submódulo, com URL original e commit fixado. node_modules, data e artifacts continuam ignorados.

## Colunas Assunto e Status

A tabela insere Assunto e Status depois de Tipo e antes de Anotações. Assunto mostra uma etiqueta e mais N quando necessário; tooltip e nome acessível trazem todos os vínculos válidos. Sem vínculo aparece Sem assunto; sem sincronização aparece Não sincronizado, sem afirmar ausência de classificação. Status permanece manual, com histórico, sincronização e desfazer existentes, e deixa Anotações livre.

Cabeçalhos são reconhecidos pelo nome; células usam data-label ou o mapeamento semântico dos cabeçalhos nativos. Novas colunas têm data-so-column e são inseridas uma única vez em linhas novas. colgroup simples e colspan de linha inteira são ajustados; cabeçalhos mesclados ou colgroups complexos não recebem a extensão da tabela. Seleção, Sequência e Processo usam espaço compacto; o número completo e copiar permanecem em uma linha. Anotações recebe o espaço restante; tabelas estreitas têm rolagem horizontal própria.

Estrutura SEI inspecionada somente em leitura. Visual validado na fixture em 2560, 1366 e 520 px; regressões cobrem novas linhas, múltiplos vínculos, estado desconhecido, ações nativas e seletor de status. Operações reais de anotar/remover não foram executadas; alterações em outras versões do DOM/JavaScript SEI podem exigir adaptação. Recarregue a extensão em chrome://extensions e depois o bloco. Reinicie o serviço atualizado para a proteção adicional do desfazer por identificador de histórico; não há mudança no banco.

## Cabeçalho da tabela durante a rolagem

As células originais do cabeçalho ficam visíveis imediatamente abaixo da barra durante a rolagem vertical, até o fim da tabela. Não há clone de checkbox, links de ordenação ou outros controles. A posição usa o fundo real da barra no viewport, incluindo quebra de comandos e avisos, e é limitada pelo final da tabela. O deslocamento vertical nas próprias células evita a limitação de position:sticky dentro do contêiner com overflow-x; a rolagem horizontal mantém títulos e dados alinhados.

Scroll e resize agendam uma atualização por frame; ResizeObserver acompanha barra, tabela e cabeçalho SEI. Histórico permanece fora da região fixa. Conferido até o processo 50 em 2560 e 520 px, incluindo rolagem horizontal; regressão verifica altura variável, limite da tabela e controle original único. Recarregue a extensão e o bloco para aplicar.

## Retorno nativo à lista após exclusão

O SEI pode retornar à lista com acao=rel_bloco_protocolo_listar e acao_origem=rel_bloco_protocolo_excluir. Essa origem é aceita junto de bloco_interno_listar, mantendo validações de tabela/formulário, unidade e bloco. Antes, o filtro de origem encerrava a extensão antes de criar a barra nessa navegação. Correção reproduzida em fixture com a origem observada na página real; cabeçalho, colunas, cópia e sincronização inicializam normalmente. Não executa exclusão nem altera operações nativas.

## Estado da publicação e limites

Em 01/10/2026, as salvaguardas de navegação passaram `npm run check` e 24 testes. Fixtures visuais foram conferidas em 2560, 1366 e 520 px, incluindo rolagem vertical até o último processo e horizontal com títulos alinhados. Os testes cobrem também origem nativa de retorno, cabeçalho original único, altura dinâmica, novas linhas, colunas idempotentes, múltiplos assuntos, status, cópia, histórico, conflitos e isolamento.

O usuário confirmou funcionamento no SEI real após a correção de origem. Essa confirmação é validação manual, não uma suíte automatizada no SEI. O agente inspecionou a página somente em leitura e não executou exclusão, tramitação ou outras mutações reais. Nenhuma VPS foi implantada neste trabalho.

A extensão exige a rota de lista, formulário/tabela esperados, IDs válidos e órgão SEPM quando identificável. A ativação reconhece a rota de lista e o título/cabeçalho Processos do Bloco Interno; não depende de acao_origem. Outras variantes de navegação, layouts ou JavaScript nativo de outras versões podem exigir adaptação. Substituição completa da tabela recebe reinicialização automática; cabeçalhos mesclados e colgroups complexos não recebem novas colunas. Identidade do autor é informativa; controle de acesso do serviço precisa ser definido antes de disponibilizar aos colegas.

Para preparar o serviço em Docker, sem expor a porta publicamente:

```powershell
$env:SEI_UNIT_ID='ID_NUMERICO_DA_UNIDADE'
docker compose -f deploy/compose.yaml up -d --build
```

Variáveis do serviço: SEI_UNIT_ID (obrigatória), HOST, PORT e DATA_FILE. O Compose mantém a publicação em loopback e SQLite em volume nomeado. Proxy/rede privada e acesso dos colegas não estão configurados por este repositório. Preserve o volume/banco ao atualizar.

O ZIP é gerado e fica em artifacts (ignorado), assim como node_modules e dados operacionais não são publicados. O projeto permanece reproduzível a partir dos arquivos versionados. Para gerar a distribuição atual:

```powershell
New-Item -ItemType Directory -Path artifacts -Force
Compress-Archive -Path extension,server,test,tools,deploy,package.json,package-lock.json,README.md,CHANGELOG.md,AGENTS.md,CLAUDE.md,.gitignore -DestinationPath artifacts/sei-organizador-0.1.0.zip -Force
```

Veja [CHANGELOG.md](CHANGELOG.md) para o resumo das mudanças.

### Correção de retorno após anotações

A página real também retorna à lista com acao_origem=rel_bloco_protocolo_alterar. A dependência da origem foi removida: a extensão exige acao=rel_bloco_protocolo_listar e identificação explícita de Processos do Bloco Interno no título ou h1, além das validações existentes. Testes cobrem origens variadas/ausentes e confirmam nenhuma inserção ou chamada em páginas de processo. A alteração visual relatada na página do processo ainda não foi reproduzida no navegador real. Recarregue extensão e bloco para validar.

## Salvaguardas de permanência

Um observador de ciclo de vida aguarda o DOM da lista, restaura a barra se removida e reinicializa quando formulário/tabela/unidade/bloco mudam. Não depende da origem de retorno. Há âncora alternativa na própria tabela quando os contêineres opcionais estão ausentes. Retorno pelo histórico do navegador (pageshow/bfcache) reconstrói observadores e sincronização.

Cada instância limpa timers, observadores, eventos e elementos gerados ao sair da lista; atributos nativos das linhas são restaurados. Respostas atrasadas não atualizam instâncias substituídas. A interface não é duplicada e não é inserida em páginas de processo ou outros tipos de bloco. Falhas de inicialização são registradas no console, sem catch silencioso.

A permanência é nas listas de bloco interno reconhecidas, enquanto a extensão estiver habilitada no Chrome. Ela não se impõe a outras páginas nem pode contornar desabilitação/recarregamento pelo navegador. Sem conexão, Geral e a barra permanecem, e alterações compartilhadas são bloqueadas para não gravar dados inventados. Testes simulam barra removida, tabela nova, chegada tardia do DOM, navegação para processo, retorno e ausência de contêiner opcional. Recarregue extensão e bloco após atualizar.

### Assunto, filtro de status e desfazer compartilhado

O controle Assunto é um botão acessível com menu de atribuir/retirar múltiplas pastas; Enter, Espaço, clique direito e Shift+F10 permitem abrir. Escape retorna o foco. Sem conexão o botão fica indisponível; se não houver pastas, crie um assunto primeiro.

O seletor de status inclui Todos os status e Sem status e combina com a aba de assunto. Visualizando indica os filtros e quantos processos carregados estão visíveis; Limpar filtros restaura Geral e Todos os status. Contagens de abas respeitam o status selecionado; contagens das opções de status respeitam a aba selecionada. Todas são limitadas à página/pesquisa carregada, sem afirmar totais do bloco. Processos ocultos são desmarcados. Sem sincronização ou mapa de status disponível, o filtro de status volta a Todos e fica desabilitado, com indicação Status indisponível; desconhecido não é tratado como Sem status.

Desfazer consulta novamente estado e histórico antes de apresentar ação, data e autor para confirmação específica. Essa operação é compartilhada, não uma pilha pessoal. Se o histórico e a versão não coincidirem, nenhuma confirmação ou gravação é feita. O envio usa a versão consultada e o identificador da ação confirmada; uma alteração concorrente provoca conflito e exige nova consulta/confirmação. Cancelamento não grava. Não usa o histórico já aberto como autorização. Reinicie o serviço com o código atualizado, preservando o banco, para validar também o identificador no servidor. Não há migração de dados ou novas permissões.

Validação desta atualização: `npm run check` e 27 testes, incluindo interação acessível, filtros combinados, seleção oculta, indisponibilidade, cancelamento de desfazer, histórico divergente e conflito concorrente, além das salvaguardas anteriores.

Para instalar esta atualização:

1. Atualize os arquivos do projeto (Git ou ZIP), mantendo o banco SQLite e o volume existente.
2. Reinicie o serviço com o código atualizado. Em Docker, reconstrua a imagem e recrie o serviço com o mesmo volume; não remova o volume. Não há migração de banco.
3. Recarregue a extensão em `chrome://extensions` e depois a página do bloco interno.
4. Confira Assunto clicável, filtro combinado e confirmação do desfazer. Cancelar a confirmação não altera o bloco.
