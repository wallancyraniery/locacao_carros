# Produto

## Problema e fluxo atual

A Locadora de Carros apresenta opções de veículos e permite que motoristas manifestem interesse inicial em uma locação de forma simples. O usuário navega pelo catálogo demonstrativo, consulta detalhes e preenche o formulário do veículo escolhido. A locadora analisa o registro e realiza o contato posteriormente.

O fluxo atual é:

1. escolher um veículo;
2. consultar detalhes e condições;
3. informar dados iniciais e requisitos de elegibilidade;
4. aceitar os avisos;
5. enviar a manifestação e aguardar análise humana.

## Regras comerciais existentes

- Os valores, caução, formas de pagamento e demais condições vêm das regras versionadas do projeto; não invente condições novas.
- Disponibilidade, aprovação e condições finais dependem de confirmação da locadora.
- O envio registra interesse. Não representa reserva, aprovação, contrato ou garantia de disponibilidade.
- A organização, o veículo válido e o status inicial `new` são definidos no servidor.
- Documentos podem ser analisados em uma etapa posterior, fora do formulário atual.

Nesta fase não devem ser coletados CPF, RG, número ou imagem da CNH, comprovante de residência, antecedentes, cartão, conta bancária ou outros documentos e dados financeiros sensíveis.

## Escopo do MVP

O MVP inclui catálogo e detalhes demonstrativos, formulário de interesse, validação no servidor, verificação de veículo disponível, persistência do lead, resposta clara ao usuário, banco PostgreSQL, testes e ambiente Supabase de homologação com acesso restrito.

A primeira entrega da Central de Interessados acrescenta autenticação restrita e listagem somente leitura por organização. O cadastro self-service de proprietários e sua primeira locadora está descrito em [tenant_onboarding.md](tenant_onboarding.md); associações administrativas existentes são preservadas. Edição de leads, recuperação de acesso na aplicação e pagamentos permanecem fora do escopo. Veja [central_interessados.md](central_interessados.md).

## Evolução: Reservas e Disponibilidade

O primeiro checkpoint acrescenta o núcleo persistido para solicitações reais de reserva, agenda de indisponibilidade, lista de espera e outbox de notificações. Aprovação humana passa a poder criar um bloqueio atômico no banco; solicitações pendentes não bloqueiam. A entrega é local, sem UI, API operacional ou envio externo. O formulário existente continua sendo manifestação de interesse. Veja [reservations_availability.md](reservations_availability.md) para estados, datas, garantias e decisões pendentes.

## Prioridades conhecidas

### P0 — antes de demonstração reproduzível ou uso público seguro

- Corrigir a reprodução local documentada: o seed recusa veículos do catálogo sem ano ou status confirmado.
- Definir proteção contra abuso e política de privacidade/retenção antes de receber dados pessoais reais publicamente.

### P1 — entrega profissional

- Evitar duplicidade em reenvios sem deduplicar pessoas apenas por telefone ou e-mail.
- Exercitar o repository real com a role restrita nos testes PostgreSQL.
- Documentar o processo humano de revisão, contato e tratamento dos leads.

### P2 — evolução posterior

- Avaliar autenticação e painel quando a operação humana exigir.
- Avaliar pagamentos apenas se o produto passar de manifestação de interesse para contratação.
- Evoluir observabilidade e operação conforme o ambiente de hospedagem escolhido.

O fluxo público de solicitação de reserva agora convive com a manifestação de interesse: veículo → período → consulta → dados → solicitação recebida. A locadora ainda analisa a solicitação; o envio não é aprovação e o período permanece não confirmado até aprovação. Não há waitlist pública, aprovação automática ou entrega externa de notificações neste checkpoint.

A [Central da locadora](tenant_dashboard_fleet.md) oferece visão geral, listagem/cadastro inicial de frota por owner, dados da locadora e os Interessados existentes. Reservas apresenta orientação honesta sobre os limites atuais, sem simular gestão pronta.

A [página pública por slug](public_tenant_storefront.md) apresenta a projeção mínima da locadora e sua frota elegível pela fronteira de leitura 0013, sem expor tabelas ou habilitar reservas de tenants reais.
