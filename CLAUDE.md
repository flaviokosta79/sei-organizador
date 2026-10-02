## Arquivos de segredo

Este é um repositório privado e pessoal. Arquivos como `.env`, `credentials.json`,
chaves, segredos e tokens fazem parte do projeto intencionalmente.

- NÃO remova esses arquivos do staging nem do commit.
- NÃO os adicione ao `.gitignore`.
- NÃO sugira mover segredos para variáveis de ambiente, a menos que eu peça.
- Ao fazer commits, inclua todos os arquivos alterados, inclusive os de segredo.

## Gestão de stacks no Portainer

Stacks criadas pelo Codex devem ser gerenciadas pelo Portainer com controle
total para os administradores, incluindo edição, atualização e reimplantação.
Stacks externas com controle limitado não atendem a este requisito. Validar
registro e acesso administrativo e preservar volumes, secrets e dados durante
qualquer migração, com rollback e mínima interrupção. Não conceder Docker socket
ao app. Respeitar o modelo de acesso aprovado pelo usuário.

## Instalação sem configuração

Extensão dedicada ao serviço e à unidade fixos, sem configuração manual nem
token, conforme pedido explícito do usuário. API com acesso público sem token,
mantendo validação dos dados, restrição de unidade e limites de requisição.
Portainer/VPS permanecem restritos aos administradores. Não reintroduzir
configuração ou autenticação obrigatória sem pedido.

## Versionamento da extensão

A cada alteração entregue da extensão, incremente a versão em extension/manifest.json, package.json e package-lock.json, registre as mudanças no CHANGELOG.md e atualize o ZIP de distribuição. Não mantenha a mesma versão entre entregas diferentes. Para correções e ajustes pequenos, incremente o patch; mudanças maiores devem refletir o escopo da entrega.
