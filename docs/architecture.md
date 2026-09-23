# Arquitetura

## Stack e organização

O projeto usa Next.js 16 com App Router, React 19, TypeScript estrito, Zod, Drizzle ORM, PostgreSQL 17, Vitest, Testing Library, Docker Compose e GitHub Actions.

As responsabilidades principais são:

- `src/app`: rotas e composição das páginas;
- `src/modules`: componentes, validação, casos de uso, domínio e infraestrutura agrupados por assunto;
- `src/config`: validação e separação dos ambientes de banco;
- `scripts`: diagnósticos, launchers e provisionamentos operacionais explícitos;
- `drizzle`: migrations e metadados versionados;
- `tests`: testes unitários, de componentes, contratos de ambiente e integração PostgreSQL.

## Fluxo de interesse

```text
UI → Server Action → Zod → caso de uso → repository → Drizzle → PostgreSQL
```

A UI coleta apenas dados iniciais. A Server Action converte a entrada e mantém mensagens públicas seguras. Zod valida no servidor. O caso de uso verifica o honeypot e a disponibilidade. O repository restringe a consulta e o INSERT às operações previstas. Drizzle produz consultas parametrizadas e o PostgreSQL aplica constraints, grants e RLS.

## Ambientes e dados

O desenvolvimento comum usa PostgreSQL local e `npm run dev`. O Supabase é um PostgreSQL remoto de homologação, iniciado com `npm run dev:supabase` e credencial runtime exclusiva. Credenciais de migration/admin e runtime não são intercambiáveis.

Os dados editoriais do catálogo — nome, imagem e especificações — permanecem estáticos. Antes de renderizar CTAs, o servidor consulta somente os UUIDs demonstrativos disponíveis no banco e combina as duas fontes. Um veículo sem confirmação aparece com interesse indisponível e não renderiza o formulário; a Server Action repete a verificação no envio para cobrir mudanças concorrentes. Erros de consulta falham fechado. A fixture remota controlada existe somente para homologar o fluxo sintético autorizado.

## Central privada

A [Central de Interessados](central_interessados.md) usa Supabase Auth SSR com cookies, validação server-side e Data API com JWT do usuário. A associação administrativa em `organization_memberships` e RLS limitam a leitura à organização. Essa conexão é separada do intake PostgreSQL e não utiliza sua role nem credenciais administrativas.

## Decisões estáveis

- Dados do formulário passam pelo servidor; a aplicação não usa credencial administrativa.
- UUIDs do lead e da operação são gerados pelo servidor, dinheiro é armazenado em centavos e instantes de auditoria usam `timestamptz`. Retirada/devolução do núcleo de reservas usam `date`, com intervalo `[pickup_date, return_date)`.
- A identidade opaca da operação permanece estável em retry técnico e possui unicidade no PostgreSQL; uma nova visita recebe outra identidade, sem deduplicação por telefone ou e-mail.
- O INSERT de leads enumera somente as colunas concedidas à runtime e não depende de `RETURNING`.
- A análise após o interesse permanece humana; o sistema ainda não é uma plataforma completa de reservas.
- Migrations aplicadas são imutáveis; mudanças de schema entram em nova migration.
- A separação por módulos, o repository e as fronteiras de ambiente só devem mudar diante de benefício técnico concreto e validado.

O contrato detalhado de acesso remoto está em [runtime_database_access.md](runtime_database_access.md).

## Núcleo de Reservas e Disponibilidade

O [checkpoint 1](reservations_availability.md) adiciona quatro tabelas sem expor rotas ou alterar o intake. O PostgreSQL coordena transição de decisão → bloco de agenda → outbox na mesma transação, com triggers `SECURITY INVOKER`. A agenda usa exclusion constraint GiST para impedir sobreposições ativas inclusive sob concorrência. A outbox separa persistência do evento e entrega futura; a lista de espera não aloca veículos. RLS permanece fechado até definição do acesso operacional. O schema tipado está em `src/modules/database/schema/reservations.ts`; constraints de exclusão e triggers estão no SQL manual da migration 0007.

O estado estrutural do veículo é `operational_status = active | inactive`; indisponibilidade temporal pertence exclusivamente a `vehicle_schedule_blocks`. A coluna `vehicles.status` e seu enum permanecem temporariamente como compatibilidade de expand/contract. Aprovação bloqueia a linha do veículo e exige `active`; aprovação e cancelamento não alteram o estado estrutural.

O checkpoint de submissão acrescenta `src/modules/reservations`: caso de uso server-side → repository → função privada PostgreSQL em uma chamada. O banco resolve o lead real pela operação e confirma solicitação/outbox atomicamente, sem reutilizar o UUID potencialmente descartado do repository antigo. O fluxo público abaixo conecta essa fronteira à UI. Locks, recibo idempotente e contrato transacional estão descritos em [reservations_availability.md](reservations_availability.md).

O fluxo público de reservas conecta as fronteiras existentes: página do veículo → Server Action de consulta → `/reserva` com parâmetros revalidados → formulário próprio → Server Action de submissão → caso de uso atômico. O contexto da operação é gerado/vinculado no servidor e permanece estável nos retries do formulário. `LeadFields` compartilha apresentação e contratos de validação com o interesse, mantendo as actions e semânticas separadas. Ver [fluxo público](reservations_availability.md#fluxo-público-de-solicitação).

O [onboarding da locadora](tenant_onboarding.md) reutiliza Auth SSR e Data API. A RPC pública invoker delega à função privada 0011 para criar organização, owner e recibo atomicamente. Rotas `/admin/cadastro`, `/admin/confirmar`, `/admin/onboarding` e `/admin/pronto` compartilham proxy e cookies com a Central.
