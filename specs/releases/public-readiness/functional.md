# Release: public-readiness

## Objetivo

Preparar o MVP para receber manifestações de interesse de pessoas reais com proteção contra abuso, informação clara sobre o tratamento dos dados, configuração segura e atendimento humano responsável. Um lead representa uma pessoa que demonstrou interesse; não representa reserva, aprovação, contrato, locação ou cliente confirmado.

## Fluxo público obrigatório

1. A pessoa consulta um veículo cuja disponibilidade foi confirmada pelo banco.
2. Antes do envio, ela pode conhecer a finalidade da coleta, o controlador, o canal de privacidade e o prazo aplicável.
3. O formulário preserva a coleta inicial enxuta e valida os dados no servidor.
4. Honeypot e Cloudflare Turnstile com validação server-side protegem o envio. Falha obrigatória da proteção encerra o fluxo com segurança.
5. O lead é persistido antes de qualquer continuidade do atendimento.
6. Após o sucesso da persistência, a pessoa pode continuar pelo WhatsApp comercial oficial da locadora.
7. A equipe humana qualifica o interesse e conduz eventual fechamento pelo canal oficial, com tratamento inicial em até um dia útil.

O WhatsApp é o principal canal operacional inicial, mas esta release não integra WhatsApp Business API, bot, agente ou automação. O link só pode usar o número oficial fornecido pela locadora e não substitui a persistência do lead.

## Dados, reenvios e retenção

- O formulário não coleta CPF, RG, número ou foto da CNH, comprovante de residência, antecedentes, anexos, dados bancários ou dados de cartão.
- Documentos adicionais pertencem à etapa posterior de fechamento, quando forem realmente necessários.
- Retry técnico ou duplo envio da mesma operação cria no máximo um lead e devolve resultado coerente.
- Uma nova manifestação deliberada posterior pode criar outro lead.
- Telefone ou e-mail, isoladamente, não identificam duplicidade no MVP.
- Lead que não evolui para locação é mantido por 90 dias e depois eliminado por procedimento controlado. Um procedimento manual documentado é aceitável neste MVP.
- Quando o lead evolui para relação contratual, deixa o ciclo de retenção de lead e passa às regras próprias dessa relação.

## Privacidade e operação

A locadora que recebe e decide o uso dos leads é a controladora. Improve ou o desenvolvedor pode atuar como operador ao tratar dados em nome da locadora. O nome jurídico do controlador e o canal oficial de privacidade devem estar publicados antes do primeiro usuário real; nenhum dado de identidade ou contato deve ser inventado.

O canal oficial pode ser o WhatsApp comercial se a locadora aceitar e tratar por ele solicitações relacionadas a dados. A operação deve definir responsável e substituto, acesso administrativo separado da runtime pública e procedimento para revisão, contato, correção, eliminação e encerramento do tratamento.

## Definição observável de pronto

O MVP está apto ao uso público somente quando:

- os gates de [open-questions.md](open-questions.md) estiverem resolvidos e registrados;
- privacidade, retenção, idempotência e Turnstile estiverem implementados e testados;
- o WhatsApp oficial aparecer somente depois de um lead persistido com sucesso;
- a configuração de produção preservar o contrato de segurança existente;
- o runbook humano estiver praticável;
- um smoke test público sintético comprovar catálogo, envio, persistência e recusa de leitura de leads pela runtime.

## Fora desta release

n8n, WhatsApp Business API, automações de WhatsApp, bots, agentes de atendimento, portal ou login, painel administrativo complexo, pagamentos, contratos digitais, SEO, Google Business, estratégia de aquisição e automações comerciais ficam para releases próprias após validação do MVP público.

Um portal futuro poderá permitir que a pessoa visualize ou atualize dados, acompanhe interesses e locações e faça solicitações sobre seus dados. Uma futura exclusão de conta não implica apagar automaticamente registros sujeitos a obrigação legítima de conservação.

As regras comerciais e os limites atuais permanecem em [product.md](../../../docs/product.md); o contrato técnico está em [technical.md](technical.md).
