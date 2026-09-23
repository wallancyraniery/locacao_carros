# Central da locadora e frota inicial

## Auditoria e escopo

A base foi o main do PR #33. Auth SSR, cookies privados, proxy de renovação, getUser e Data API com JWT continuam existentes; não há service role nem conexão administrativa na aplicação. Membership tem uma organização por usuário e role owner/member. O onboarding 0011 e seus recibos permanecem intactos.

Vehicles já possui marca, modelo, versão, ano, cor, preço semanal em centavos, status legado, operational_status e is_demo. Não foi necessário adicionar colunas nem outro modelo. As imagens atuais são caminhos editoriais de demo_vehicles.json, vinculados a UUIDs demonstrativos; não são fotos de frota. Novos cadastros mostram “Sem foto”, sem upload, URL externa, storage ou empréstimo de imagens demonstrativas.

## Navegação e dados

/admin passa a ser Visão geral após validar sessão e associação. Sem sessão vai para login; sem associação vai para onboarding; erro falha fechado. Cadastro, onboarding já concluído e confirmação de locadora encaminham para /admin.

CentralShell e CentralNavigation compartilham cinco destinos: Visão geral, Veículos, Reservas, Interessados e Minha locadora. Interessados mantém URL, paginação, projeção e acesso existentes. Minha locadora mostra apenas a própria organização, em leitura; campos legados ausentes aparecem como não informados. O slug continua reservado, sem link para página pública inexistente.

Visão geral conta exatamente veículos ativos e inativos não demonstrativos sob RLS, sem estimativas de receita, ocupação ou disponibilidade. Falha na consulta é erro, nunca zero. Veículos tem paginação de 50 com ordem estável e exclui is_demo. Associação member mantém leitura herdada da Central, mas só owner vê e executa cadastro.

Reservas é orientação explícita: não lista registros, não implica ausência de solicitações e não oferece aprovação/calendário. Explica análise, pendências sem bloqueios, estado operacional versus disponibilidade e encaminha para Interessados. Nenhum grant novo foi concedido às tabelas de reservas. Os fluxos públicos ainda atendem exclusivamente o catálogo demonstrativo; cadastrar frota não publica veículos.

## Migration 0012 e autorização

Migration append-only 0012_tenant_dashboard_fleet, com journal/snapshot Drizzle. Não muda dados, tabelas ou migrations anteriores. Acrescenta SELECT por coluna (color, weekly_price_cents, operational_status, is_demo, created_at) a authenticated. A guarda RLS restritiva de vehicles/organization_memberships da 0005 continua isolando organizações, inclusive perante policy permissiva adicional. INSERT/UPDATE/DELETE diretos continuam negados. Grants de anon/intake e tabelas de reservas não mudam.

public.create_fleet_vehicle é adaptador SECURITY INVOKER para fleet_private.create_vehicle, SECURITY DEFINER com search_path vazio, relações qualificadas e owner administrativo confiável verificado. Schema privado não deve ser exposto pela Data API. PUBLIC/anon/intake não executam; authenticated recebe somente USAGE/EXECUTE necessários. A função deriva sub de claims validadas pelo PostgREST, recusa Auth anônimo, busca membership owner e obtém internamente a organização. Não aceita userId, organização, is_demo ou status legado. Claims de user_metadata não autorizam nada. Roles de API nunca devem receber conexão SQL confiável para forjar claims.

O lock FOR SHARE na associação mantém autorização consistente até commit, serializando revogação/troca de role com cadastro. Entradas são revalidadas no PostgreSQL. Não há SQL dinâmico ou retorno de PII. A gravação impõe is_demo=false. Estado active gera status legado available; inactive gera inactive. Isso não calcula disponibilidade, altera agenda nem cria blocos/eventos.

## Atomicidade e retries

A Server Action gera contexto com UUID no servidor da página e o vincula ao formulário. A fronteira trata o UUID como chave de idempotência, não como autorização: ele se torna o ID do veículo. INSERT ON CONFLICT(id) DO NOTHING é seguido de leitura do registro real restrita à organização autenticada, is_demo=false e comparação de todos os campos normalizados. Mesmo ID e dados retornam o mesmo ID; divergência ou colisão com outro tenant/demo falha controladamente sem alteração. A função exige READ COMMITTED para a leitura posterior enxergar o commit concorrente. Não há limitação de quantidade de veículos por organização nem deduplicação por marca/modelo. Uma nova visita inicia outra operação.

Cadastro usa uma única transação e o estado do formulário preserva campos/operação em falhas. Sem confirmação de retorno esperado a ação não redireciona como sucesso. Mensagens são genéricas e não registram payload, SQL, stack, tokens ou dados pessoais. Valores monetários são convertidos de string decimal para centavos inteiros; ano segue o contrato existente 1900–2200.

## Validação e limites

Testes de aplicação cobrem autenticação, autorização owner/member, validação, payload sem identidade fornecida pelo formulário, contagem exata, erros fail-closed, navegação e retry. PostgreSQL local cobre tenants A/B, RLS restritiva, metadata forjada, Auth anônimo, revogação, escrita negada, validação SQL, retries sequenciais/concorrentes, conflitos, demo e configuração da fronteira.

Aplicar 0012 somente mediante operação administrativa autorizada; nesta entrega apenas o banco local _test é migrado. Integrações Auth/HTTP de teste são sintéticas e não comprovam configuração remota. Ainda não há edição/exclusão de veículos, placa/chassi, upload, publicação por slug, operação de reservas, equipe, billing ou políticas comerciais avançadas.

A tentativa de inspeção em navegador usou cópia temporária, Auth sintético e banco local. A página de login renderizou, mas a jornada autenticada não foi comprovada: houve timeout sob pressão de memória. Navegador/gateway/servidor temporários foram encerrados e a fixture removida. A evidência funcional deste checkpoint é a suíte de componentes e a integração PostgreSQL, não um E2E completo.
