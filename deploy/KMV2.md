# SEI Organizador na KMV2

## Estado atual

O usuário autorizou uso sem configuração manual e sem token. A extensão tem
endereço HTTPS e unidade fixos e é utilizada simplesmente após instalar e abrir
a lista de bloco interno do SEI. Opções permitem escolher o bloco de trabalho, sem campos de endereço, unidade ou token.
Extensão na versão 0.16.5 e API na versão 0.16.4. Incluem alertas compartilhados de assinatura efetiva por grupo definido pelo bloco interno escolhido nas opções, além de presença, vistos e classificações isolados por bloco.

API: https://ext.5cpa.com.br. Registro A na Cloudflare para 212.85.19.248,
DNS only, com HTTPS confiável via Traefik. A API aceita leitura e gravação sem
autenticação, inclusive chamadas externas à extensão. A restrição de unidade
não autentica o usuário; autor do SEI continua sendo informativo. Validação
JSON, conflitos de versão, limite de corpo e rate limit foram preservados.

Imagem pública: https://hub.docker.com/r/flaviokosta/sei-organizador.
Imagem da stack: flaviokosta/sei-organizador@sha256:46275a0fe348b7ec1ee0f25ac553582152b3eac3b9982ee2758e4135cd40cdad (tag 0.16.4).
Imagem anterior, para rollback: flaviokosta/sei-organizador@sha256:9510a5205ac1a599eebff75a2023f2a217b94020a1fab4419495ec418981f68c (0.16.0).
O conteúdo de todas as camadas foi conferido: somente package.json e
server/index.js, store.js, auth.js e undo.js em /app, sem .env, instruções privadas,
credenciais conhecidas, configurações operacionais ou banco.

## Correção 0.14.1 — 2026-10-27

Resumo do processo preservado quando a inclusão no bloco escolhido não aparece no andamento, em histórico incompleto ou antes de escolher um bloco. Classificações permanecem limitadas ao bloco escolhido, sem consultar outros blocos. Opções identificam os blocos por número + Grupo do SEI, sem substituir grupo por descrição. Correções apenas na extensão, compatíveis com a API 0.14.0; não exigem reimplantação.

## Atualização 0.14.0 — 2026-10-27

Preferência de bloco local por unidade/órgão/login, sem configuração de endereço ou token. Primeiro bloco escolhido automaticamente; opções permitem trocar a preferência e aplicá-la nas páginas abertas. Avisos de edição aparecem na linha do processo na lista do bloco escolhido. API suporta edição e reconhecimento de vistos isolados por bloco em tabelas aditivas editing_scopes e process_block_views, compatíveis com rollback para a API anterior.

Uma lista completa e não filtrada reconcilia classificações: status e vínculos de processos ausentes são removidos na mesma transação da confirmação do snapshot. Mantém pastas e outros blocos, registra departed no histórico e bloqueia desfazer essa operação automática. Não executar limpeza com páginas parciais, falhas ou versões antigas. A primeira lista completa também remove metadados antigos de processos já ausentes. Saída/reinclusão entre consultas sem ausência observada não pode ser identificada.

Backup consistente em /data/backups/before-0.14.0-20261027.sqlite, VACUUM INTO e quick_check ok, com cópia local em artifacts/backups/before-0.14.0-20261027.tar. Arquivo e Env anteriores em artifacts/stack-before-0.14.0.json. Imagem validada sem rede e sem volume: limpeza isolada, histórico, vistos, edição, conflitos e lote/desfazer.

Atualização pela API suportada da stack 18 do Portainer, apenas SEI_IMAGE alterado. Arquivo/editor, demais variáveis, administração exclusiva e volume sei_organizador_data preservados; usuário node, completed e healthy. Seis módulos do servidor conferidos por SHA-256. Banco com quick_check ok e 1 bloco preservado, histórico com 270 registros no backup e 271 na conferência. Evidências em artifacts/deployment-0.14.0.json e artifacts/database-verification-0.14.0.json.

Rollback: reaplicar pelo Portainer arquivo e Env de artifacts/stack-before-0.14.0.json e usar a extensão anterior, preservando o volume. A API anterior ignora as tabelas adicionais. Retornar a imagem não restaura classificações já limpas; o histórico e o backup preservam evidência para uma eventual recuperação de dados. Não restaurar o banco inteiro para apenas voltar a imagem.

146 testes passaram; sintaxe e formatação aprovadas. Opções, mudança entre dois blocos, restauração dos controles nativos e aviso de edição isolado conferidos no Chromium com fixtures. Conferência no SEI real pendente.

## Atualização 0.13.0 — 2026-10-27

Presença de edição em tabela aditiva editing_presence, com expiração de 90 segundos e atividade recente de 60 segundos. Consultas em lotes de até 1.000 processos, corpo de 64 KiB, limite de 1.000 sessões ativas por unidade e validação de metadados. Nenhum conteúdo de documento é recebido; sem novas permissões da extensão.

Backup consistente em /data/backups/before-0.13.0-20261027.sqlite (VACUUM INTO, quick_check ok), cópia local em artifacts/backups/before-0.13.0-20261027.tar. Configuração anterior em artifacts/stack-before-0.13.0.json. Imagem validada em container isolado sem rede: presença/encerramento, vistos compartilhados, conflito de snapshot e status em lote/desfazer.

Stack 18 atualizada pelo Portainer trocando somente SEI_IMAGE. Editor/arquivo da stack, administração exclusiva, outras variáveis e volume sei_organizador_data preservados; usuário node, atualização completed e container healthy. Seis módulos do servidor conferidos por SHA-256. SQLite com quick_check ok, 1 bloco e 270 registros de histórico antes/depois. Saúde HTTPS e consulta de edição 200; outra unidade 403. Evidências em artifacts/deployment-0.13.0.json, database-verification-0.13.0.json e editing-endpoints-0.13.0.json.

Rollback: reaplicar pelo Portainer arquivo e Env de artifacts/stack-before-0.13.0.json, mantendo o volume e os dados. A API 0.12.0 ignora a tabela adicional. Usar a extensão anterior caso a API seja revertida. Não restaurar o backup para apenas voltar a imagem.

136 testes passaram; sintaxe e formatação aprovadas. Fluxo com popup ligado à janela de origem, edição recente, avisos no bloco/card, fechamento e layout em 320/520 px conferidos no Chromium com dados fictícios. Editor real do SEI ainda precisa de conferência.

## Atualização 0.12.0 — 2026-10-27

Backup consistente via VACUUM INTO em /data/backups/before-0.12.0-20261027.sqlite, quick_check ok; cópia local em artifacts/backups/before-0.12.0-20261027.tar. Configuração anterior do Portainer em artifacts/stack-before-0.12.0.json. Novas tabelas alert_blocks e process_views são aditivas; assuntos, status, versões e histórico não foram migrados.

Imagem validada em container isolado sem rede: entrada nova, abertura compartilhada, conflito de snapshot, status em lote e desfazer. Atualização pela API suportada da stack 18; apenas SEI_IMAGE alterado. Arquivo/editor, demais variáveis, administração exclusiva e volume sei_organizador_data preservados. Banco com quick_check ok e 1 bloco preservado; histórico com 268 registros no backup e 269 na verificação final, sem remoção de registros. Evidências em artifacts/deployment-0.12.0.json e artifacts/database-verification-0.12.0.json.

Rollback: reaplicar pelo Portainer o arquivo e Env de artifacts/stack-before-0.12.0.json, preservando o volume. A API anterior ignora as tabelas adicionais; não apagar tabelas nem restaurar o backup para apenas voltar a imagem. Usar também a extensão anterior se reverter a API, pois a 0.12.0 requer as novas rotas de reconhecimento.

128 testes passaram, incluindo migração de avisos locais, dois navegadores, abertura offline e fila persistente, reinclusão e concorrência. Extensão sem novas permissões; serviço mantém unidade fixa, acesso sem token, validação e limites do Traefik.

## Atualização 0.10.0 — 2026-10-24

Build pelo Docker do Portainer com contexto restrito a package.json, server e deploy/Dockerfile. Imagem publicada no Docker Hub e validada em container isolado, sem rede, com lote Assinar e desfazer em SQLite em memória.

Backup consistente via VACUUM INTO: /data/backups/before-0.10.0-20261024.sqlite, quick_check ok, cópia local em artifacts/backups/before-0.10.0-20261024.tar. Arquivo e variáveis anteriores em artifacts/stack-before-0.10.0.json.

Stack 18 atualizada pela API suportada do Portainer, endpoint 1; somente SEI_IMAGE mudou. Administração exclusiva preservada, arquivo acessível ao editor, atualização concluída, container healthy como node e volume sei_organizador_data preservado em /data. HTTPS health/read 200 sem token; outra unidade 403. Evidência em artifacts/deployment-0.10.0.json.

Rollback: reaplicar pelo Portainer o arquivo e Env de artifacts/stack-before-0.10.0.json, mantendo o volume atual. Não houve migração de esquema. O backup é reservado à recuperação de dados e não é necessário para apenas voltar a imagem.

## Conferência — 2026-10-27

Stack 18 ativa, administração exclusiva e arquivo do editor acessível pelo Portainer. Container healthy, usuário node, volume sei_organizador_data em /data e atualização completed. API implantada 0.10.0: SHA-256 de server/index.js, store.js, auth.js e undo.js idênticos aos arquivos locais. HTTPS /healthz e leitura pública retornaram 200; outra unidade retornou 403. Não é necessária atualização do servidor para a correção do teste e da documentação. Evidência em artifacts/server-verification-2026-10-27.json. Esta conferência não revalida a interface no SEI real nem a integridade do banco.

## Atualização 0.4.0 — 2026-10-19

Imagem gerada no próprio KVM2 pela API Docker do Portainer, com contexto `git archive 07a6e2a package.json server deploy/Dockerfile`, e publicada no Docker Hub. A stack 18 foi atualizada pelo Portainer trocando somente SEI_IMAGE; arquivo da stack, demais variáveis e volume foram preservados.

Backup consistente antes da troca, pela API de backup do SQLite, com quick_check ok, 1 bloco e 180 registros: /data/backups/before-0.4.0-20261019.sqlite no volume sei_organizador_data. Cópia local em artifacts/backups/before-0.4.0-20261019.sqlite.tar. Configuração anterior da stack em artifacts/stack-before-0.4.0.json.

Validação: container temporário sem volume com saúde 200, outra unidade 403, status Assinar e Arquivar aceitos, status inválido 400 e usuário node; removido depois. Na KMV2: atualização completed, uma tarefa healthy, 1 bloco e 180 registros preservados, HTTPS /healthz 200, leitura do bloco 1343 200, outra unidade 403 e status inválido 400 sem alterar a versão. Nenhum dado sintético gravado em produção.

Rollback: reaplicar pelo Portainer o SEI_IMAGE anterior (fe0e4c88…). O banco atual é compatível com a imagem anterior; status Assinar gravados depois apareceriam como desconhecidos nela.

## Gestão no Portainer

Desfazer agora fica junto ao registro no histórico, somente para o login e órgão
do autor informado pelo SEI. O servidor repete essa comparação; ela é uma regra
funcional, sem autenticação da identidade. A reversão aplica somente diferenças
do registro escolhido e preserva campos e vínculos independentes posteriores.
Se houve alteração posterior no mesmo campo ou dependência da pasta, bloqueia
toda a operação. Registros já desfeitos, sem efeito e operações de desfazer não
podem ser desfeitos novamente. A confirmação consulta estado e histórico atuais
e a versão impede alterações concorrentes. O nome completo aparece no tooltip
do login no histórico quando foi gravado; não é inventado para registros antigos.

Validação: 34 testes locais e sintaxe passaram. Container validado com acesso
público e persistência. API implantada validada com dados sintéticos no bloco 0:
autor próprio, preservação de outro campo do colega no mesmo processo, outro
autor rejeitado, repetição e conflito bloqueados; registros sintéticos removidos.
HTTPS e tarefa healthy confirmados. Backup consistente anterior à atualização:
/opt/sei-organizador/backups/before-selective-undo-20261002.sqlite, também em
artifacts/backups. Configuração anterior: artifacts/stack-before-selective-undo.json.

Stack sei-organizador, ID 18, ambiente KMV2/primary, endpoint 1. Criada e
atualizada pelo Portainer, com docker-compose.yml armazenado, editor/arquivo e
reimplantação comprovados. Acesso administrativo exclusivo, controle total.
Não é stack externa/limited. A API pública não torna pública a administração.

Toda stack criada pelo Codex deve ficar gerenciada pelo Portainer com controle
total para administradores, preservando volumes/secrets em migrações e mantendo
rollback. Não entregar apenas docker stack deploy externo. Não dar Docker socket
à aplicação. A fonte operacional atual é a configuração armazenada no Portainer.

## Instalação e atualização da extensão

Extrair artifacts/sei-organizador-extension-0.14.1.zip em uma pasta e carregar essa pasta
em chrome://extensions (modo desenvolvedor), ou recarregar a extensão previamente
carregada da pasta extension deste projeto. Aceitar a permissão de instalação
para o serviço, se solicitada pelo Chrome, e recarregar a página do bloco no SEI.
Não configurar endereço, unidade ou token. Valores antigos salvos são ignorados.
A extensão só inicializa na unidade fixada e em listas internas reconhecidas.

extension/config.js fixa endereço e unidade; não contém token ou segredo.
A distribuição não recebe credenciais da infraestrutura. O arquivo antigo
artifacts/extension-admin-config.json e os tokens antigos não são mais usados
na instalação atual; foram preservados como material restrito de rollback.

## Serviço e persistência

Node.js 24, uma réplica no nó kvm2.server, volume externo sei_organizador_data
montado em /data; SQLite em organizador.sqlite com WAL. Porta da API não é
publicada diretamente. Traefik usa portainer_default, websecure,
letsencryptresolver e rate limit de 20/s com burst 40 por IP.

HOST=0.0.0.0, PORT=8787, DATA_FILE=/data/organizador.sqlite, SEI_UNIT_ID definida
no Portainer. SEI_ALLOW_PUBLIC_ACCESS=true habilita explicitamente o modo sem
token. Não montar arquivo de hashes nesse modo. Sem esse flag, o servidor
mantém o comportamento protegido anterior e recusa bind em rede sem hashes.
O secret antigo permanece no Swarm para rollback, sem ser montado no serviço.

Limites iniciais: 0,5 CPU e 512 MiB, reserva de 64 MiB. Uma instância e
atualização stop-first evitam dois escritores concorrentes. Não escalar SQLite
em volume compartilhado/NFS. Monitorar espaço, histórico e falhas de gravação;
histórico mantém snapshots sem retenção automática. Healthcheck prova HTTP,
não integridade ou backup do banco.

## Validação e rollback

Na validação inicial do acesso público, 35 testes passaram, além de sintaxe. O smoke local do
container confirmou acesso/leitura/gravação sem token, unidade diferente 403,
usuário não root e persistência após recriar com o mesmo volume.

Na KMV2, a nova imagem ficou healthy e foram confirmados leitura/gravação sem
token, rejeição de outra unidade e de dados inválidos, persistência após
recriação da tarefa e limpeza do bloco técnico 0. HTTPS externo com certificado
confiável retornou saúde/GET 200 sem credenciais. O arquivo da stack armazenado
no Portainer corresponde ao YAML atual, com administração exclusiva preservada.

Backup consistente anterior à mudança de acesso:
/opt/sei-organizador/backups/before-public-access-20261002.sqlite.
Arquivo/configuração anterior do Portainer e suas variáveis estão preservados
em artifacts/stack-before-public-access.json. Para rollback, reaplicar pelo
Portainer a imagem anterior e o arquivo/variáveis anteriores; manter volume e
secret antigos. Não remover o volume na atualização.

Backup inicial: /opt/sei-organizador/backups/initial-20261002.sqlite,
com cópia local em artifacts/backups/initial-20261002.sqlite. Backups gerados
pela API SQLite passaram abertura e quick_check. Para backup por cópia simples,
parar a réplica e copiar diretório inteiro, incluindo WAL/SHM presentes.
Restaurar com serviço parado e permissões do usuário node da imagem validada;
restauração perde alterações posteriores. Fonte e documentação serão publicadas no repositório privado; artifacts permanece como saída local.

## Atualização 0.15.0 — 2026-10-27

Assinaturas efetivas do SEI compartilhadas entre usuários que escolheram o mesmo bloco interno. Tabelas aditivas signature_members, signature_groups, signature_watches e signature_events; incluem deduplicação por documento, assinante e horário. Não altera autenticação pública autorizada da API nem concede Docker socket ao aplicativo. Consultas limitadas no navegador e corpos JSON limitados a 256 KiB/200 observações no servidor.

Backup consistente em /data/backups/before-0.15.0-20261027.sqlite, quick_check ok e cópia local em artifacts/backups/before-0.15.0-20261027.tar. Configuração anterior e variáveis preservadas em artifacts/stack-before-0.15.0.json. Imagem validada em container isolado sem rede/volume, incluindo assinatura, compartilhamento e deduplicação.

Stack 18 atualizada pela API suportada do Portainer; somente SEI_IMAGE alterado. Administração exclusiva, arquivo acessível ao editor/atualização, demais variáveis e volume sei_organizador_data preservados. Atualização completed, container healthy como node; sete módulos conferidos por SHA-256. Banco íntegro, 1 bloco e 278 registros de histórico antes/depois. Evidências em artifacts/deployment-0.15.0.json, database-verification-0.15.0.json e signature-endpoints-0.15.0.json.

Rollback: reaplicar pelo Portainer o arquivo e Env de artifacts/stack-before-0.15.0.json e usar a extensão anterior. Preservar volume e banco; a imagem anterior ignora as tabelas novas. Não restaurar o banco para apenas voltar a imagem.

156 testes passaram; sintaxe/formatação aprovadas e prévia do painel conferida no Chromium. ZIP com 32 arquivos comparados por SHA-256 com a pasta extension; hash 90127FA87D18E6213A4355B48A4249B4449CFA305C7AC0F54C1B2C30480CDE95. Uma nova assinatura na sessão real do SEI ainda precisa de conferência.

## Atualização 0.16.0 — 2026-10-27

Alertas de processos aguardando recebimento na unidade para os usuários que escolheram o bloco interno 1396 — Secretaria. Tabela aditiva secretariat_receipts, independente de classificações, histórico e limpeza dos blocos. Versão de snapshot compartilhada, referência por chegada, linha de base silenciosa e confirmação pela listagem nativa do SEI. JSON limitado a 2 MiB e 10.000 processos; unidade fixa e acesso público explicitamente autorizado preservados.

Backup consistente em /data/backups/before-0.16.0-20261027.sqlite (VACUUM INTO, quick_check ok), com cópia local em artifacts/backups/before-0.16.0-20261027.tar. Imagem testada em container isolado sem rede/volume, incluindo transição de recebimento e preservação da classificação. Configuração anterior em artifacts/stack-before-0.16.0.json.

Stack 18 reimplantada pela API suportada do Portainer, trocando apenas SEI_IMAGE. Administração exclusiva, arquivo/editor acessível, demais variáveis e volume sei_organizador_data preservados. Atualização completed, container healthy como node e oito módulos conferidos por SHA-256. Banco íntegro, 1 bloco e 278 registros de histórico antes/depois. Evidências em artifacts/deployment-0.16.0.json, database-verification-0.16.0.json e receipts-endpoints-0.16.0.json. A rota HTTPS de recebidos responde 200; outra unidade 403; método inválido 405; bloco inválido 403 e lista incompleta 400.

Rollback: reaplicar pelo Portainer o arquivo e Env de artifacts/stack-before-0.16.0.json e usar a extensão anterior, preservando o banco e o volume. A imagem anterior ignora a tabela adicional. Não restaurar o banco apenas para voltar a imagem.

167 testes passaram, incluindo os dois HTMLs fornecidos e a simulação de seis páginas/217 processos. A integração do painel, som, duas instâncias de navegador e restrição ao bloco 1396 foram validadas; uma nova chegada na sessão real do SEI permanece pendente.

## Otimização da API 0.16.4 — 2026-10-28

Histórico calculado em cache limitado, invalidado por gravações locais e PRAGMA data_version de outras conexões. Resultado devolvido como cópia independente. Cabeçalho Server-Timing mede o processamento de cada resposta. Nenhuma migração, mudança de permissão ou aumento de recursos. Limites de 0,5 CPU e 512 MiB preservados.

Stack 18 atualizada pelo mecanismo suportado do Portainer, mudando somente SEI_IMAGE. Administração exclusiva, editor/arquivo acessível, atualização completed, container healthy como node e oito módulos conferidos por SHA-256. Volume e demais variáveis preservados. Banco com quick_check ok: 2 blocos e 293 registros de histórico antes/depois. Evidência resumida versionada em deploy/performance-0.16.4.json.

Backup consistente em /data/backups/before-0.16.4-20261028.sqlite, com cópia local em artifacts/backups/before-0.16.4-20261028.tar. Rollback: reaplicar pelo Portainer o arquivo e Env de artifacts/stack-before-0.16.4.json, preservando o volume e o banco. A versão anterior pode ler os mesmos dados.

Medições pontuais de oito consultas por rota: mediana HTTPS do histórico do bloco 1343 passou de 30,6 ms para 18,4 ms. Benchmark interno de 15 leituras mostra primeira leitura de aproximadamente 80 ms e mediana das demais de 0,6 ms. Não foi medida navegação real no SEI nem carga simultânea.

## Correção da extensão 0.16.5 — 2026-10-28

Alerta da Secretaria exige observação de recebidos de até 90 segundos; leituras mais antigas ou com relógio mais de 30 segundos no futuro não geram som/notificação. Referências desconhecidas não são consumidas por leitura antiga, permitindo confirmação posterior sem avisar processos já recebidos. Não altera o servidor nem aumenta consultas ao SEI. API 0.16.4 preservada.
