# Segurança

## Modelo de acesso

O banco segue least privilege. Operações administrativas e migrations usam credencial própria; o formulário público usa exclusivamente `lead_intake_runtime`. A Central privada usa chave publishable e JWT individual, com associação por organização e RLS; veja [central_interessados.md](central_interessados.md). Nenhuma credencial administrativa pode ser usada como fallback do runtime ou incorporada à aplicação.

No Supabase de homologação, o runtime conecta pelo Transaction Pooler na porta 6543, com TLS `verify-full`, CA explícita e verificação de identidade. Preserve esses requisitos. A role não possui privilégios administrativos, bypass de RLS ou ownership.

RLS e grants mínimos permitem à runtime consultar somente a organização e o veículo necessários e inserir apenas as colunas autorizadas do lead. A leitura de `rental_leads` permanece negada. A descrição completa de memberships, policies, grants, provisionamento, rotação e revogação está em [runtime_database_access.md](runtime_database_access.md).

O Supabase mantém `public.rls_auto_enable()` como função `SECURITY DEFINER` vinculada ao event trigger `ensure_rls`. A migration 0006 preserva esse mecanismo e revoga somente a chamada direta da função por `PUBLIC`, `anon` e `authenticated`. A migration é condicional para permanecer aplicável no PostgreSQL local sem o helper. `lead_status_history` continua com RLS habilitado, sem policy e sem grants para essas roles.

## Dados e observabilidade

As tabelas do [núcleo de reservas](reservations_availability.md) têm RLS habilitado sem policies e sem grants às roles públicas, autenticadas ou de intake. FKs compostas garantem organização consistente em veículos, leads e solicitações. Os triggers usam `SECURITY INVOKER`, sem ampliar acesso ou criar credenciais. Autorização operacional, validação da identidade de quem decide e retenção conjunta ainda precisam ser implementadas antes de uso pela aplicação. A outbox guarda identificadores e códigos limitados, sem contatos ou respostas brutas de provedores.

- Nunca versione senha, URL real de conexão, conteúdo de `.env`, certificado ou outro secret.
- Nunca registre FormData, nome, telefone, e-mail, cidade, query com valores, CA, URL, stack ou detalhes que possam conter dados do usuário.
- Falhas inesperadas do fluxo de lead registram somente `{ stage, code }`, com código sanitizado e mensagem pública genérica.
- A submissão de reserva segue o mesmo formato, com estágios `reservation_submission` e `reservation_turnstile`. Somente códigos permitidos por `safeDatabaseErrorCode` são registrados; códigos desconhecidos viram `null`. Resultados esperados de domínio não geram diagnóstico técnico.
- A proteção Turnstile é validada no servidor antes do acesso ao banco. O modo sintético existe somente fora de produção; produção exige configuração Cloudflare completa e hostname esperado.
- Use dados exclusivamente sintéticos em homologação e minimize os campos coletados no produto.

## Operações remotas

Toda operação administrativa remota deve ser explícita, previamente delimitada, controlada, auditável e fail-closed. Valide projeto, banco, identidade, migrations e pré-condições antes da primeira escrita; interrompa diante de divergência. Não corrija silenciosamente estado remoto, memberships ou permissões.

Não execute `db:seed:development` no Supabase. Use somente provisionadores remotos dedicados e autorizados. Não altere RLS, grants, roles, TLS ou migrations aplicadas para contornar uma falha sem causa comprovada e autorização específica.

O fluxo público possui proteção contra abuso e um procedimento manual de retenção. A política, o aviso e os gates operacionais estão em [lead_privacy_and_retention.md](lead_privacy_and_retention.md). Identidade jurídica, canal oficial e responsáveis ainda precisam ser definidos antes do uso público.

A migration 0010 adiciona a fronteira estreita `reservation_submission_private.submit`, exclusiva de `lead_intake_runtime`, com `SECURITY DEFINER`, `search_path` vazio e relações qualificadas. Ela fixa a organização demo, valida o vínculo do lead e do veículo, revalida disponibilidade com lock e retorna somente identificadores/recibo. Não concede SELECT ou INSERT direto nas tabelas de reservas. Os triggers de agenda e integridade permanecem invoker; a verificação diferida da solicitação é executada ainda sob a fronteira privilegiada. As roles anon/authenticated e PUBLIC não podem executar a função.

A migration 0011 implementa o [onboarding](tenant_onboarding.md) com identidade derivada exclusivamente das claims validadas, função privada com search_path vazio e grants de execução restritos. A associação e a organização são criadas atomicamente sem INSERT direto; SELECT de organização permanece limitado por RLS à associação existente. Cadastro sem sessão e erros Auth usam respostas neutras, sem mensagens do provedor ou logs de credenciais.

A fronteira privada de [cadastro de frota 0012](tenant_dashboard_fleet.md) valida owner e organização da sessão, recusa Auth anônimo e fixa is_demo=false. Acrescenta apenas SELECT por coluna em veículos e EXECUTE estreito, sem escrita direta ou mudança no acesso às reservas.
