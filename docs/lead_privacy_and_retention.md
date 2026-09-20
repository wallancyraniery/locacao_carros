# Privacidade e retenção de leads

## Aviso público e gate de publicação

O formulário coleta somente nome, telefone, e-mail opcional, cidade, finalidade de uso, declarações sobre CNH definitiva e EAR, aplicativo opcional e período de contato opcional. Ele não solicita documentos, identificadores civis, antecedentes, anexos ou dados financeiros.

O aviso informa a finalidade de analisar a manifestação e realizar contato, além da retenção de 90 dias contados da criação do lead (`created_at`), sem reinício por contato ou atualização. Ao completar 90 dias, o registro entra no procedimento administrativo de eliminação; não há exclusão automática. `converted` representa a saída desse ciclo por estado; aprovação ou contato, isoladamente, ainda não representam relação contratual. A exclusão de `converted` deste procedimento não autoriza conservação ilimitada: as regras para a relação contratual ainda dependem de definição do controlador. Antes da execução, o responsável deve conferir se as conversões estão registradas corretamente.

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

Antes de qualquer exclusão, o comando valida projeto, banco, histórico exato de migrations, estrutura necessária e ausência de `SELECT`/`DELETE` para a runtime. Cada execução recalcula sua prévia interna; uma prévia de outro comando não congela o conjunto futuro. A prévia exclui leads com qualquer vínculo em `reservation_requests` ou `waitlist_entries`, independentemente do estado dessas entidades. A política provisória é preservar o lead havendo vínculo operacional. Os IDs autorizados permanecem somente em memória, sem saída pública. A transação READ COMMITTED bloqueia esses leads com FOR UPDATE e reconsulta as dependências em uma instrução posterior ao lock: vínculos novos preservam seus leads e históricos sem impedir a exclusão dos demais. O resultado `preservedLinked` conta somente candidatos da prévia preservados por novos vínculos. O procedimento elimina primeiro o histórico dos realmente removíveis e depois os próprios leads, revalidando a ausência de vínculos no DELETE. Candidatos novos fora da prévia, mudanças de elegibilidade por idade/status ou dependências desconhecidas continuam causando recusa/rollback. Não há CASCADE, SET NULL ou anonimização automática. Repetir o processo sem novos candidatos não altera nada.

A evidência permitida é o JSON sanitizado de contagens e validações. Não registre IDs de leads, nomes, telefones, e-mails, URL de conexão, senha, CA ou conteúdo de `.env`. A execução remota exige autorização explícita e não faz parte do PR-002 local.

A preservação operacional não define conservação ilimitada: prazo e tratamento do histórico de reservas/fila ainda precisam de decisão do controlador. O adaptador local passa a exigir a estrutura da migration 0007. O launcher remoto mantém seu gate anterior de migrations e não foi habilitado nem executado neste checkpoint.
