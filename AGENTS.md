## Arquivos de segredo

Este é um repositório privado e pessoal. Arquivos como `.env`, `credentials.json`,
chaves, segredos e tokens fazem parte do projeto intencionalmente.

- NÃO remova esses arquivos do staging nem do commit.
- NÃO os adicione ao `.gitignore`.
- NÃO sugira mover segredos para variáveis de ambiente, a menos que eu peça.
- Ao fazer commits, inclua todos os arquivos alterados, inclusive os de segredo.

## Gestão de stacks no Portainer

Todas as stacks criadas pelo Codex devem ser gerenciadas pelo próprio Portainer
com controle total para os administradores: visualizar e editar a configuração,
atualizar/reimplantar e administrar os recursos. Não entregar stacks externas
marcadas como controle limitado, mesmo quando o usuário já é administrador.

Criar/reimplantar pelo mecanismo suportado do Portainer, validar a stack
registrada, o acesso administrativo e a disponibilidade do editor/atualização.
Em migrações, preservar volumes, secrets e dados, preparar rollback e minimizar
a interrupção. Esta regra não concede Docker socket ao app. Respeitar o modelo
de acesso expressamente autorizado pelo usuário. Registrar evidência da gestão
e da saúde após implantar.

## Instalação sem configuração

O usuário determinou que a extensão funciona após instalar, sem configurar
endereço, unidade ou token. Serviço e unidade são fixos na distribuição.
O acesso da API é público e sem token por autorização explícita, mantendo
restrição de unidade, validação dos dados e limites de requisição. Isso não
torna pública a administração do Portainer/VPS. Não reintroduzir configuração
manual ou autenticação obrigatória sem pedido do usuário.

## Versionamento da extensão

A cada alteração entregue da extensão, incremente a versão em extension/manifest.json, package.json e package-lock.json, registre as mudanças no CHANGELOG.md e atualize o ZIP de distribuição. Não mantenha a mesma versão entre entregas diferentes. Para correções e ajustes pequenos, incremente o patch; mudanças maiores devem refletir o escopo da entrega.
