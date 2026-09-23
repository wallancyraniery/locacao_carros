# Testes e comprovação

## Camadas de validação

- `npm test`: testes unitários, componentes, validação, configuração, scripts e contratos locais.
- `npm run test:postgresql`: integração contra banco local exclusivo terminado em `_test`; a configuração recusa hosts remotos e destinos compartilhados.
- `npm run typecheck`: geração de tipos do Next e verificação TypeScript.
- `npm run lint`: análise estática.
- `npm run build`: build de produção.
- `git diff --check`: whitespace e conflitos de patch.

A integração contínua executa typecheck, lint, testes unitários, migrations e testes PostgreSQL em ambiente efêmero, além do build. Ela não acessa Supabase e não faz deploy.

O checkpoint de Reservas e Disponibilidade é comprovado em `tests/postgresql/reservations.integration.test.ts`: intervalos finitos e semiabertos, pendências sobrepostas, conflitos/adjacência, aprovação atômica, duas transações concorrentes, FKs multilocadora, RLS e grants, cancelamento/liberação, integridade da agenda e retry da outbox, evento requested atômico, cancelamento idempotente e concorrência sobre o mesmo ID. A suíte de retenção verifica preservação por vínculos existentes, posteriores ao preview e confirmados durante a espera por lock. Aplique a migration 0007 somente no banco local de testes com `npm run db:migrate:test` para essa validação. A suíte não envia notificações nem acessa Supabase.

O checkpoint de estado operacional acrescenta testes da migration 0008 em banco local isolado, incluindo backfill permitido e recusa dos estados legados ambíguos. A suíte de reservas cobre veículo inativo, preservação do estado estrutural e as duas ordens da concorrência aprovação × inativação.

## Supabase e fluxo real

`npm run db:check:supabase:runtime` é um diagnóstico remoto somente leitura. Ele verifica a credencial runtime exclusiva, Transaction Pooler 6543, TLS, identidade, ausência de privilégios e ownership, membership esperado, grants, policies, consulta de veículo, recusa de leitura de leads e fechamento da conexão.

Esse diagnóstico não prova o formulário. `availableVehicleObserved=true` comprova apenas que a runtime observou um veículo. A prova funcional requer uma submissão sintética explicitamente autorizada pelo fluxo real:

```text
navegador → Server Action → Zod → caso de uso → repository → banco runtime
```

Use `npm run dev:supabase` somente com a configuração runtime privada já provisionada. Um E2E remoto deve usar marcador único e dados sintéticos, limitar-se à escrita autorizada, observar a resposta da interface e ser seguido por conferência administrativa somente leitura e nova verificação de que a runtime continua sem `SELECT` em `rental_leads`. Não repita uma submissão sem nova autorização.

Consulte [runtime_database_access.md](runtime_database_access.md) para o contrato e a evidência detalhada da homologação já realizada.

## Critério antes de concluir ou commitar

Escolha verificações proporcionais ao risco:

1. rode os testes diretamente relacionados aos arquivos alterados;
2. para mudanças de código, rode typecheck, lint e `git diff --check`;
3. inclua a suíte completa, integração PostgreSQL e build quando o fluxo, schema, repository, ambiente ou comportamento de produção forem afetados;
4. para documentação pura, revise links e comandos e rode `git diff --check`; execute testes documentais existentes, se houver;
5. não declare operação remota comprovada a partir de teste local ou diagnóstico somente leitura.

A submissão atômica é coberta por `tests/reservation_submission.test.ts` e `tests/postgresql/reservation_submission.integration.test.ts`: validação, fail-closed, repository real sob runtime, contagens 1/1/1 sem agenda, retries sequenciais/concorrentes, lead preexistente, conflitos de operação, elegibilidade e período, adjacência, rollback em falha de solicitação/outbox e ausência do evento, privilégios e recusa de anon/authenticated. Aplicar 0000–0010 em banco local exclusivo `_test` antes da integração. Não executar essas fixtures no Supabase.

O checkpoint público acrescenta as suítes `public_reservation_actions`, `public_reservation_components` e `public_reservation_page`, cobrindo datas civis, revalidação de querystring, consulta sem escrita, loading, resultados do submit, preservação dos dados/período e contexto estável gerado pelo servidor. Os testes existentes do `/interesse` continuam obrigatórios após a extração de `LeadFields`. A verificação visual deve usar somente runtime restrita e fixtures sintéticas locais, sem adicionar infraestrutura E2E ou acessar Supabase.

Na verificação local deste checkpoint, o navegador percorreu veículo → consulta → `/reserva` → submit com a role `lead_intake_runtime`: a consulta deixou contagens 0/0/0; um bloqueio sintético criado depois da consulta produziu `unavailable` sem persistência parcial e permitiu voltar com as datas preservadas; um novo período produziu 1 lead, 1 solicitação, 1 evento e 0 blocos de reserva. A confirmação e a seleção de datas foram inspecionadas em 390 px sem overflow horizontal ou erros do navegador. A fixture e a credencial temporária foram removidas após a verificação, sem novos grants. Isso não comprova homologação remota nem o widget Cloudflare em produção: a proteção local sintética foi usada somente no teste local.

O onboarding é coberto por `tenant_onboarding.test.ts`, `tenant_onboarding_rendering.test.tsx` e `postgresql/tenant_onboarding.integration.test.ts`: signup/confirmação simulados, roteamento, identidade não fornecida pelo formulário, criação/rollback, concorrência e isolamento com roles reais locais. Aplique também 0011 somente no banco local de testes antes da integração.

O checkpoint [Central/frota](tenant_dashboard_fleet.md) acrescenta central_access, fleet, fleet_rendering e postgresql/fleet.integration: autorização, RLS, validação, grants mínimos, idempotência e UI. Aplique também 0012 somente no banco local _test antes da integração.

A vitrine por slug é coberta por storefront, storefront_client, storefront_publication e postgresql/storefront.integration: projeção pública, draft/published/despublicação, owner/member, isolamento, filtros de exposição, permissões e estados de renderização. Aplique 0013 somente no banco local _test para integração.
