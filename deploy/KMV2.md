# SEI Organizador na KMV2

## Estado atual

O usuário autorizou uso sem configuração manual e sem token. A extensão tem
endereço HTTPS e unidade fixos e é utilizada simplesmente após instalar e abrir
a lista de bloco interno do SEI. Opções exibem somente informação, sem campos.
A versão da extensão é 0.1.4. Cada atualização entregue da extensão deve incrementar a versão.

API: https://ext.5cpa.com.br. Registro A na Cloudflare para 212.85.19.248,
DNS only, com HTTPS confiável via Traefik. A API aceita leitura e gravação sem
autenticação, inclusive chamadas externas à extensão. A restrição de unidade
não autentica o usuário; autor do SEI continua sendo informativo. Validação
JSON, conflitos de versão, limite de corpo e rate limit foram preservados.

Imagem pública: https://hub.docker.com/r/flaviokosta/sei-organizador.
Imagem da stack: flaviokosta/sei-organizador@sha256:fe0e4c88d715ef4b08ae67a2a228f2c4522df898b9777420e35941bd9bf63242.
O conteúdo de todas as camadas foi conferido: somente package.json e
server/index.js, store.js, auth.js e undo.js em /app, sem .env, instruções privadas,
credenciais conhecidas, configurações operacionais ou banco.

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

Extrair artifacts/sei-organizador-extension-kmv2.zip e carregar a pasta extension
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

35 testes passaram na entrega atual da extensão, além de sintaxe. O smoke local do
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
