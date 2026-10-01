# SEI Organizador — 0.1.0

Extensão Chrome MV3 própria para a lista de processos dos blocos internos do SEI-RJ. Referências em `referencias/sei` permanecem intactas. Sem dependências de produção; requer Node.js 24. Para os testes de DOM, execute 
pm ci` (jsdom é dependência de desenvolvimento).

## Executar localmente

No PowerShell: `$env:SEI_UNIT_ID='ID_DA_UNIDADE'; npm start`. Serviço em `http://127.0.0.1:8787`; SQLite em `data/organizador.sqlite`. Configure o ID numérico lido do parâmetro `infra_unidade_atual` na página do SEI, sem copiar a URL autenticada.

Em `chrome://extensions`, habilite modo desenvolvedor e carregue a pasta `extension`. Abra as opções da extensão e informe origem do serviço e unidade. Aceite a permissão apenas para essa origem. Reabra o bloco interno. Cada colega instala e configura a mesma origem/unidade.

## Comportamento

- Geral conserva todos os processos carregados e os comandos originais. Classificar nunca chama operações do SEI.
- Crie assuntos manualmente; use o clique direito na área da linha para Atribuir a/Retirar de uma pasta. Um processo pode estar em várias abas. Renomear/excluir aba mantém os processos no bloco.
- Trocar de aba desmarca seleções que ficaram ocultas para evitar ações nativas sobre linhas invisíveis.
- Sincronização a cada 10 segundos enquanto a página está visível. Conflitos de versão são rejeitados; recarregue e repita a intenção. Não há gravação offline: falhas retornam ao Geral e desabilitam alterações até reconexão.
- Histórico mostra as últimas 100 operações; todo histórico permanece no SQLite. Desfazer restaura o estado anterior à última operação do bloco, incluindo operações de colegas. Desfazer novamente alterna os estados; não é uma pilha pessoal de undo.
- Paginação/pesquisa: apenas processos presentes no DOM podem ser selecionados. Classificações são persistidas por ID e reaplicadas quando a página é carregada. Contagens globais de processos não são apresentadas. Mudanças de linhas na tabela são observadas; substituição completa da tabela exige recarregar.

## Dados e limites de confiança

Persistimos unidade, bloco, IDs internos de processos, abas, vínculos, versões e histórico (autor, horário UTC, ação e estados anterior/posterior). Números formatados dos processos selecionados são enviados e guardados no histórico, junto aos IDs internos. Não enviamos anotações, documentos, URLs autenticadas, cookies ou hashes SEI. As chamadas partem do worker com credenciais omitidas e sem referrer.

Autor vem do title `a#lnkUsuarioSistema`: Nome (login/órgão). Na ausência do formato, Usuário não identificado. Identidade sempre não verificada. A unidade vem do href desse elemento; serviço restringe a uma unidade configurada. A extensão não equivale a autenticação: qualquer pessoa com acesso ao serviço pode declarar autor e alterar classificações. Para cumprir ausência de login adicional, hospede em rede privada acessível aos colegas (VPN/rede da unidade) ou atrás de uma política de acesso existente. Não exponha diretamente na Internet sem definir controle de acesso. Esse controle de rede e o destino VPS ainda precisam ser definidos.

## VPS preparado, sem deploy

Defina `SEI_UNIT_ID` e execute `docker compose -f deploy/compose.yaml up -d --build` no host escolhido. Porta publicada apenas no loopback; configure proxy HTTPS e acesso privado no host antes de disponibilizar aos colegas. Para proxy em outra rede/container adapte a rede Docker explicitamente. Volume nomeado preserva o SQLite entre recriações. Faça backup usando a API de backup do SQLite ou com o serviço parado (incluindo arquivos WAL se copiar enquanto ativo). Restaurar: pare serviço, restaure banco e permissões do volume, reinicie. Não remover o volume ao atualizar.

`GET /healthz`; `GET /v1/units/:unit/blocks/:block`; `GET .../history`; `POST ...` com `{version,actor,action}`. Ações create/rename/delete/assign/unassign/undo. Serviço usa transação e versão para serializar alterações; execute uma instância com volume local, não compartilhe SQLite em NFS ou escale réplicas.

## Validação


pm test` testa persistência, classificação, exclusão, recuperação, conflitos e isolamento. 
pm run check` verifica sintaxe. Fixtures locais documentadas em `test`; nenhuma operação de gravação foi validada no SEI real. Seletores conferidos por inspeção somente leitura: formulário `#frmRelBlocoProtocoloLista`, tabela `#tblProtocolosBlocos`, links `id_procedimento`, inserção antes de `#divInfraAreaPaginacaoSuperior`. IDs de linha repetem `trPos0` e não são usados como identidade.


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

Na coluna Anotações, o marcador permite escolher Atenção, Acompanhar, Urgente, Para arquivar ou Sem status. Um status por processo, independente dos assuntos. Clique abre seletor local; setas/Home/End, Enter, Escape e clique fora são suportados. Anotações e ações nativas permanecem. Não calcula prazos nem arquiva/tramita processos.

O serviço valida allowlist, persiste mapa statuses por ID, registra anterior/novo e número no histórico, e mantém conflitos por versão e desfazer. Estados e snapshots antigos sem statuses são tratados como mapa vazio sem alterar esquema ou apagar histórico. Falha de conexão ou servidor antigo mostra Status indisponível; não afirma Sem status nem grava offline.

Atualização necessária: reinicie o serviço com os arquivos atuais, mantendo o banco; recarregue a extensão em chrome://extensions e depois o bloco. Não requer migração destrutiva ou novas permissões. Dados mínimos adicionais: status manual por ID; número apenas no histórico da ação.

## Barra compacta e visível

Abas começam à esquerda, sem nome ou ícone visível de identidade; a região mantém nome acessível. Todos os comandos permanecem visíveis no canto direito da mesma linha em desktop: Criar assunto, Histórico/Fechar histórico, Desfazer, Atualizar. Atribuição e retirada são realizadas exclusivamente pelo menu contextual de cada linha; não há seletor de pastas ou ações em lote na toolbar. Renomear/excluir aparecem quando uma pasta real está ativa. Não há Mais opções nem card expansível. Botões com rótulos pequenos, espaços reduzidos e abas com rolagem horizontal; em telas estreitas, os comandos quebram linha sem desaparecer. A aba ativa tem indicador cinza interno, sem borda preta externa; o foco por teclado usa contorno azul interno somente em focus-visible.

A barra usa position:sticky no contêiner de rolagem e mede o cabeçalho SEI para evitar sobreposição. Histórico fica fora da parte sticky com rolagem própria, limitado a 45vh. Avisos de filtro/conexão permanecem visíveis; o limite das contagens está no tooltip e descrição acessível. Layout conferido em fixture longa de 50 processos, desktop e 520px, com cabeçalho de 65px e contêiner de rolagem. Fixture: node tools/preview.mjs. Atualize apenas extensão e bloco, sem reiniciar backend.





## Tema e integração visual

A barra acompanha a variável oficial --infra-esquema-cor-barra-sistema observada no SEI; fallback lê a cor do navInfraBarraNavegacao ou usa tom neutro. Identidade e foco usam contraste calculado. Abas Geral, Sem assunto e pastas têm fundo branco, texto e contagens pretos, com fonte, padding, altura e espaçamento iguais aos comandos. A aba ativa recebe um indicador inferior discreto. Botões recebem somente a classe visual infraButton e dimensões/fonte/cores lidas de um botão nativo, sem copiar handlers. Observadores seletivos de tema e load de estilos atualizam cores, sem polling. Status e histórico mantêm cores semânticas. Não altera preferência de tema do SEI.

Espaço antes da tabela: contêiner divInfraAreaPaginacaoSuperior vazio é recolhido somente dentro do formulário marcado da lista de bloco; controles ou texto de paginação fazem ele reaparecer. Margem inferior da barra reduzida a 3px. Recarregue extensão e bloco; sem alteração no serviço/banco.


Foreground da faixa: lê o texto do identificador do cabeçalho (#spnInfraIdentificacaoSistema/.infraTituloLogoSistema), pois a variável de texto geral é do corpo. Preserva branco quando adequado; ajusta levemente o fundo para contraste mínimo 4,5:1 ou usa fallback preto/branco em temas muito claros. Botões mantêm foreground nativo próprio. Separador vertical distingue abas de ações no desktop e horizontal na quebra responsiva.

