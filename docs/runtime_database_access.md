# Acesso do runtime ao banco

O formulário usa uma conexão PostgreSQL server-side com a role `lead_intake_runtime`. A migration cria essa role como `NOLOGIN`, sem privilégios administrativos, memberships, propriedade de tabelas ou capacidade de ignorar RLS.

## Pré-requisitos da homologação

Antes de qualquer escrita remota, confirme por duas evidências independentes o identificador do projeto de homologação e interrompa o procedimento se projeto, role, ownership, memberships, grants ou policies divergirem do esperado. A migration deve usar exclusivamente a credencial administrativa de migration; o runtime deve receber outra credencial, exclusiva da role `lead_intake_runtime`.

A migration falha de forma fechada se a role preexistente possuir membros ou pertencer direta ou indiretamente a outras roles. Esse estado é considerado contaminado e exige investigação manual; memberships desconhecidos nunca devem ser revogados automaticamente apenas para permitir a aplicação.

## Provisionamento da credencial

A migration mantém a role como `NOLOGIN` e não contém senha. Somente depois de aplicar e auditar as migrations no projeto de homologação identificado, revise novamente atributos, ausência de ownership e memberships antes de habilitar o login.

Gere uma senha aleatória no gerenciador de segredos e use entrada interativa, como `\password lead_intake_runtime` em uma sessão administrativa protegida, ou mecanismo equivalente que não registre o valor em Git, argumentos de terminal, histórico do shell ou histórico do SQL Editor. Não escreva a senha diretamente em um comando salvo ou painel com histórico de consultas.

Armazene a credencial somente no gerenciador de segredos do ambiente de hosting. Nunca utilize `service_role`, `postgres` ou a credencial de migration como credencial do runtime.

O Transaction Pooler e o login remoto ainda não foram comprovados. A URL correspondente só deve ser montada no gerenciador de segredos depois da validação controlada e nunca deve ser registrada no repositório.

## Rotação e revogação

Defina responsável e periodicidade de rotação antes da homologação. A rotação deve criar o novo valor por entrada interativa, atualizar o gerenciador de segredos, reiniciar de forma controlada o runtime e invalidar o valor anterior.

Em incidente, primeiro bloqueie novas conexões com:

```sql
ALTER ROLE lead_intake_runtime NOLOGIN;
```

Em seguida, revogue a credencial no ambiente de hosting, encerre sessões quando necessário, investigue logs e só reabilite o login após nova auditoria.

## Privilégios e RLS

A role recebe somente:

- `USAGE` no schema `public`;
- `SELECT (id)` em `organizations`;
- `SELECT (id, organization_id, status, is_demo)` em `vehicles`;
- `INSERT` apenas nas colunas utilizadas pelo formulário em `rental_leads`.

`PUBLIC` não mantém privilégios nas quatro tabelas nem nas sequences pertencentes a elas. Se `PUBLIC` possuir `CREATE` no schema `public`, a migration interrompe sem alterar esse privilégio global. Não há `SELECT`, `UPDATE`, `DELETE`, `TRUNCATE` ou `REFERENCES` em `rental_leads`, nem acesso a `lead_status_history`.

Cada operação possui uma policy permissiva mínima e uma guarda `AS RESTRICTIVE`. Assim, uma policy permissiva futura não remove as condições de organização demonstrativa, veículo demonstrativo disponível e status `new`. `anon` e `authenticated` permanecem sem acesso. Não são usadas funções `SECURITY DEFINER` ou a Data API.

## FORCE ROW LEVEL SECURITY

`FORCE ROW LEVEL SECURITY` não é aplicado. A role runtime não possui `BYPASSRLS` e não é proprietária das tabelas, portanto já está sujeita às policies. Manter o proprietário fora de `FORCE RLS` preserva migrations e administração em ambientes nos quais o proprietário não possua `BYPASSRLS`.

## Identificador do lead

O UUID é gerado pelo servidor antes do insert. Isso preserva o identificador retornado pelo repository sem conceder `SELECT` sobre `rental_leads`, privilégio necessário para `INSERT ... RETURNING id`.

## Validação antes de dados reais

Com a credencial runtime no ambiente de homologação, execute diagnósticos positivos e negativos: leitura do único veículo permitido, criação de um lead sintético, recusa de leitura do lead, outra organização, outro status, update e delete. Interrompa e desabilite o login diante de qualquer acesso adicional. O ambiente não deve aceitar dados pessoais reais antes dessa validação.

Disponibilidade é verificada no momento da manifestação de interesse. O envio não reserva o veículo e a disponibilidade final depende de confirmação humana. Operação atômica e locking só serão introduzidos se o produto passar a efetuar reservas reais.
