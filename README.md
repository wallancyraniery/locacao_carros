# Locação de carros

Plataforma web responsiva para apresentar veículos destinados a motoristas de aplicativo em São José dos Campos. A versão atual combina a apresentação estática com uma fundação PostgreSQL portátil; os dados da interface continuam demonstrativos e ainda não são lidos do banco.

## Tecnologias

Next.js com App Router, React, TypeScript estrito, Tailwind CSS, PostgreSQL 17, Docker Compose, Drizzle ORM, Zod, Vitest e Testing Library.

## Pré-requisitos

- Node.js 22 ou superior e npm
- Docker com Docker Compose
- Porta TCP local `5433` disponível

## Instalação

```bash
npm install
cp .env.example .env
```

Edite `.env` e defina uma senha exclusivamente local. O arquivo é ignorado pelo Git. `DATABASE_URL` fica reservada para a aplicação; `MIGRATION_DATABASE_URL` é usada somente pelo Drizzle Kit e pelas migrations.

`POSTGRES_PORT=5433` configura exclusivamente a infraestrutura Docker local. O PostgreSQL continua escutando na porta `5432` dentro do container; somente a publicação em `127.0.0.1` utiliza `5433`, evitando conflito com outros serviços locais.

## PostgreSQL local

Inicie o serviço:

```bash
docker compose up -d database
docker compose ps
docker compose exec database sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Crie o banco separado para testes de forma idempotente, sem apagar o banco de desenvolvimento:

```bash
docker compose exec database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT 1 FROM pg_database WHERE datname='"'"'${POSTGRES_DB}_test'"'"'" | grep -q 1 || createdb -U "$POSTGRES_USER" "${POSTGRES_DB}_test"'
```

O comando consulta primeiro o catálogo do PostgreSQL. Se o banco já existir, ele não executa `createdb` novamente e preserva a estrutura e os dados existentes.

O host publicado pelo Compose é limitado a `127.0.0.1`. Para encerrar sem apagar os dados:

```bash
docker compose down
```

Para remover também o volume:

```bash
docker compose down --volumes
```

**Atenção:** o último comando apaga permanentemente todos os dados locais mantidos no volume.

## Migrations

Os scripts usam o suporte nativo do Node.js para carregar `.env`, sem dependência adicional:

```bash
npm run db:generate
npm run db:migrate
npm run db:migrate:test
```

`db:migrate` usa somente `MIGRATION_DATABASE_URL`. `db:migrate:test` usa uma configuração independente que valida e usa somente `TEST_DATABASE_URL` como destino, sem alterar variáveis ou gerar arquivos. Antes de conectar, o comando exige host local explícito, nome terminado em `_test` e banco diferente dos destinos da aplicação e das migrations normais.

Revise sempre o SQL gerado em `drizzle/` antes de aplicá-lo. Os dois comandos de aplicação são idempotentes: o Drizzle registra as migrations já executadas e não reaplica a mesma migration.

## Supabase remoto

O PostgreSQL em Docker continua sendo o ambiente principal de desenvolvimento. O Supabase é um destino PostgreSQL remoto futuro e utiliza exatamente as mesmas migrations versionadas; não existe um schema alternativo específico do provedor.

Para preparar manualmente as ferramentas remotas, copie `.env.supabase.example` para `.env.supabase.local` e preencha o arquivo somente em sua máquina. Para migrations, são necessárias apenas `SUPABASE_PROJECT_REF`, `SUPABASE_MIGRATION_DATABASE_URL` e `SUPABASE_REMOTE_MIGRATION_CONFIRMATION`; as chaves da API não são lidas nem validadas. `drizzle.supabase.config.ts` usa exclusivamente os valores desse arquivo e ignora variáveis homônimas presentes em `process.env`, uma precedência intencional para reduzir o risco de aplicar migrations no projeto errado. Obtenha os dados necessários diretamente no painel do projeto, sem colocá-los em commits, relatórios ou mensagens. O arquivo local é ignorado pelo Git e não é carregado pela aplicação ou pelos comandos locais normais.

Para migrations remotas é obrigatório usar o **Session pooler na porta 5432**, com banco `postgres`, SSL e usuário associado ao mesmo project ref. O Transaction pooler na porta 6543 é voltado a outro perfil de conexão e é recusado pelo fluxo de migrations, assim como localhost e a conexão direta `db.<project_ref>.supabase.co`.

O arquivo local deve conter uma confirmação deliberada no formato `locacao_carros:<project_ref>`. Mesmo com essa confirmação, execute o comando abaixo somente após revisar o destino e receber autorização explícita:

```bash
npm run db:migrate:supabase
```

`SUPABASE_SECRET_KEY` é confidencial, fica reservada ao futuro adapter remoto da aplicação e não precisa ser preenchida até ele ser implementado. O contrato público rejeita explicitamente essa variável, que nunca pode ser exposta ao navegador, usada com prefixo `NEXT_PUBLIC` ou registrada em logs. Neste checkpoint nenhuma migration remota foi executada e o formulário continua conectado exclusivamente ao PostgreSQL local.

## Desenvolvimento e validações

Sincronize explicitamente a organização interna e os quatro veículos demonstrativos no banco local:

```bash
npm run db:seed:development
```

O seed não é executado por build, migration ou inicialização. Ele aceita somente o host local e o banco indicado por `POSTGRES_DB`, utiliza UUIDs determinísticos e pode ser repetido sem duplicar registros. Não cria interessados fictícios nem apaga dados existentes.

```bash
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

A aplicação fica disponível em `http://localhost:3000`.

Para testar o fluxo, abra a página inicial, escolha “Tenho interesse” em um veículo disponível, preencha dados fictícios e confirme o envio. A validação ocorre no servidor e somente o servidor define a organização, o veículo e o estado inicial `new`.

Os testes PostgreSQL são separados dos testes rápidos e exigem `TEST_DATABASE_URL` apontando para `localhost`, `127.0.0.1` ou `::1`, com nome de banco terminado em `_test`:

```bash
npm run db:migrate:test
npm run test:postgresql
```

Tanto a migration de testes quanto o executor de integração recusam URL ausente, protocolo incorreto, host remoto, banco sem o sufixo `_test`, mesmo nome do banco principal e URL igual a `DATABASE_URL` ou `MIGRATION_DATABASE_URL`. Nenhum desses comandos cria, apaga ou recria bancos, e nenhum imprime a URL completa ou suas credenciais.

## Estrutura principal

- `compose.yaml`: PostgreSQL local e volume persistente
- `drizzle.config.ts`: configuração portátil do Drizzle Kit
- `drizzle.test.config.ts`: destino protegido e exclusivo das migrations de testes
- `drizzle.supabase.config.ts`: destino remoto isolado, carregado somente pelo comando explícito
- `drizzle/`: migrations SQL versionadas e metadados gerados
- `src/config`: validação segura das variáveis de banco
- `src/modules/database/schema`: enums, tabelas, constraints e índices
- `src/modules/marketing`: apresentação visual
- `src/modules/vehicles`: dados demonstrativos e componentes de veículos
- `tests`: testes rápidos
- `tests/postgresql`: testes de integração exclusivos do banco local

## Decisões de modelagem

Identificadores usam UUID gerado pelo PostgreSQL, valores monetários usam inteiros em centavos e datas persistidas usam `timestamptz`. As entidades operacionais carregam `organization_id`, preparando isolamento multilocadora sem antecipar abstrações desnecessárias. Exclusões que poderiam remover histórico são restringidas.

## Limites atuais

Não há conexão com banco hospedado, autenticação, membros de organização, RLS, armazenamento de arquivos, pagamentos ou painel administrativo. Essas decisões ficam para etapas futuras, após definição da autenticação. Os veículos e valores permanecem demonstrativos.

O formulário possui honeypot contra bots simples, mas **não deve ser disponibilizado publicamente** antes da implementação de rate limiting distribuído e CAPTCHA. Essas proteções, além de uma política de privacidade validada, são obrigatórias antes de uma publicação pública.

Responsável pelo desenvolvimento: Wallancy Raniery.
