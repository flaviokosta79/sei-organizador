# Changelog

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
