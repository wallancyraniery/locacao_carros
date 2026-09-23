# Página pública da locadora

A rota canônica `/locadoras/[slug]` resolve o slug reservado no onboarding. Não há discovery, conta de locatário ou envio de solicitação para tenants reais neste checkpoint. A home separa as jornadas e mantém o catálogo demonstrativo identificado como tal.

## Fronteira pública

O servidor usa um cliente Supabase anônimo novo, chave publishable, sem cookies/JWT do visitante, persistência de sessão ou cache. A configuração de URL/chave reutiliza a validação existente. Não usa conexão administrativa, service role ou credencial de intake.

A migration append-only 0013 cria `public.lookup_tenant_storefront`, SECURITY INVOKER, que delega a `storefront_private.lookup`, SECURITY DEFINER, STABLE, search_path vazio e owner confiável verificado. Somente anon recebe USAGE/EXECUTE para a consulta pública. PUBLIC, authenticated e intake não executam essa consulta; visitantes autenticados também usam a consulta anônima no servidor. O schema privado não deve ser exposto na Data API. Apenas SELECT da coluna storefront_status é acrescentado a authenticated, sob a RLS existente. Nenhuma escrita direta ou alteração de policies é concedida.

O slug é validado no aplicativo e no banco (3–63 caracteres, minúsculas/números e hífens entre segmentos). A função resolve a organização internamente e filtra a frota por essa relação. Não aceita organization_id. A projeção enumera apenas nome, slug, cidade e marca/modelo/versão/ano/cor/preço semanal. IDs, contatos, controlador de dados, memberships e informações operacionais privadas não são retornados. A aplicação valida a projeção estritamente e não registra respostas brutas ou erros.

## Exposição e limites

A organização possui storefront_status (draft | published), NOT NULL e default draft, inclusive para organizações preexistentes. Somente published resolve na consulta pública; draft e slug inexistente retornam o mesmo NULL/404. Ter slug reservado não publica a locadora. Organizações publicadas podem apresentar frota vazia. Não existe exceção por UUID, nome ou slug de demonstração.

Minha locadora mostra o estado e oferece publicar/despublicar apenas ao owner. A Server Action revalida sessão e role, e envia somente o estado desejado. public.set_tenant_storefront_status (SECURITY INVOKER) delega a storefront_private.set_status (SECURITY DEFINER, search_path vazio, relações qualificadas, mesmo owner confiável). Apenas authenticated executa essa fronteira; anon/intake/PUBLIC não executam. A função deriva sub das claims confiáveis do PostgREST, recusa Auth anônimo e exige membership owner, mantido com FOR SHARE até commit. Não aceita userId, organization_id ou slug. Member mantém somente leitura do estado da própria organização sob RLS.

A operação define um estado, não alterna cegamente: retry com o mesmo estado é idempotente. Alterações concorrentes seguem a ordem das gravações no banco. Após commit da despublicação, novas consultas públicas não resolvem a organização; a rota é dinâmica, o fetch é no-store e a action revalida os caminhos envolvidos. Conteúdo já entregue a um navegador não pode ser recolhido retroativamente.

Somente veículos da organização resolvida, is_demo=false, operational_status=active e status legado=available são apresentados. O filtro legado é conservador durante a compatibilidade expand/contract existente. Exposição não é consulta de disponibilidade temporal: não consulta agenda, não garante datas e não oferece CTA de reserva. Veículos sem fotos mostram “Sem foto”; imagens editoriais demonstrativas não são usadas. Nenhuma condição comercial global é importada além do formatador de moeda.

A consulta tem 24 veículos por página, ordem estável created_at/id e indicador de próxima página. Páginas são limitadas a 1–10000. Cadastro concorrente pode deslocar paginação por offset; não há promessa de snapshot entre requests. Slug/página inválidos ou organização ausente resultam em 404. Falhas técnicas exibem mensagem genérica, não lista vazia nem dados de fallback. Cidade legada ausente é explicitada.

A Central passa a oferecer o link público em Minha locadora e seus textos refletem o novo estado. Os fluxos demonstrativos de interesse/reserva/disponibilidade, Auth SSR, onboarding e permissões privadas permanecem independentes.

## Validação e operação

Testes unitários verificam projeção, cliente anônimo/no-store, 404, falhas seguras, renderização, paginação e jornadas da home. PostgreSQL local verifica isolamento A/B, demonstrações/estados excluídos, ausência de campos privados, paginação, grants e configuração das funções. Aplicação de migration apenas no banco local de testes; nenhuma validação remota realizada.

Próximos checkpoints naturais: consulta e solicitação por locadora com a mesma segurança transacional; imagens após definição de armazenamento e autorização. Marketplace e conta de locatário continuam fora do escopo.
