# Privacidade e retenção de leads

## Aviso público e gate de publicação

O formulário coleta somente nome, telefone, e-mail opcional, cidade, finalidade de uso, declarações sobre CNH definitiva e EAR, aplicativo opcional e período de contato opcional. Ele não solicita documentos, identificadores civis, antecedentes, anexos ou dados financeiros.

O aviso informa a finalidade de analisar a manifestação e realizar contato, além da retenção de 90 dias contados da criação do lead (`created_at`), sem reinício por contato ou atualização. Ao completar 90 dias, o registro entra no procedimento administrativo de eliminação; não há exclusão automática. `converted` é o único estado que representa a saída desse ciclo; aprovação ou contato, isoladamente, ainda não representam relação contratual. A exclusão de `converted` deste procedimento não autoriza conservação ilimitada: as regras para a relação contratual ainda dependem de definição do controlador. Antes da execução, o responsável deve conferir se as conversões estão registradas corretamente.

Em desenvolvimento e testes, a interface mostra que a identidade jurídica e o canal oficial estão pendentes. Em produção, a aplicação falha antes de renderizar o formulário se estas variáveis server-side não forem válidas:

- `PRIVACY_CONTROLLER_NAME`;
- `PRIVACY_CONTACT_LABEL`;
- `PRIVACY_CONTACT_URL`.

Nenhum valor oficial deve ser inferido. O controlador precisa fornecer e aprovar a identidade e o canal antes do primeiro acesso público.

## Solicitações sobre dados

Antes da publicação, a operação deve designar responsável e substituto e registrar o canal oficial. Ao receber uma solicitação de acesso, correção ou eliminação, a pessoa responsável deve:

1. registrar a solicitação no mecanismo administrativo autorizado, sem copiar dados para canais paralelos;
2. confirmar a identidade por meio proporcional ao pedido;
3. localizar o registro usando acesso administrativo separado da aplicação pública;
4. conferir se existe relação contratual ou outra obrigação de conservação;
5. executar a correção ou eliminação cabível e responder pelo canal oficial;
6. guardar somente evidência operacional sanitizada, sem reproduzir dados pessoais em logs.

A definição das pessoas responsáveis, do canal e do mecanismo administrativo continua como gate em [open-questions.md](../specs/releases/public-readiness/open-questions.md).

## Procedimento manual de retenção

O comando administrativo nunca é iniciado pela aplicação, pelo deploy ou pelo seed. Ele usa exclusivamente a credencial de migration/admin em `.env.supabase.local`, Session Pooler 5432 e TLS com CA e verificação de identidade. A role pública `lead_intake_runtime` continua sem leitura ou exclusão de leads.

Primeiro, execute a prévia para uma organização explicitamente informada:

```bash
npm run db:retain:supabase:leads -- /caminho/para/ca.crt --organization-id=UUID_DA_ORGANIZACAO --preview
```

A saída contém somente organização, prazo e quantidade. Revise a contagem e o escopo. Para executar a eliminação, repita com confirmação explícita:

```bash
npm run db:retain:supabase:leads -- /caminho/para/ca.crt --organization-id=UUID_DA_ORGANIZACAO --execute --confirm=DELETE_EXPIRED_UNCONVERTED_LEADS
```

Antes de qualquer exclusão, o comando valida projeto, banco, histórico exato de migrations, estrutura necessária e ausência de `SELECT`/`DELETE` para a runtime. Cada execução recalcula sua prévia interna; uma prévia de outro comando não congela o conjunto futuro. A transação compara o conjunto exato da prévia interna, bloqueia novamente os candidatos, elimina primeiro o histórico associado e depois os leads com `created_at` de pelo menos 90 dias e status diferente de `converted`. Divergência concorrente causa rollback. Repetir o processo sem novos candidatos não altera nada.

A evidência permitida é o JSON sanitizado de contagens e validações. Não registre IDs de leads, nomes, telefones, e-mails, URL de conexão, senha, CA ou conteúdo de `.env`. A execução remota exige autorização explícita e não faz parte do PR-002 local.
