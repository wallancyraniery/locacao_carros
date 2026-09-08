# Guia para agentes

## Propósito e prioridade

Esta aplicação apresenta veículos de uma locadora e registra manifestações iniciais de interesse. O envio não é reserva, aprovação nem garantia de disponibilidade.

Ordem de prioridade: **concluir > comprovar > polir > expandir**.

## Mapa de contexto

- Leia `docs/product.md` para escopo, regras comerciais e prioridades do MVP.
- Leia `docs/architecture.md` antes de mudar fluxos, módulos, persistência ou ambientes.
- Leia `docs/security.md` antes de trabalhar com banco, Supabase, dados ou logs.
- Leia `docs/testing.md` para escolher validações e critérios antes de concluir.
- Leia `docs/runtime_database_access.md` somente quando a tarefa envolver o contrato detalhado do runtime Supabase.

## Comandos principais

```bash
npm run dev
npm run dev:supabase
npm test
npm run test:postgresql
npm run typecheck
npm run lint
npm run build
npm run db:check:supabase:runtime
```

Use `db:seed:development` apenas no ambiente local. Consulte o `README.md` para instalação e execução.

## Regras de trabalho

- Confirme branch e `git status` antes de editar. Preserve alterações existentes e não use comandos Git destrutivos.
- Não edite migrations já aplicadas. Mudanças de schema exigem migration nova e revisão explícita.
- Nunca versione secrets, arquivos `.env` reais, URLs com credenciais, senhas ou certificados.
- Preserve RLS, grants, roles, least privilege e TLS `verify-full`, salvo causa técnica comprovada e autorização adequada.
- Separe sempre credenciais administrativas/migration da credencial runtime; nunca use a administrativa na aplicação.
- Use somente dados sintéticos em testes e homologação. Operações remotas devem ter escopo e autorização explícitos.
- Não execute `db:seed:development` no Supabase.
- Quando a missão pedir revisão antes do push, pare com o commit local pronto e não faça push.
- Execute testes proporcionais aos arquivos alterados. Antes de concluir mudanças de código, rode ao menos testes pertinentes, typecheck, lint e `git diff --check`; inclua build e integração quando afetados.
