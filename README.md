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
npm install
cp .env.example .env
```

O arquivo `.env.example` contém apenas valores demonstrativos. Defina uma senha local no arquivo `.env` antes de iniciar o banco. O `.env` real não é versionado.

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

Inicie a aplicação:

```bash
npm run dev
```

A aplicação ficará disponível em `http://localhost:3000`.

## Validações

As principais verificações do projeto podem ser executadas com:

```bash
npm run typecheck
npm run lint
npm test
npm run test:postgresql
npm run build
```

Os testes de integração PostgreSQL utilizam um banco separado terminado em `_test`. A configuração recusa hosts remotos, destino igual ao banco principal e outras combinações consideradas inseguras para o ambiente de teste.

## Integração contínua

Pull Requests direcionados à `main` executam automaticamente typecheck, lint, testes unitários, testes de integração PostgreSQL e build.

O workflow utiliza PostgreSQL 17 efêmero e credenciais sintéticas. Ele não acessa banco remoto e não realiza deploy.

## Banco remoto

O desenvolvimento continua utilizando PostgreSQL em Docker. Existe uma fundação preparada para utilização futura do Supabase como PostgreSQL hospedado, mantendo credenciais de migration e runtime separadas.

Os arquivos `.env.supabase.example` e `.env.supabase.runtime.example` contêm somente exemplos fictícios. Credenciais reais permanecem fora do Git.

Nenhuma migration remota é necessária para executar ou avaliar o projeto localmente.

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

O próximo ciclo do projeto inclui a evolução da persistência dos veículos na interface, autenticação e painel administrativo. Uma eventual publicação comercial também exigirá proteção distribuída contra abuso, CAPTCHA, revisão da política de privacidade e configuração definitiva do ambiente remoto.

## Autor

Wallancy Raniery
