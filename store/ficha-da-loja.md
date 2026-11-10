# Ficha para a Chrome Web Store

Textos e respostas prontos para colar no painel do desenvolvedor. O pacote é gerado com `node tools/build-store.mjs` e fica em `artifacts/sei-organizador-store.zip`.

## Antes de enviar

1. Criar a conta de desenvolvedor (taxa única) e ativar a verificação em duas etapas da conta Google.
2. Publicar a política de privacidade: definir `SEI_PRIVACY_CONTACT` na stack da API (nome e e-mail de contato) e reimplantar. A página fica em `https://ext.5cpa.com.br/privacidade`.
3. Gerar o pacote: `node tools/build-store.mjs`.

## Pacote

- Arquivo: `artifacts/sei-organizador-store.zip`.
- Difere do ZIP distribuído na unidade só no manifesto e no `config.js`: sem o campo `key` (a loja define o identificador) e sem a consulta de versão ao GitHub (o Chrome atualiza sozinho).
- O identificador da extensão muda em relação ao ZIP. Cada pessoa instala pela loja, remove a versão do ZIP e escolhe de novo o bloco de trabalho e os chefes de seção.

## Listagem

**Nome:** SEI Organizador

**Resumo (até 132 caracteres):**

> Abas por assunto, situação dos processos e alertas de novos processos nos blocos internos do SEI-RJ. Ferramenta não oficial.

**Categoria:** Fluxo de trabalho e planejamento.

**Idioma:** Português (Brasil).

**Descrição detalhada:**

> O SEI Organizador ajuda uma unidade a organizar os processos dos seus blocos internos no SEI-RJ.
>
> O que ele faz na lista de um bloco interno:
> • Abas por assunto, criadas pela própria unidade, para separar os processos do bloco.
> • Situação de cada processo: Atenção, Acompanhar, Urgente, Assinar ou Arquivar.
> • Histórico das alterações, com opção de desfazer.
> • Tudo compartilhado entre os colegas que usam o mesmo bloco.
>
> Alertas, no rodapé do SEI e por notificação do sistema:
> • Novo processo no bloco.
> • Processo marcado para assinar (para os chefes de seção indicados).
> • Documento assinado em bloco de assinatura.
> • Colega com um documento do processo aberto no editor.
>
> Na tela do processo, um resumo mostra a última movimentação, a chegada à unidade e pendências de assinatura. Ao enviar um processo, a extensão avisa se há documentos da unidade ainda sem assinatura.
>
> Importante:
> • Esta extensão foi feita para uma unidade específica do SEI-RJ e só funciona para os usuários dessa unidade. Em outras unidades ela não faz nada.
> • É uma ferramenta independente, não oficial, sem vínculo com o Governo do Estado do Rio de Janeiro nem com os responsáveis pelo SEI.
> • Ela não altera processos nem documentos no SEI: apenas lê as telas que o usuário já pode ver e acrescenta a organização da unidade.
>
> Privacidade: a extensão envia ao serviço da unidade o login e o nome do usuário no SEI, números de processos, blocos e documentos e as marcações feitas. Não envia senhas, cookies nem o conteúdo de documentos. Política completa: https://ext.5cpa.com.br/privacidade

**Imagens** (em `store/screenshots/`, 1280×800, com página de demonstração e dados fictícios):

1. `1-bloco-assuntos-status.png` — lista do bloco com assuntos e situações.
2. `2-alerta-processo-novo.png` — aviso de processo novo no rodapé.
3. `3-configuracoes.png` — janela de configurações.

**Ícone da loja:** `extension/icons/icon-128.png`.

## Visibilidade

Recomendado: **Não listada** (instala quem tem o link) ou **Privada** (só os e-mails autorizados). A extensão serve a uma única unidade; publicar como pública só atrairia instalações que não funcionam.

## Privacidade (aba "Práticas de privacidade")

**Finalidade única:**

> Organizar e acompanhar os processos dos blocos internos de uma unidade no SEI-RJ: classificar por assunto e situação e avisar sobre novos processos, assinaturas e edições.

**Justificativa de cada permissão:**

| Permissão | Justificativa |
|---|---|
| `storage` | Guardar no navegador o bloco de trabalho escolhido, o estado dos alertas, a preferência de som e os logins dos chefes de seção. |
| `alarms` | Verificar uma vez por minuto se entrou processo novo no bloco, mesmo com a aba do SEI em segundo plano. |
| `notifications` | Mostrar a notificação do sistema quando entra um processo novo, quando há processo para assinar ou quando um documento é assinado. |
| `offscreen` | Tocar o som curto do alerta. No Manifest V3 o service worker não reproduz áudio; o documento offscreen existe só para isso. |
| Acesso a `https://sei.rj.gov.br/*` | É o único site em que a extensão atua: lê a lista do bloco e o andamento dos processos que o usuário já pode ver e acrescenta as abas, as situações e o rodapé de alertas. |
| Acesso a `https://ext.5cpa.com.br/*` | Serviço da própria extensão, que guarda a organização compartilhada entre os colegas da unidade. |

**Código remoto:** Não. Todo o código está no pacote.

**Dados coletados (marcar):**

- Informações de identificação pessoal: nome e login do usuário no SEI.
- Atividade do usuário: processos do bloco abertos pelo usuário e presença no editor de documentos.
- Conteúdo do site: números de processos, blocos e documentos lidos nas telas do SEI.

Não marcar: saúde, finanças, autenticação, comunicações pessoais, localização, histórico da web.

**Declarações (marcar as três):** não vendo nem transfiro dados a terceiros fora dos casos aprovados; não uso os dados para fins sem relação com a finalidade única; não uso os dados para análise de crédito ou empréstimos.

**URL da política de privacidade:** `https://ext.5cpa.com.br/privacidade`

## Instruções para a análise (campo "Instruções de teste")

> A extensão só atua em páginas autenticadas do SEI-RJ (https://sei.rj.gov.br), sistema de processos do Governo do Estado do Rio de Janeiro, e só para os usuários de uma unidade específica. O acesso exige conta institucional, que não pode ser compartilhada. Sem esse acesso a extensão permanece inativa: não injeta nada em outras páginas e não faz requisições.
>
> As capturas de tela da listagem mostram a extensão em uma página de demonstração com dados fictícios. O código não é ofuscado nem minificado.

## Depois de publicada

1. Enviar o link da loja aos colegas e pedir que removam a versão instalada pelo ZIP.
2. Quando todos migrarem: tornar o repositório do GitHub privado e deixar de publicar ZIP em `R:\sei-organizador`.
3. A cada versão nova: `node tools/build-store.mjs` e enviar o pacote no painel. A análise de cada atualização pode levar alguns dias.
