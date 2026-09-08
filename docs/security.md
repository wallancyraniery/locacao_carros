# Segurança

## Modelo de acesso

O banco segue least privilege. Operações administrativas e migrations usam credencial própria; a aplicação usa exclusivamente `lead_intake_runtime`. Nenhuma credencial administrativa pode ser usada como fallback do runtime ou incorporada à aplicação.

No Supabase de homologação, o runtime conecta pelo Transaction Pooler na porta 6543, com TLS `verify-full`, CA explícita e verificação de identidade. Preserve esses requisitos. A role não possui privilégios administrativos, bypass de RLS ou ownership.

RLS e grants mínimos permitem à runtime consultar somente a organização e o veículo necessários e inserir apenas as colunas autorizadas do lead. A leitura de `rental_leads` permanece negada. A descrição completa de memberships, policies, grants, provisionamento, rotação e revogação está em [runtime_database_access.md](runtime_database_access.md).

## Dados e observabilidade

- Nunca versione senha, URL real de conexão, conteúdo de `.env`, certificado ou outro secret.
- Nunca registre FormData, nome, telefone, e-mail, cidade, query com valores, CA, URL, stack ou detalhes que possam conter dados do usuário.
- Falhas inesperadas do fluxo de lead registram somente `{ stage, code }`, com código sanitizado e mensagem pública genérica.
- Use dados exclusivamente sintéticos em homologação e minimize os campos coletados no produto.

## Operações remotas

Toda operação administrativa remota deve ser explícita, previamente delimitada, controlada, auditável e fail-closed. Valide projeto, banco, identidade, migrations e pré-condições antes da primeira escrita; interrompa diante de divergência. Não corrija silenciosamente estado remoto, memberships ou permissões.

Não execute `db:seed:development` no Supabase. Use somente provisionadores remotos dedicados e autorizados. Não altere RLS, grants, roles, TLS ou migrations aplicadas para contornar uma falha sem causa comprovada e autorização específica.

Antes de uso público com dados reais, o produto ainda precisa de proteção adequada contra abuso e de política definida para privacidade, retenção e atendimento dos leads.
