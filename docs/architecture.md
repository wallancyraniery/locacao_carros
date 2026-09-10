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

## Decisões estáveis

- Dados do formulário passam pelo servidor; a aplicação não usa credencial administrativa.
- UUIDs do lead e da operação são gerados pelo servidor, dinheiro é armazenado em centavos e datas usam `timestamptz`.
- A identidade opaca da operação permanece estável em retry técnico e possui unicidade no PostgreSQL; uma nova visita recebe outra identidade, sem deduplicação por telefone ou e-mail.
- O INSERT de leads enumera somente as colunas concedidas à runtime e não depende de `RETURNING`.
- A análise após o interesse permanece humana; o sistema ainda não é uma plataforma completa de reservas.
- Migrations aplicadas são imutáveis; mudanças de schema entram em nova migration.
- A separação por módulos, o repository e as fronteiras de ambiente só devem mudar diante de benefício técnico concreto e validado.

O contrato detalhado de acesso remoto está em [runtime_database_access.md](runtime_database_access.md).
