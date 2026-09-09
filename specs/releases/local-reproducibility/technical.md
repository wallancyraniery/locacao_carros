# Contrato técnico

## Estado atual relevante

O bootstrap documentado executa migrations e depois `npm run db:seed:development`. O seed permanece exclusivo do ambiente local, usa UUIDs determinísticos e provisiona uma organização e os veículos da fixture em uma transação.

Antes do LR-002, o seed lia `src/modules/vehicles/data/demo_vehicles.json`. Dois veículos possuem `year=null` e nenhum dos quatro declara `status`, por isso o catálogo editorial não satisfazia o schema persistido. O LR-002 separou a fixture local desse catálogo, validou o schema antes da escrita e passou a recusar divergências de identidade sem correção automática.

O schema exige `vehicles.year` e `vehicles.status` não nulos, além de preço não negativo, ano entre 1900 e 2200 e vínculo com uma organização. O histórico Drizzle contém as migrations `0000` a `0003`. Migrations já aplicadas são imutáveis e esta release não deve alterá-las.

### Contrato canônico da fixture

Catálogo editorial e fixture persistida são contratos distintos. Os quatro veículos podem permanecer no catálogo editorial, mas a fixture local persiste somente:

| Veículo | ID | Ano | Status |
| --- | --- | ---: | --- |
| Ford Fiesta | `20000000-0000-4000-8000-000000000003` | 2019 | `available` |
| Chevrolet Onix | `20000000-0000-4000-8000-000000000004` | 2022 | `available` |

Os demais atributos persistidos devem corresponder aos dados já versionados do catálogo e às regras comerciais existentes. A implementação não deve inventar anos para o Fiat Uno Vivace ou o Renault Clio, nem persistir esses dois veículos enquanto os anos continuarem desconhecidos. O estado `available` é sintético e foi autorizado exclusivamente para os dois registros no ambiente local.

## Requisitos da release

### Ambiente e segurança

- `db:seed:development` deve continuar exclusivo do PostgreSQL local.
- O seed deve recusar hosts não locais, configuração incompleta e banco divergente de `POSTGRES_DB` antes de qualquer escrita.
- Credenciais Supabase, migration/admin e runtime não podem ser fallback do seed.
- O procedimento não pode alterar RLS, grants, roles, policies, TLS ou arquivos de migration.
- Logs não devem exibir URL, senha, conteúdo de `.env`, certificados ou dados privados.

### Banco limpo e migrations

- O caminho suportado começa em um banco de desenvolvimento vazio.
- As migrations versionadas devem ser aplicadas antes do seed.
- A ausência do schema esperado deve produzir falha fechada e acionável, sem tentativa de criar schema fora do migrator.
- O seed deve inserir somente a organização e os veículos sintéticos definidos no contrato da fixture.

### Catálogo, schema e idempotência

- A fixture persistível deve conter exatamente o Ford Fiesta e o Chevrolet Onix definidos neste documento.
- Ela não pode inventar ano ou disponibilidade para outro veículo editorial sem decisão explícita.
- Todos os registros enviados ao banco devem satisfazer tipos e constraints atuais.
- UUIDs determinísticos devem permitir repetição segura.
- A segunda execução deve convergir para o mesmo estado, sem duplicatas.
- Registros fora da fixture não devem ser apagados ou sobrescritos.
- Conflitos de UUID ou organização com dados incompatíveis devem falhar de forma explícita, em vez de assumir ownership silenciosamente.
- A disponibilidade carregada deve ser compatível com a regra server-side que libera CTAs apenas para veículos `demo + available` da organização demonstrativa.

## Testes necessários

- validação unitária do contrato exato dos dois veículos da fixture;
- recusa de catálogo incompleto ou divergente antes da conexão;
- recusa de URL remota e de banco local diferente do configurado;
- integração em banco local vazio após migrations;
- repetição do seed comprovando idempotência e ausência de duplicatas;
- preservação de registros não pertencentes à fixture;
- falha segura para conflito de UUID/organização;
- smoke test local comprovando que aplicação e catálogo refletem os registros persistidos;
- verificação de que nenhum teste ou comando da release acessa Supabase.

Siga [AGENTS.md](../../../AGENTS.md), [architecture.md](../../../docs/architecture.md), [security.md](../../../docs/security.md) e [testing.md](../../../docs/testing.md). O contrato remoto detalhado permanece fora do escopo desta release.
