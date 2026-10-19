# SEI Organizador — 0.3.2

Extensão Chrome MV3 para organizar os processos de blocos internos do SEI-RJ por assunto e status manual. A API Node.js/SQLite compartilha as classificações entre colegas da unidade. A extensão preserva os controles, as anotações e as operações nativas do SEI.

## Instalação

1. Clone o projeto e carregue a pasta `extension` em `chrome://extensions`, com o modo desenvolvedor habilitado. Também é possível extrair o ZIP de distribuição e carregar a pasta `extension` dele.
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
- **Status** aparece em todas as abas: Sem status, Atenção, Acompanhar, Urgente e Para arquivar. É manual, independente dos assuntos e das anotações nativas.
- A barra oferece Criar assunto, o filtro de status e Histórico/Fechar histórico. Renomear e Excluir aba aparecem quando uma pasta está ativa. Os botões Atualizar e Limpar filtros foram retirados; para voltar à visão completa, selecione Geral e Todos os status.
- A sincronização acontece ao abrir e a cada dez segundos enquanto a página está visível, além de ocorrer após uma alteração. Falhas retornam a Geral e desabilitam gravações até reconectar; status não sincronizado não é apresentado como Sem status.
- Trocar de aba ou filtrar desmarca as seleções que ficaram escondidas, preservando as ações nativas do SEI sobre os processos visíveis.
- Descrição e Palavras-chave para pesquisa ficam lado a lado, com a descrição à esquerda. Abaixo de 760 px, ficam empilhadas. Os campos, valores, rótulos, eventos e associação ao formulário nativos são preservados; a estrutura original é restaurada ao sair da lista.
- A tabela usa colunas compactas, rolagem horizontal e cabeçalho original fixo sob a barra. O controle de copiar usa o número completo do link do processo. O tema acompanha o SEI, com contraste claro/escuro.
- A interface se recupera quando a lista chega depois do script, a barra é removida ou a tabela é substituída, e ao retornar pelo histórico do navegador. Não se aplica ao Controle de Processos nem a blocos de outros tipos.

## Situação do documento

Ao abrir um documento gerado pela unidade atendida, aparece um card na árvore do processo, logo abaixo de **Consultar Andamento**. O documento fica livre, sem nada sobreposto. O card acompanha o documento aberto: some ao abrir outro documento ou ao sair dele, e não entra na impressão. As informações ficam empilhadas para caber na coluna estreita da árvore:

- **Assinatura**: quem assinou, cargo, data e hora, lidos do rodapé. Na falta do rodapé, usa a árvore ou o andamento. Sem assinatura, indica **Não assinado** ou, se o documento estiver em bloco de assinatura, **Aguardando assinatura · bloco nº N (descrição)** na mesma linha.
- **Último envio**: data e hora, unidades de destino e quem enviou, a partir do último "Processo remetido pela unidade" do andamento. Avisa quando esse envio é anterior ao documento.
- **Tempo parado**: para cada unidade com o processo aberto, o tempo desde o último andamento ali. Fica amarelo a partir de 3 dias e vermelho a partir de 7. Também mostra quando o processo está aberto na própria unidade. Quando alguma unidade passa de 3 dias, um alerta no topo do card mostra a mais antiga, por exemplo "⏱ Parado há 10 dias em SEPM/3°CPA", e quantas outras estão acima do limite. A borda do card fica na mesma cor, e o alerta continua visível com o card oculto.
- **Blocos**: blocos internos em que o processo está (os de assinatura aparecem na linha da assinatura), com descrição e estado quando constam da lista de blocos. Blocos de outras unidades são ignorados.
- **Organizador**: em cada bloco interno, assunto e status compartilhados. É possível alterar o status e os assuntos ali mesmo, com as mesmas regras de versão e histórico da lista do bloco.

Documentos de outras unidades, anexos externos e outras unidades atuais não exibem o card. **Ocultar/Mostrar** é lembrado no navegador. O andamento e as listas de blocos são consultados no próprio SEI, com a sessão do usuário, e ficam em cache na aba por 1 e 2 minutos. Quando o andamento tem mais de uma página, valem só os registros carregados. Os blocos vêm dos registros "inserido no bloco"/"retirado do bloco" do andamento.

## Pendência antes de enviar

Documento pendente é um documento interno gerado pela unidade e ainda sem nenhuma assinatura, segundo a árvore do processo. Documentos externos e anexos não contam.

- **No card da árvore**: a linha **Pendências antes de enviar** lista esses documentos, exceto o documento aberto, cuja situação já aparece na linha Assinatura. Aparece também ao abrir documentos de outras unidades, num card reduzido só com a pendência.
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
Compress-Archive -Path extension -DestinationPath artifacts/sei-organizador-extension-0.3.2.zip -Force
```

Resultado da entrega: **40 testes passaram**, além da verificação de sintaxe e de formatação. Use `npm run format` antes de entregar alterações na extensão. A estrutura dos campos foi conferida na página real; o layout foi validado em fixture com dados fictícios em 1280 e 520 px. A pesquisa real não foi submetida durante a validação visual. Testes cobrem navegação, recuperação da interface, múltiplos assuntos, filtros, controles nativos, indisponibilidade, histórico, reversão seletiva, autoria informada, conflitos, repetição e persistência.

O container foi validado com usuário não root, limites de recursos, unidade restrita, acesso sem token e persistência após recriação. As camadas da imagem foram verificadas quanto a credenciais conhecidas, arquivos privados e banco. Na API implantada, testes sintéticos confirmaram autoria, preservação do colega no mesmo processo, conflitos e repetição; os registros técnicos foram removidos. HTTPS confiável, tarefa healthy e gestão pelo Portainer foram conferidos.

Os arquivos em `artifacts/` são resultados locais, fora do Git: ZIPs, imagens de validação, backups e configurações operacionais anteriores. A fonte da extensão está versionada e permite regenerar o ZIP. A cada nova entrega da extensão, incrementar manifesto, pacote e lockfile, registrar o CHANGELOG e atualizar a distribuição.
