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
