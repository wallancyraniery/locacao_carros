# Central de Interessados — primeira entrega

## Fluxo e limites

`/admin/login` aceita e-mail e senha; `/admin/cadastro` permite criar conta e a primeira locadora pelo [onboarding](tenant_onboarding.md). `/admin/interessados` valida a identidade com `auth.getUser()` no servidor e consulta a Data API com a chave publishable e o JWT desse usuário. O proxy restrito a `/admin` usa `getClaims()` para renovar cookies SSR. Clientes são criados por request; cookies são HttpOnly, SameSite=Lax e Secure em produção. Páginas administrativas são dinâmicas e respostas/fetches usam `no-store`. Logout encerra a sessão atual e invalida o cache de navegação administrativa.

A lista mostra somente recebimento (horário de São Paulo), nome, telefone/e-mail, cidade, veículo, período preferido e status. Há paginação de 50 registros. Nenhum dado pessoal integra links, erros públicos ou logs da aplicação. O cadastro por e-mail e senha foi acrescentado no onboarding. Não há OAuth, recuperação de acesso, edição, exclusão ou mudança de status.

## Configuração e ativação posterior

- `NEXT_PUBLIC_SUPABASE_URL`: origem HTTPS do projeto (`https://<project-ref>.supabase.co`).
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: somente chave `sb_publishable_...`; não usar chave secret, service role ou credencial PostgreSQL nesta integração.
- Node.js 22 ou superior. Dependências oficiais fixadas no package.json e lockfile.
- Aplicar a migration `0005_central_interessados` pelo fluxo Drizzle administrativo existente, em operação futura explicitamente autorizada. Manter o schema `public` acessível à Data API com os grants restritos da migration.
- A entrega inicial exigia cadastro público desabilitado. Para ativar o onboarding, habilitar signup e configurar confirmação/SMTP conforme [tenant_onboarding.md](tenant_onboarding.md), mantendo login anônimo desabilitado. Nunca expor senha no Git, argumentos ou logs.
- Um administrador confere o UUID imutável do usuário no Auth e a organização e insere a associação em `organization_memberships`. O UUID é uma referência externa ao Auth (sem FK para o schema gerenciado `auth`); não pode ser fornecido pelo navegador. O onboarding obtém a identidade de claims validadas. A chave primária permite apenas uma organização por usuário. A migration 0011 acrescenta criação atômica da associação inicial owner, sem alterar associações existentes.
- Para revogar acesso, remover primeiro a associação e depois revogar sessões/desabilitar ou excluir o usuário no Auth. Isso retira acesso aos dados mesmo enquanto um JWT anteriormente emitido ainda não expirou. Alteração de associação também é exclusivamente administrativa.

Usuário oficial, configuração do ambiente, aplicação remota da migration e prova funcional contra Supabase permanecem pendentes. Nenhuma dessas operações ou deploy foi executado nesta entrega.

## Banco e isolamento

A migration habilita RLS na associação e concede a `authenticated` somente SELECT das colunas necessárias em associações, leads e veículos. `request.jwt.claims` é preenchido pelo PostgREST após validar o JWT; as policies usam somente `sub` e recusam identidades Auth anônimas, sem usar `user_metadata`. A policy da associação filtra o próprio usuário; as de leads e veículos exigem a organização visível nessa associação. Guardas restritivas mantêm esse limite mesmo diante de uma policy permissiva mais ampla. A migration 0005 não tem funções SECURITY DEFINER; a fronteira privada de onboarding foi acrescentada em 0011.

`anon` não lê os dados. Um autenticado sem associação não vê linhas. Não há escrita direta de associações nem permissão para inserir, atualizar ou excluir leads. A criação da associação inicial ocorre somente pela fronteira privada de onboarding. Os grants, roles, policies e conexão PostgreSQL de `lead_intake_runtime` permanecem os mesmos. No PostgreSQL puro de testes, a migration cria somente roles NOLOGIN equivalentes quando `anon`/`authenticated` ainda não existem; não modifica atributos de roles preexistentes.

## Validação local

Rodar `npm run db:migrate:test` com `TEST_DATABASE_URL` apontando exclusivamente para PostgreSQL local terminado em `_test`, seguido de `npm run test:postgresql`. Os testes reais exercitam roles, claims sintéticos, RLS, isolamento entre organizações, revogação e preservação da runtime. Os testes unitários cobrem identidade, login/logout, cookies SSR, cache, paginação e estados da interface. Auth e HTTP são simulados: isso não comprova autenticação ou conectividade no Supabase remoto.

## Referências consultadas

- [SSR com Next.js](https://supabase.com/docs/guides/auth/server-side/creating-a-client) e [cuidados com cache](https://supabase.com/docs/guides/auth/server-side/advanced-guide).
- [Changelog Supabase](https://supabase.com/changelog), incluindo [grants explícitos da Data API](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) e [Node.js 22+](https://supabase.com/changelog/45715-deprecation-notice-dropping-support-for-node-js-20).
- [Claims por transação no PostgREST](https://docs.postgrest.org/en/stable/references/transactions.html#request-headers-cookies-and-jwt-claims).
