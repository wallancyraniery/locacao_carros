# Locação de carros

Fundação de uma plataforma web responsiva para apresentar veículos destinados a motoristas de aplicativo em São José dos Campos. Neste checkpoint, a interface é estática e utiliza dados demonstrativos.

## Estado atual

A página inicial apresenta quatro veículos, seus estados, valores semanais e uma explicação do fluxo de interesse. Não há backend, autenticação, envio de formulários ou integração externa.

## Tecnologias

Next.js (App Router), React, TypeScript estrito, Tailwind CSS, ESLint, Vitest e Testing Library.

## Execução

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`. Demais verificações:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Estrutura

- `src/app`: entrada e metadados da aplicação
- `src/components`: componentes compartilhados futuros
- `src/config`: configurações de produto futuras
- `src/modules/marketing`: composição da página inicial
- `src/modules/vehicles`: dados, regras de apresentação e componentes de veículos
- `src/styles`: tokens e estilos globais
- `src/types`: contratos TypeScript
- `tests`: testes automatizados
- `public`: ativos públicos futuros

## Dados demonstrativos

Os veículos, estados e valores apresentados nesta versão são demonstrativos e estão sujeitos à confirmação. A interface não deve ser interpretada como uma proposta comercial ou disponibilidade real.

## Próximas etapas planejadas

Após validação do produto: definição da identidade visual, fotografias próprias da frota, persistência de dados, autenticação, fluxo administrativo, análise de integrações e recursos de aplicação instalável.

Responsável pelo desenvolvimento: Wallancy Raniery.
