# SEI Organizador — 0.1.4

Extensão Chrome MV3 para organizar os processos de blocos internos do SEI-RJ por assunto e status manual. A API Node.js/SQLite compartilha as classificações entre colegas da unidade. A extensão preserva os controles, as anotações e as operações nativas do SEI.

## Instalação

1. Clone o projeto e carregue a pasta `extension` em `chrome://extensions`, com o modo desenvolvedor habilitado. Também é possível extrair o ZIP de distribuição e carregar a pasta `extension` dele.
2. Abra a lista de processos de um bloco interno do SEI na unidade atendida pela extensão.
3. Após atualizar, recarregue a extensão no Chrome e depois a página do bloco.

O serviço HTTPS `https://ext.5cpa.com.br` e a unidade estão fixos em `extension/config.js`. Não há campos de endereço, unidade ou token para preencher. Valores antigos salvos no navegador são ignorados. A extensão só inicializa nas listas internas reconhecidas e na unidade definida.

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
- **Status** aparece em todas as abas: Sem status, Atenção, Acompanhar, Urgente e Para arquivar. É manual, independente dos assuntos e das anotações nativas.
- A barra oferece Criar assunto, o filtro de status e Histórico/Fechar histórico. Renomear e Excluir aba aparecem quando uma pasta está ativa. Os botões Atualizar e Limpar filtros foram retirados; para voltar à visão completa, selecione Geral e Todos os status.
- A sincronização acontece ao abrir e a cada dez segundos enquanto a página está visível, além de ocorrer após uma alteração. Falhas retornam a Geral e desabilitam gravações até reconectar; status não sincronizado não é apresentado como Sem status.
- Trocar de aba ou filtrar desmarca as seleções que ficaram escondidas, preservando as ações nativas do SEI sobre os processos visíveis.
- Descrição e Palavras-chave para pesquisa ficam lado a lado, com a descrição à esquerda. Abaixo de 760 px, ficam empilhadas. Os campos, valores, rótulos, eventos e associação ao formulário nativos são preservados; a estrutura original é restaurada ao sair da lista.
- A tabela usa colunas compactas, rolagem horizontal e cabeçalho original fixo sob a barra. O controle de copiar usa o número completo do link do processo. O tema acompanha o SEI, com contraste claro/escuro.
- A interface se recupera quando a lista chega depois do script, a barra é removida ou a tabela é substituída, e ao retornar pelo histórico do navegador. Não se aplica ao Controle de Processos nem a blocos de outros tipos.

## Histórico e desfazer

O painel mostra as últimas 100 operações; o SQLite conserva todo o histórico. As cores distinguem criação, exclusão, atribuição, retirada, renomeação, status e desfazer, com descrição textual independente da cor. Passe o mouse sobre o login para ver o nome completo e o órgão registrados. Registros antigos sem nome completo informam que ele não está disponível.

**Desfazer** fica à direita, depois da frase do registro, somente nos registros do próprio login e órgão que ainda possam ser revertidos. A operação consulta novamente o estado e o histórico antes de confirmar, mostra a alteração escolhida e o autor, e envia o identificador do registro com a versão consultada. Cancelar não grava.

O servidor compara o autor novamente e aplica somente as diferenças produzidas pela operação escolhida. Uma alteração posterior em outro campo do mesmo processo, em outro vínculo ou em outro processo permanece. Se um campo afetado mudou depois, mesmo que tenha voltado ao valor anterior, ou surgiu dependência da pasta, a reversão inteira é bloqueada. Operações em lote não são parcialmente desfeitas. Alterações concorrentes são rejeitadas pela versão.

Registros já desfeitos, sem efeito ou que representam um desfazer não oferecem novo desfazer. O botão desaparece depois da reversão e o registro original continua no histórico com a indicação **Desfeita**. A reversão também gera seu próprio registro.

## Dados e identificação

Persistimos unidade, bloco, IDs internos de processos, números formatados usados nas operações, abas, vínculos, status, versões e histórico com autor, horário e snapshots anterior/posterior. Não enviamos documentos, anotações, URLs autenticadas, cookies ou hashes do SEI. O worker faz as chamadas sem cookies e sem referrer.

O autor vem do título do ícone do usuário no SEI: nome, login e órgão. A API não autentica essa identidade; comparar login e órgão é uma regra funcional para o uso normal da extensão, não uma garantia contra chamadas que declarem outra identidade. O usuário autorizou API pública sem token e instalação sem configuração. O servidor restringe a unidade, valida dados e tamanho das requisições e usa transações com controle de versão. A administração da VPS e do Portainer permanece restrita.

## Serviço e implantação

A API está implantada na KMV2, com HTTPS via Traefik e imagem pública sem credenciais ou banco. A stack `sei-organizador` é gerenciada integralmente pelo Portainer, com edição, reimplantação e acesso exclusivo dos administradores. Uma réplica escreve no volume persistente; não escalar SQLite em volume compartilhado/NFS.

[Operação, imagem implantada, backups e rollback](deploy/KMV2.md). [Todas as versões e mudanças](CHANGELOG.md).

Ações HTTP: `GET /healthz`, `GET /v1/units/:unit/blocks/:block`, `GET .../history` e `POST ...` com `{version, actor, action}`. Ações: create, rename, delete, assign, unassign, status e undo. Desfazer exige `historyId`; o histórico inclui `undoable` e `undoReason`. O banco existente é compatível e não exige migração para estas mudanças.

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
Compress-Archive -Path extension -DestinationPath artifacts/sei-organizador-extension-0.1.4.zip -Force
```

Resultado da entrega: **35 testes passaram**, além da verificação de sintaxe. A estrutura dos campos foi conferida na página real; o layout foi validado em fixture com dados fictícios em 1280 e 520 px. A pesquisa real não foi submetida durante a validação visual. Testes cobrem navegação, recuperação da interface, múltiplos assuntos, filtros, controles nativos, indisponibilidade, histórico, reversão seletiva, autoria informada, conflitos, repetição e persistência.

O container foi validado com usuário não root, limites de recursos, unidade restrita, acesso sem token e persistência após recriação. As camadas da imagem foram verificadas quanto a credenciais conhecidas, arquivos privados e banco. Na API implantada, testes sintéticos confirmaram autoria, preservação do colega no mesmo processo, conflitos e repetição; os registros técnicos foram removidos. HTTPS confiável, tarefa healthy e gestão pelo Portainer foram conferidos.

Os arquivos em `artifacts/` são resultados locais, fora do Git: ZIPs, imagens de validação, backups e configurações operacionais anteriores. A fonte da extensão está versionada e permite regenerar o ZIP. A cada nova entrega da extensão, incrementar manifesto, pacote e lockfile, registrar o CHANGELOG e atualizar a distribuição.
