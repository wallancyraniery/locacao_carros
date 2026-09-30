# Mídia da frota — checkpoint local

## Produto

O checkpoint permite até oito fotos JPEG, PNG ou WebP de até 5 MiB por veículo. A capa é a imagem de posição zero; a vitrine preserva o placeholder quando não há fotos. Inclui reordenação, remoção controlada e galeria na página pública do veículo. Não inclui vídeos, documentos ou edição de imagem.

## Arquitetura e segurança

- A migration final deste checkpoint é `0014_tenant_vehicle_media`. Ela cria `vehicle_images`, as funções privadas com `search_path` vazio, as fronteiras RPC e as projeções públicas. A migration 0015_vehicle_media_upload_guard foi descartada antes de entrar no histórico oficial e nunca foi aplicada remotamente.
- O navegador solicita `prepare`; o banco deriva organização e veículo da sessão e membership de owner, serializa o veículo, limita oito slots e gera o path canônico. A action revalida owner, tenant e path antes de emitir a capacidade.
- O Storage permanece privado. Usuários `anon` e `authenticated` não recebem capacidade para INSERT ou emissão arbitrária no bucket `vehicle-media`. A emissão é feita pelo módulo `server-only` com `SUPABASE_VEHICLE_MEDIA_SECRET_KEY`, variável exclusiva do servidor, e fixa `upsert: false`.
- O browser recebe somente a URL assinada vinculada ao path e envia o binário diretamente ao Storage. A chave privilegiada nunca chega ao browser; não há JWT técnico estático, trigger ou DELETE SQL direto em `storage.objects`.
- Antes de marcar a mídia como `ready`, o servidor baixa o objeto e valida tamanho, assinatura binária, formato e decodificação completa com `sharp`. A projeção pública inclui somente imagens `ready` de locadora e veículo elegíveis.
- A prova HTTP local real confirmou o caso 2: uma assinatura sem upsert não permite sobrescrita, mas um usuário autenticado poderia emitir uma assinatura com upsert antes da existência do objeto se tivesse permissão de INSERT. Por isso a solução final restringe a emissão da capacidade à fronteira server-only; não depende de contexto HTTP interno.

## Lifecycle

`prepare → prepared → upload direto → validação real → ready`

`prepared expirado → deleting → Storage API remove/confirma ausência → deleted`

`remoção solicitada → deleting → Storage API remove/confirma ausência → deleted`

`deleting` deixa a vitrine imediatamente. A remoção física ocorre pela Storage API; somente remoção confirmada ou ausência autoritativamente confirmada permite a transição para `deleted`. Falhas transitórias preservam `deleting` e a operação pode ser repetida de forma idempotente.

## Validação e ativação futura

Os testes locais cobrem validação de conteúdo, isolamento, owner-only, concorrência, lifecycle, projeção pública e a fronteira de escrita. A prova HTTP local usou Storage real em ambiente descartável e confirmou emissão, tentativa de overwrite, header hostil, emissão com upsert pelo usuário e alteração de path.

Não houve consulta ou alteração de Supabase remoto, commit remoto, push, PR ou deploy. A ativação remota futura requer autorização explícita para configurar o bucket privado, aplicar a 0014 e executar smoke tests sintéticos.

## Riscos operacionais conhecidos

- Uma URL de upload ainda válida pode ser reproduzida após a remoção e criar um objeto órfão; ela não restaura metadata nem torna a mídia pública. A operação precisa de reconciliação após o TTL da assinatura.
- URLs públicas de leitura já emitidas podem continuar válidas até seu TTL de 300 segundos após uma alteração de elegibilidade.
- A chave de Storage é privilegiada e não é limitada ao bucket; deve permanecer somente no ambiente servidor com controles adequados.
