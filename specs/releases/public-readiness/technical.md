# Contrato técnico

## Estado atual relevante

O fluxo implementado é `UI → Server Action → Zod → caso de uso → repository → Drizzle → PostgreSQL`. A Server Action usa mensagens públicas seguras, os logs inesperados contêm somente `stage` e `code`, e o servidor revalida a disponibilidade antes do INSERT.

O formulário possui honeypot, mas ainda não valida Turnstile no servidor. Cada envio válido recebe um UUID novo; não existe identificador estável da operação para tornar retry técnico idempotente. A nota atual informa finalidade básica, porém ainda não apresenta identidade do controlador, canal oficial, prazo de 90 dias ou procedimento de solicitações e eliminação. Não há integração com WhatsApp nem runbook humano versionado.

O destino de deploy permanece indefinido. Em homologação, a aplicação usa `lead_intake_runtime`, Transaction Pooler 6543, TLS `verify-full` com CA explícita, grants mínimos e RLS. A runtime consulta apenas organização e disponibilidade necessárias, insere as colunas autorizadas e não lê `rental_leads`. Credenciais de migration/admin e runtime permanecem separadas. Consulte [runtime_database_access.md](../../../docs/runtime_database_access.md).

## Mudanças mínimas necessárias

### Abuso e idempotência da operação

- Preservar o honeypot e acrescentar Cloudflare Turnstile, validando o token no servidor antes do INSERT.
- Validar configuração, resposta, hostname e demais vínculos de contexto aplicáveis. Token ausente, inválido ou verificação obrigatória indisponível deve falhar com segurança e mensagem pública sem detalhes internos.
- Não adicionar CAPTCHA tradicional permanente nem rate limiting complexo ou baseado em dados pessoais sem evidência posterior de necessidade.
- Introduzir uma identidade opaca por operação que permaneça estável em retry técnico e mude em nova manifestação deliberada. O servidor é responsável por validar o contrato e garantir no máximo um lead por operação.
- Não deduplicar por telefone ou e-mail e não atualizar ou sobrescrever um lead anterior silenciosamente.
- Manter tokens, respostas do provedor, dados pessoais e chaves fora dos logs. Observabilidade inesperada continua limitada a `stage` e `code` seguros.
- Se a garantia exigir persistência adicional, usar nova migration revisada; migrations já aplicadas permanecem imutáveis.

### Privacidade e retenção

- Publicar informação de privacidade com a locadora como controladora, Improve/desenvolvedor como eventual operador, finalidade do lead, campos coletados, canal oficial, prazo de 90 dias para leads sem locação e tratamento separado quando houver relação contratual.
- Preservar os campos atuais do formulário; nenhum documento ou dado financeiro entra nesta etapa.
- Documentar um procedimento administrativo controlado para localizar e eliminar leads sem locação ao completar 90 dias. Execução manual é aceita, desde que tenha responsável, pré-visualização, escopo explícito, confirmação e evidência sanitizada.
- O procedimento deve ser idempotente, falhar fechado e usar acesso administrativo separado. A runtime pública continua sem `SELECT`, `UPDATE` ou `DELETE` em `rental_leads`.
- Documentar como solicitações de acesso, correção e eliminação são recebidas e tratadas. Registros que passaram a uma relação contratual seguem política própria e não são apagados automaticamente como leads vencidos.

### Continuidade por WhatsApp e atendimento humano

- Renderizar a ação para o WhatsApp comercial oficial somente após confirmação de persistência do lead.
- Tratar o número oficial como configuração pública validada, sem inventar contato e sem colocar conteúdo pessoal sensível na URL ou mensagem pré-preenchida.
- Não enviar dados ao WhatsApp automaticamente e não integrar API, webhook, n8n, bot ou agente nesta release.
- Criar runbook curto com responsável, substituto, revisão dos leads, tratamento em até um dia útil, qualificação, atualização de status, solicitações de privacidade e contingência.
- O acesso humano deve ser autorizado e auditável, separado da runtime da aplicação. Não conceder leitura de `rental_leads` a `lead_intake_runtime`.

### Produção e deploy

- Escolher no item de deploy uma plataforma compatível com Next.js, Server Actions, secrets server-only, Supabase e uso comercial. Não reduzir requisitos de segurança para acomodar a plataforma.
- Disponibilizar à aplicação somente a credencial runtime. Preservar Transaction Pooler 6543, TLS `verify-full`, CA explícita, project ref, role, RLS, policies e grants mínimos.
- Configurações ausentes ou divergentes devem falhar antes de aceitar tráfego. Segredos do banco e do Turnstile permanecem no armazenamento seguro da plataforma, fora do Git e do cliente.
- Documentar build, inicialização, domínio, variáveis, health check aplicável e rollback. Migrations são uma etapa administrativa explícita; produção não executa migration ou seed automaticamente.

## Verificação exigida

- Testes unitários de Turnstile, honeypot, idempotência por operação, nova manifestação, validação, mensagens e falhas fechadas.
- Integração PostgreSQL comprovando um lead por operação, novas manifestações independentes, ausência de registros parciais, constraints, RLS e grants.
- Testes de privacidade e acessibilidade para aviso, erros e continuidade opcional pelo WhatsApp após sucesso.
- Testes do procedimento de retenção somente com dados sintéticos, incluindo pré-visualização, corte de 90 dias, exclusão controlada, repetição e preservação de leads contratuais ou fora do escopo.
- Testes de configuração de produção recusando credencial administrativa, conexão direta, porta incorreta, TLS incompleto e secrets ausentes.
- Typecheck, lint, suíte completa, integração PostgreSQL, build e `git diff --check`.
- Após deploy autorizado, smoke test público com marcador sintético único, seguido de conferência administrativa somente leitura e diagnóstico runtime. Não usar seed remoto nem relaxar a recusa de `SELECT` em `rental_leads`.
- Revisão de logs e artefatos para confirmar ausência de dados pessoais, tokens, URL de conexão, senha, CA, `.env` e outros secrets.

Siga [AGENTS.md](../../../AGENTS.md), [architecture.md](../../../docs/architecture.md), [security.md](../../../docs/security.md) e [testing.md](../../../docs/testing.md).
