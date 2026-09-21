# Reservas e Disponibilidade — checkpoint 1

O produto começa a evoluir de manifestação de interesse para solicitação real de reserva. Este checkpoint entrega **somente o núcleo PostgreSQL e seu schema Drizzle**, validado localmente. Não há tela, endpoint, Server Action, worker ou envio de notificação para reservas. O formulário público continua criando exclusivamente um lead, sem reservar ou prometer disponibilidade.

## Modelo e semântica

| Tabela | Responsabilidade |
| --- | --- |
| `reservation_requests` | Organização, veículo e lead obrigatórios, datas desejadas, notas limitadas, decisão humana e autoria/timestamps. Estados `requested`, `approved`, `rejected`, `cancelled`. |
| `vehicle_schedule_blocks` | Fonte de verdade da indisponibilidade por período. Blocos `active` ou `released`, com origem `reservation`, `maintenance`, `preparation` ou `manual`. |
| `waitlist_entries` | Organização e lead, veículo específico **ou** preferência textual, período e estado `waiting`, `notified` ou `cancelled`. Não promove nem reserva automaticamente. |
| `notification_outbox` | Evento durável com UUID, referência à solicitação e estados `pending`, `processing`, `failed`, `sent`; tentativas, próxima execução, início de processamento, envio e código de falha restrito. |

Datas de retirada/devolução usam PostgreSQL `date` e strings ISO no Drizzle. O intervalo é semiaberto `[pickup_date, return_date)`, finito, com retirada estritamente anterior à devolução. Uma devolução em 15/01 permite outra retirada em 15/01. Horário, fuso e tempo de preparação implícito não fazem parte da V1; preparação ocupa seu próprio bloco explícito.

`requested` e lista de espera não bloqueiam períodos, mesmo quando sobrepostos entre si ou a um bloco existente. Somente blocos `active` tornam o período indisponível. O estado estrutural é `vehicles.operational_status = active | inactive`; a coluna `vehicles.status` permanece temporariamente como compatibilidade legada. Reserva aprovada, manutenção com período, preparação e bloqueio manual pertencem à agenda e não alteram o estado estrutural.

## Garantias do banco

- A migration `0007_reservations_availability.sql` acrescenta `btree_gist` e a exclusion constraint `vehicle_schedule_blocks_no_active_overlap`, combinando igualdade de `vehicle_id` com sobreposição de `daterange(..., '[)')`, apenas para blocos ativos. Vale também para transações concorrentes; conflito retorna SQLSTATE `23P01`.
- FKs compostas `(organization_id, vehicle_id)`, `(organization_id, lead_id)` e `(organization_id, reservation_request_id)` impedem referências cruzadas entre locadoras. As chaves únicas compostas das tabelas existentes são aditivas; não há reescrita de migrations anteriores.
- Toda solicitação começa `requested` e cria atomicamente um único evento `reservation.requested` em `pending`. Se o INSERT na outbox falhar, a solicitação também é revertida. Transições: `requested → approved | rejected | cancelled` e `approved → cancelled`. Rejeição exige motivo. Aprovação/rejeição exigem `decided_by`; cancelamento exige `cancelled_by`. Timestamps de transição são produzidos pelo banco. Repetir o mesmo estado com os mesmos dados não duplica efeitos.
- Aprovar cria exatamente um bloco correspondente e um evento na outbox, na mesma transação. Se a agenda conflitar, a decisão e o evento também sofrem rollback. Cancelar libera somente o bloco daquela solicitação e preserva a decisão original e o bloco como histórico. Enquanto a solicitação cancelada anteriormente aprovada existir (`decided_at` preenchido), seu bloco `released` é obrigatório e não pode ser apagado diretamente. Cancelamento direto de `requested` não exige bloco. Repetir cancelamento mantém o mesmo bloco e `released_at`, sem novo evento; apenas `updated_at` da solicitação é atualizado.
- Aprovação exige veículo estruturalmente `active` e bloqueia sua linha durante a decisão. Inativação anterior faz a aprovação falhar; inativação posterior aguarda a aprovação e não cancela nem libera automaticamente reservas ou blocos já criados.
- Identidade, organização, veículo, interessado e datas de uma solicitação são imutáveis. Alterar o período exige cancelar e criar nova solicitação; não há reagendamento nesta entrega. Blocos também não mudam de identidade/período e não são reativados após liberação.
- Constraint triggers diferidos verificam a correspondência exata entre reserva e agenda ao fim da transação. Escrita direta não pode liberar/apagar o bloco de uma reserva ainda aprovada, ligar bloco a uma solicitação pendente ou usar veículo/período divergente.
- As quatro tabelas têm RLS habilitado, sem policies ou grants para `PUBLIC`, `anon`, `authenticated` e `lead_intake_runtime`. Portanto, o checkpoint não disponibiliza operações à aplicação, nem mesmo para membros da Central. As funções de trigger são `SECURITY INVOKER`, têm `search_path` fixo e execução direta revogada para essas roles. Não existe fallback administrativo no runtime.

O SQL manual da migration contém a exclusion constraint e os triggers, que não são representados pelo gerador Drizzle. Preservar esse SQL em futuras evoluções; gerar snapshot não substitui os testes PostgreSQL. A migration segue o histórico Drizzle deste repositório.

## Outbox e processamento futuro

A transação da reserva persiste a **intenção** de notificar; não chama provedor externo. Falha ao persistir a outbox desfaz a transação, evitando aprovações sem evento. Falha de entrega posterior altera somente a outbox e não desfaz reserva ou agenda.

A combinação `(reservation_request_id, event_type)` é única. O UUID do evento deve ser a chave de idempotência do futuro provedor. O processamento futuro deverá reclamar eventos com locking (`FOR UPDATE SKIP LOCKED`), incrementar tentativas, controlar backoff em `available_at`, recuperar leases abandonados por `locked_at` e registrar `sent_at`. Esses campos preparam o contrato; **não há executor ou garantia de entrega exatamente uma vez** neste checkpoint. Cancelamento não apaga eventos anteriores: o futuro worker precisa tratar ordenação e eventos que ficaram obsoletos.

Não são copiados telefone, e-mail, documentos ou respostas brutas do provedor para eventos. `last_error_code` aceita somente `provider_unavailable`, `rate_limited`, `delivery_rejected`, `unknown`. Notas e motivos não devem receber documentos ou dados financeiros.

## Revisão antes de habilitar uso

- Definir a role operacional e autorização por organização/ação antes de conectar a aplicação. `decided_by` e `cancelled_by` são UUIDs de auditoria fornecidos pelo operador confiável neste núcleo fechado; não autenticam o usuário nem validam sua associação. O próximo fluxo deverá derivá-los de identidade validada, sem credencial administrativa.
- Revisar comercialmente datas adjacentes, cancelamento, reagendamento, preferência na fila e condições da decisão. Não foram inventados preços, pagamentos, contratos ou garantias comerciais.
- Política provisória de retenção: qualquer vínculo com reserva ou lista de espera preserva o lead, inclusive em estados finais. Preview e exclusão omitem esses leads. A execução bloqueia os IDs autorizados pela prévia e reconsulta vínculos em uma nova instrução sob READ COMMITTED, preservando também vínculos confirmados durante a espera pelo lock. `preservedLinked` conta candidatos da prévia preservados por vínculo novo; os demais elegíveis são removidos. Novos candidatos fora da prévia continuam causando recusa. Não há CASCADE, SET NULL ou anonimização automática. Definir prazo e procedimento futuro para o histórico operacional antes de dados reais.
- Revisar instalação de `btree_gist`, grants herdados, custo das chaves únicas e locks da migration no destino futuramente autorizado. Nenhuma migration remota ou deploy faz parte desta entrega.

## Evidência local

`tests/postgresql/reservations.integration.test.ts` exercita datas válidas/inválidas, pendências sobrepostas, aprovação, conflitos de todas as origens, intervalos adjacentes, concorrência em duas conexões, FKs multilocadora, RLS fechado, cancelamento/liberação, proteção contra corrupção direta, rollback, evento inicial atômico, lista de espera, retry de notificação, cancelamento repetido e concorrência sobre o mesmo ID. `tests/postgresql/lead_retention.integration.test.ts` também cobre o lote A/B/C, vínculos criados após preview e vínculos confirmados enquanto a retenção aguarda o lock. Executar após `npm run db:migrate:test`, exclusivamente no banco local `_test` protegido pela configuração existente. A revisão da 0007 foi validada reaplicando a cadeia completa em `locacao_reservations_core_v2_test`, com TEST_DATABASE_URL sobrescrita apenas no processo. Um banco local que já registrou a versão anterior da 0007 não recebe a revisão automaticamente: validar esta migration ainda não publicada em outro banco de testes limpo, sem adulterar seu histórico anterior.

Referências: [ranges e exclusion constraints no PostgreSQL 17](https://www.postgresql.org/docs/17/rangetypes.html#RANGETYPES-CONSTRAINT), [btree_gist](https://www.postgresql.org/docs/17/btree-gist.html) e [RLS no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).
