# Atendimento humano de manifestações de interesse

## Continuidade opcional

A Server Action oferece o link somente quando o caso de uso confirma a persistência. O sucesso aparente do honeypot não oferece continuidade. Erros e envios inválidos também não oferecem o link.

Configure `WHATSAPP_BUSINESS_NUMBER` no ambiente do servidor somente com o número comercial fornecido pela locadora, em formato internacional: código do país e número, apenas dígitos, entre 8 e 15, sem zero inicial. A validação de formato não comprova titularidade nem existência da conta: essa confirmação é humana e permanece pendente. Ausência ou formato inválido omitem a ação sem impedir o registro do interesse.

A URL contém apenas o destinatário configurado e uma mensagem genérica fixa, sem dados ou identificadores do interessado. O clique abre o WhatsApp em outra aba; a pessoa decide enviar a mensagem. Não há envio automático nem correlação por identificador na URL. A falta de clique não invalida o interessado já registrado.

## Definições pendentes antes da operação pública

- Número comercial oficial confirmado pela locadora.
- Responsável pelo atendimento e substituto, ainda não designados.
- Mecanismo administrativo autorizado e auditável de consulta e atualização, ainda não escolhido. Este documento não supõe a existência de painel ou credenciais humanas provisionadas.
- Identidade e canal de privacidade oficiais, com aprovação do controlador; dependências operacionais de PR-002.

## Rotina a validar pelos responsáveis

1. O responsável consulta os interessados da organização pelo mecanismo administrativo autorizado e revisa os não tratados para realizar o primeiro atendimento em até um dia útil. O substituto assume em caso de ausência; a escala de revisão deve permitir cumprir esse prazo.
2. O atendimento ocorre pelo canal oficial. Como o link não transporta identificador, a associação da conversa com o interessado exige conferência humana mínima. Não presumir identidade pela mensagem genérica nem divulgar dados antes dessa conferência.
3. Após contato, registrar a transição pertinente e seu histórico no mecanismo autorizado: `new`, `contacted`, `under_review`, `approved`, `rejected` ou `converted`. Aprovação não comprova locação; `converted` só deve representar uma relação efetivamente confirmada. Registrar autoria e data, sem copiar dados pessoais para logs técnicos ou canais paralelos.
4. Para solicitações de acesso, correção ou eliminação, encaminhar ao responsável de privacidade pelo canal oficial, confirmar identidade de forma proporcional e aplicar o procedimento aprovado. Preservar coleta mínima; não solicitar documentos ou dados financeiros neste formulário inicial.
5. Antes da eliminação por retenção, conferir as conversões. A política aprovada para leads sem locação é de 90 dias; relações contratuais ficam fora desse ciclo e precisam de regras próprias aprovadas. PR-002 trata a execução administrativa da retenção separadamente.

O acesso humano é separado da runtime pública. Não conceder SELECT, UPDATE ou DELETE em `rental_leads` à `lead_intake_runtime`, nem usar credenciais administrativas na aplicação. A autorização humana deve restringir organização e operações e permitir revisão das ações realizadas.

## Contingência

Se o WhatsApp estiver indisponível, o registro já persistido permanece na fila de atendimento. O responsável ou substituto deve usar apenas uma alternativa oficial previamente aprovada; se nenhuma existir, registrar a pendência operacional, sem inventar canal. Se o acesso administrativo falhar, comunicar ao responsável técnico e restaurar o acesso autorizado sem relaxar permissões ou exportar a base para canais informais. O prazo de até um dia útil permanece a referência; sua viabilidade e a contingência precisam ser validadas pela equipe antes da publicação.

## Estado desta entrega

Privacidade e retenção seguem o [procedimento incorporado à main](lead_privacy_and_retention.md). PR-003 continua `todo` até fornecimento das definições acima e validação prática do atendimento. PR-004 e PR-005 não são executadas aqui. Consulte os [gates da release](../specs/releases/public-readiness/open-questions.md).
