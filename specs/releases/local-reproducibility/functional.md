# Release: local-reproducibility

## Objetivo

Uma pessoa deve conseguir clonar o projeto e executar uma demonstração local funcional usando apenas Node.js, npm, Docker e dados sintéticos versionados. O processo não pode depender de credenciais, serviços ou dados do Supabase.

## Fluxo mínimo de bootstrap

1. instalar as dependências;
2. criar a configuração local a partir do arquivo de exemplo e definir a senha local;
3. iniciar o PostgreSQL local com Docker Compose;
4. aplicar as migrations versionadas;
5. carregar a fixture de desenvolvimento local;
6. iniciar a aplicação com o provider local.

Os comandos documentados devem funcionar na ordem apresentada em um clone limpo, sem etapas implícitas. Uma falha de configuração ou pré-requisito deve encerrar o processo com mensagem objetiva e sem expor credenciais.

## Sucesso observável

A release estará funcionalmente concluída quando, partindo de um banco local vazio:

- todas as migrations forem aplicadas;
- a fixture sintética for carregada com sucesso;
- repetir o carregamento não criar organizações ou veículos duplicados;
- a aplicação iniciar localmente;
- o catálogo refletir a disponibilidade persistida da fixture e permitir interesse somente nos veículos definidos como disponíveis;
- nenhuma conexão remota for necessária ou aceita pelo seed.

## Fixture local canônica

A fixture persistida local contém somente estes veículos sintéticos:

- Ford Fiesta, ID `20000000-0000-4000-8000-000000000003`, ano 2019 e status `available`;
- Chevrolet Onix, ID `20000000-0000-4000-8000-000000000004`, ano 2022 e status `available`.

O Fiat Uno Vivace e o Renault Clio podem continuar no catálogo editorial, mas não integram a fixture persistida enquanto seus anos forem desconhecidos. A presença no catálogo editorial e a disponibilidade confirmada pelo banco são conceitos separados. O status `available` dos dois veículos da fixture é um estado sintético autorizado somente para reprodução local.

A decisão que definiu esse contrato está registrada em [open-questions.md](open-questions.md). Regras de produto e limites do formulário permanecem os descritos em [product.md](../../../docs/product.md).
