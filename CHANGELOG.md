# Changelog

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
