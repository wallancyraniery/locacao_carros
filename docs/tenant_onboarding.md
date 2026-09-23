# Cadastro da locadora e acesso privado

## Auditoria anterior à implementação

- Auth já usava `@supabase/ssr`, cliente por request, chave publishable, cookies HttpOnly/SameSite=Lax (Secure em produção) e fetch sem cache. O proxy `/admin/*` renova claims e mantém respostas privadas/no-store. Páginas e actions validam identidade independentemente com `auth.getUser()`.
- A Central consultava a Data API com JWT individual. `organization_memberships.user_id` era a chave primária: uma associação por usuário, sem role e sem FK para o schema gerenciado Auth. Associações eram provisionadas administrativamente.
- `organizations` tinha ID, nome, slug único e timestamps; faltavam cidade e informações de privacidade.
- A migration 0001 habilitou RLS; 0003 delimitou o intake; 0005 criou associações e SELECT por colunas com policies restritivas de organização; 0006 restringiu o helper Supabase. 0007–0010 implementaram reservas, disponibilidade e submissão atômica, sem conceder acesso público às tabelas de reservas.
- O login apenas autenticava usuários existentes e os enviava a `/admin/interessados`. Sem associação, a página orientava procurar um administrador. Não havia cadastro, callback de confirmação ou onboarding.

## Jornada implementada

`/admin/cadastro` → Supabase Auth → confirmação de e-mail quando exigida → `/admin` → `/admin/onboarding` → `/admin/pronto` → `/admin` (Visão geral).

`/admin/login` permanece o acesso por senha e redireciona para `/admin`, que decide entre onboarding e Central; o botão Sair usa o logout local já existente. Usuários autenticados sem associação são encaminhados ao cadastro da locadora. Com associação, entram na Central e não recebem um segundo formulário. Falhas de consulta não são interpretadas como ausência de associação.

O cadastro valida e-mail, senha de 12–128 caracteres e confirmação igual. A resposta sem sessão é neutra para conta existente, confirmação pendente e erro do provedor; não ecoa credenciais nem mensagens do Auth. Somente uma sessão realmente retornada pelo Auth permite seguir diretamente. Nenhum `user_metadata` é usado para autorização.

O callback `/admin/confirmar` aceita token hash de signup ou code PKCE, grava a sessão pelo mesmo cliente SSR e usa destinos internos fixos. Não registra URLs, tokens ou erros do provedor. Links inválidos voltam ao login com mensagem genérica. Todas essas rotas estão sob o proxy e layout `/admin`, dinâmicos e privados.

## Banco e autorização

A migration append-only `0011_tenant_onboarding.sql` acrescenta cidade, controlador e canal de privacidade à organização. As colunas são nullable para preservar cadastros legados; a fronteira exige todos os campos novos. O slug novo tem 3–63 caracteres, letras minúsculas, números e hífens entre segmentos; a unicidade existente é preservada. O canal aceita HTTPS sem credenciais ou mailto. Não há CNPJ ou documento obrigatório.

A associação ganha `role` (backfill de todas as associações preexistentes para `owner`; default `member` para associações futuras; `owner` explícito no onboarding). Isso não reduz nem amplia o acesso já existente dos associados à Central. Não há administração de equipe ou troca de role na aplicação.

A Data API chama `public.create_initial_organization`, um adaptador **SECURITY INVOKER**, sem privilégios elevados. Ele delega a `onboarding_private.create_initial_organization`, **SECURITY DEFINER** com search_path vazio e owner administrativo confiável (verificado pela migration). O schema privado não deve ser adicionado aos schemas expostos da Data API. `authenticated` recebe somente USAGE/EXECUTE necessários; PUBLIC, anon e intake não executam a fronteira. Nenhum INSERT/UPDATE/DELETE direto é concedido às tabelas.

A função obtém `sub` das claims que o PostgREST validou, exatamente como as policies da Central, e recusa identidade ausente, inválida ou Auth anônimo. Não recebe userId nem role como argumentos. Claims de `user_metadata` não participam do processo. Não conceder acesso SQL às roles de API: a origem confiável dessas claims é o PostgREST, não parâmetros de uma conexão SQL de usuário.

Organização, associação owner e recibo são inseridos na mesma chamada/transação. A falha em qualquer INSERT reverte tudo. Um advisory lock por identidade serializa tentativas concorrentes, inclusive operações diferentes em duas abas. A função exige READ COMMITTED; constraints de unicidade são a proteção adicional.

O recibo privado `onboarding_private.initial_organizations` (SQL manual, fora do ORM) tem chave por usuário. Retry da mesma operação com os mesmos dados retorna o mesmo ID; outra operação ou conteúdo incompatível falha sem alterar dados. Associação preexistente impede nova criação. O recibo também impede novo cadastro após revogação; não recria memberships apagados. Ele tem RLS sem policies e nenhum acesso das roles de aplicação. A ação não retorna esse ID ao formulário: redireciona para a confirmação.

O ID da operação nasce no servidor e fica vinculado ao formulário. Erros preservam os campos para retry. Recarregar a página após sucesso encaminha para a Central; a proteção do banco continua valendo se a resposta se perder.

SELECT das colunas de organização e da role é concedido a authenticated, com policy restritiva limitada à organização da própria associação. A RLS existente de leads, veículos e associações permanece intacta, assim como grants e funções de reservas/intake.

## Configuração para ativação futura

Este checkpoint não acessa Supabase remoto nem altera configuração Auth. Para ativação, o operador precisa habilitar signup por e-mail no projeto (a documentação anterior orientava desabilitá-lo), mantendo login anônimo desabilitado. Confirmação de e-mail, políticas de senha, limites e SMTP continuam sob controle do Supabase; não são simulados pelo aplicativo.

Configurar `APP_PUBLIC_ORIGIN` no servidor: `https://locacao-carros.vercel.app` em produção ou `http://localhost:3000` no desenvolvimento local. É uma origem explícita, sem credenciais, caminho, query ou fragmento; HTTP só é aceito para loopback fora de produção. Não há fallback para Host, X-Forwarded-Host ou URL de preview. Ausência ou valor inválido impede signup e mantém a resposta pública neutra, sem logs do valor.

O signup envia `options.emailRedirectTo` como `<APP_PUBLIC_ORIGIN>/admin/confirmar`, compatível com o template padrão e o callback PKCE existente. Esse destino exato deve constar em Redirect URLs do Supabase em cada ambiente. Nenhuma configuração remota é alterada pelo código.

Configurar Site URL com a origem confiável da aplicação. Para confirmação SSR, o template **Confirm signup** pode usar:

```html
<a href="{{ .SiteURL }}/admin/confirmar?token_hash={{ .TokenHash }}&type=signup">Confirmar minha conta</a>
```

Não anexar destinos arbitrários. A rota também aceita code PKCE quando o redirecionamento estiver configurado para `/admin/confirmar`. Não basta o callback existir: o template/redirect precisa apontar para ele. Se a confirmação for concluída fora desse callback, o usuário ainda pode entrar com senha após confirmar o e-mail.

Aplicar 0011 pelo fluxo administrativo autorizado, mantendo o owner confiável e os grants explícitos. O runtime não usa service role nem credencial PostgreSQL administrativa para esse fluxo. O usuário administrativo existente mantém a associação e a leitura da Central; recebe o backfill para owner, sem mudar usuário, organização ou acesso existente.

## Validação e limites

Testes unitários cobrem validação, respostas não enumeráveis, sessão ausente, confirmação, destinos fixos, identidade validada, payload RPC sem userId, erros seguros, páginas e preservação de campos. PostgreSQL local cobre criação, retries sequenciais/concorrentes, slug, rollback, revogação, privilégios e isolamento A/B. As suítes anteriores continuam obrigatórias.

Auth/HTTP são simulados nos testes locais; isso não comprova SMTP, entrega de confirmação, captcha ou configuração real do projeto remoto. Antes de abertura pública, validar operacionalmente esses itens e os limites contra abuso do Auth. Não há envio de e-mail pela aplicação nem bypass dos limites do provedor.

A inspeção visual local não foi concluída: a página de cadastro respondeu HTTP 200, mas a automação do Chromium travou na comunicação com o navegador. O servidor e o gateway sintético foram encerrados sem criar registros. As verificações de interface desta entrega são os testes de componentes e rotas; isso não comprova uma jornada visual completa.

A frota inicial e a página pública por slug foram acrescentadas em checkpoints posteriores; veja [Central e frota](tenant_dashboard_fleet.md) e [vitrine pública](public_tenant_storefront.md). Equipe, convite, planos, pagamento e marketplace continuam fora do escopo. Os dados de privacidade são armazenados; não substituem o aviso do catálogo demo nem criam uma política jurídica pronta. Organizações legadas podem continuar com esses campos ausentes até uma etapa de edição.

## Referências

- [Supabase SSR e verificação de identidade](https://supabase.com/docs/guides/auth/server-side/creating-a-client).
- [SignUp e respostas para contas existentes](https://supabase.com/docs/reference/javascript/auth-signup).
- [Templates de e-mail](https://supabase.com/docs/guides/auth/auth-email-templates).
