# Locação de Carros

Aplicação web para apresentar veículos e registrar o interesse de motoristas em uma locação.

O projeto foi desenvolvido como uma aplicação prática de engenharia de software, com foco em backend, banco de dados, validação no servidor, testes e organização de ambiente. A interface ainda trabalha com dados demonstrativos, mas o fluxo de interesse já possui persistência em PostgreSQL.

## Estado atual

O projeto está em desenvolvimento e ainda não representa um serviço comercial em produção.

Hoje já existem catálogo e detalhes de veículos, formulário de interesse, validação com Zod, Server Actions, persistência com Drizzle ORM, migrations versionadas, seed de desenvolvimento, testes automatizados e integração contínua.

Ainda não foram implementados autenticação, painel administrativo, pagamentos e publicação comercial. O formulário não deve ser disponibilizado para uso público real antes da inclusão das proteções contra abuso e da política de privacidade necessárias.

## Tecnologias

| Área | Tecnologias |
| --- | --- |
| Aplicação | Next.js 16, React 19 e TypeScript |
| Banco de dados | PostgreSQL 17 e Drizzle ORM |
| Validação | Zod |
| Ambiente | Docker Compose e Linux |
| Testes | Vitest, Testing Library e testes de integração PostgreSQL |
| Qualidade | ESLint, typecheck, migrations e GitHub Actions |

## Fluxo principal

O usuário escolhe um veículo, consulta seus detalhes e envia uma manifestação de interesse.

```text
Interface
   ↓
Server Action
   ↓
Validação Zod
   ↓
Caso de uso
   ↓
Repository
   ↓
Drizzle ORM
   ↓
PostgreSQL
```

A organização, o veículo válido e o estado inicial do registro são definidos no servidor. O formulário possui um honeypot simples para reduzir envios automatizados e não coleta CPF, RG, número da CNH, documentos ou informações bancárias.

## Decisões técnicas

Os identificadores persistidos utilizam UUID. Valores monetários são armazenados em centavos e datas utilizam `timestamptz`.

O projeto separa a conexão usada pela aplicação da conexão usada pelas migrations. O ambiente de testes também possui banco próprio e inclui proteções para recusar destinos remotos ou bancos que não tenham sido configurados especificamente para teste.

Os dados de desenvolvimento usam identificadores determinísticos e podem ser sincronizados mais de uma vez sem criar registros duplicados.

## Executando localmente

É necessário ter Node.js 22 ou superior, npm e Docker com Docker Compose.

Primeiro instale as dependências e prepare o arquivo local de ambiente:

```bash
npm ci
cp .env.example .env
```

O arquivo `.env.example` contém apenas valores demonstrativos. Substitua `defina_uma_senha_local` pela mesma senha sintética em `POSTGRES_PASSWORD`, `DATABASE_URL`, `MIGRATION_DATABASE_URL` e `TEST_DATABASE_URL` antes de iniciar o banco. O `.env` real não é versionado.

Inicie o PostgreSQL:

```bash
docker compose up -d database
docker compose ps
```

Aplique as migrations:

```bash
npm run db:migrate
```

Sincronize os dados demonstrativos:

```bash
npm run db:seed:development
```

O comando pode ser repetido com segurança. A fixture local persiste somente o Ford Fiesta 2019 e o Chevrolet Onix 2022 como disponíveis. Fiat Uno Vivace e Renault Clio continuam no catálogo editorial, mas aparecem sem interesse disponível porque não possuem registros persistidos.

Inicie a aplicação:

```bash
npm run dev
```

A aplicação ficará disponível em `http://localhost:3000`.

## Validações

As principais verificações do projeto podem ser executadas com:

```bash
npm run db:seed:development
docker compose exec database sh -c 'createdb -U "$POSTGRES_USER" "${POSTGRES_DB}_test"'
npm run db:migrate:test
npm run typecheck
npm run lint
npm test
npm run test:postgresql
npm run build
```

O segundo seed comprova que a fixture não é duplicada. Em um bootstrap limpo, `createdb` prepara o banco separado terminado em `_test` usado pelos testes de integração. A configuração recusa hosts remotos, destino igual ao banco principal e outras combinações consideradas inseguras para o ambiente de teste.

## Integração contínua

Pull Requests direcionados à `main` executam automaticamente typecheck, lint, testes unitários, testes de integração PostgreSQL e build.

O workflow utiliza PostgreSQL 17 efêmero e credenciais sintéticas. Ele não acessa banco remoto e não realiza deploy.

## Banco remoto

O desenvolvimento local utiliza PostgreSQL em Docker. O fluxo de interesse também foi homologado no Supabase de testes: uma submissão sintética pelo navegador para o Ford Fiesta exibiu “Recebemos seu interesse” e persistiu exatamente um lead `new`, conferido administrativamente em modo somente leitura. Isso não representa publicação comercial ou produção.

Os arquivos `.env.supabase.example` e `.env.supabase.runtime.example` contêm somente exemplos fictícios. Credenciais reais permanecem fora do Git.

Nenhuma migration remota é necessária para executar ou avaliar o projeto localmente.

Com a credencial runtime já provisionada no arquivo privado `.env.supabase.runtime.local` (modo `0600`), inicie a homologação com:

```bash
npm run dev:supabase
```

Esse comando carrega o arquivo no launcher e passa o ambiente ao Next sem `--env-file` ou `NODE_OPTIONS` herdado. Não use `npm run dev` para testar o Supabase: o comando comum usa o ambiente local. Encerre qualquer instância anterior deste projeto antes de iniciar outra.

A fixture remota controlada contém somente a organização demonstrativa e o Ford Fiesta de UUID `20000000-0000-4000-8000-000000000003`. O comando `db:provision:supabase:lead-flow-fixture` é separado de migrations e do seed local; não precisa ser repetido para testar o formulário. Nunca execute `db:seed:development` no Supabase.

`npm run db:check:supabase:runtime` confirma acesso seguro pelo Transaction Pooler 6543, TLS com CA explícita e recusa de leitura de leads pela runtime. Seu escopo é somente leitura: observar um veículo disponível não comprova uma submissão. Consulte [o contrato de acesso e a evidência de homologação](docs/runtime_database_access.md).

## Estrutura

```text
src/
  app/
  components/
  config/
  modules/
    database/
    leads/
    marketing/
    rentals/
    vehicles/

drizzle/
tests/
scripts/
```

A organização por módulos mantém regras de negócio, infraestrutura, validação e componentes separados sempre que o fluxo exige essa divisão.

## Próximas etapas

O próximo ciclo deve preparar proteção contra abuso, privacidade e operação antes de uso público. O catálogo mantém conteúdo editorial estático, mas os CTAs de interesse já acompanham a disponibilidade consultada no banco. CAPTCHA só deve ser incluído se necessário. Autenticação, painel administrativo e pagamentos pertencem a uma fase posterior, caso o processo humano de análise passe a exigir essas funcionalidades.

## Autor

Wallancy Raniery
