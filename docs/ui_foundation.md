# Fundação visual Improve

Este checkpoint organiza interfaces existentes. Não altera autorização, RLS, RPCs, tabelas, publicação, reservas ou condições comerciais. Não cria marketplace, upload ou conta de locatário.

## Identidade e tipografia

A base reaproveita azul-marinho e ciano do produto. Navegação administrativa escura, conteúdo em superfícies claras e ciano em ações/estado ativo. Gradiente discreto aparece apenas no placeholder neutro de mídia. A assinatura é tipográfica; não representa uma nova marca gráfica oficial. Na vitrine a locadora é protagonista, com “Plataforma por Improve” em posição secundária.

Geist Latin variável é servida localmente por next/font/local, com display swap, fallback sans-serif e pesos 100–900. O arquivo foi copiado do Next.js 16.2.12 já instalado (`dist/next-devtools/server/font/geist-latin.woff2`); a licença SIL OFL oficial está em src/app/fonts/OFL.txt (https://github.com/vercel/geist-font/blob/main/OFL.txt). Não há consulta a CDN de fontes durante build ou navegação.

src/styles/tokens.css define cores semânticas, escala tipográfica (display, títulos, corpo, rótulos, legendas e métricas), espaçamentos, raios, sombras e durações. Display é reservado à entrada pública. Títulos administrativos e de decisão usam escala menor. src/styles/foundation.css implementa os padrões de apresentação; globals.css mantém estilos funcionais existentes de formulários e fluxos demonstrativos. Não há nova dependência de UI ou animação.

## Componentes e composição

- ImproveBrand: assinatura tipográfica comum e atribuição discreta da plataforma.
- Icon: poucos ícones SVG decorativos, sem nome acessível redundante ou fetch externo.
- EmptyState e VehiclePlaceholder: ausência explícita de dados/foto, sem imagem de veículo fictícia ou CTA sem destino.
- CentralShell/CentralNavigation: estrutura comum aos cinco módulos, sidebar desktop e navegação em grade no mobile. Todos os destinos permanecem disponíveis sem JavaScript adicional. aria-current identifica o módulo, e o link de salto conduz ao conteúdo.
- Classes ui-panel, status-badge, central-details e central-metrics: superfícies, estados textuais, dados de cadastro e métricas existentes. Cor nunca é a única indicação de estado.

Os componentes novos são Server Components; formulários mantêm suas fronteiras client/server e actions atuais. O contexto existente passa também o e-mail já validado por getUser ao cabeçalho privado, sem log ou link pessoal. Interessados consulta o contexto existente apenas para apresentar locadora/identidade; a consulta de leads e seus redirecionamentos continuam intactos. Essa leitura adicional pode ser deduplicada em uma futura revisão de composição, sem criar cache compartilhado de sessão.

## Responsividade e acessibilidade

A Central usa sidebar de 244px em desktop. Até 900px ela vira cabeçalho com navegação de três colunas, e até 600px duas colunas. Dados longos usam minmax(0,1fr), min-width:0 e overflow-wrap:anywhere; Minha locadora passa a uma coluna em telas estreitas. E-mail da sessão tem nome acessível completo e quebra em mobile.

Tabelas mantêm caption, th/scope e semântica HTML. Um contêiner identificado e focável permite rolagem horizontal por teclado/touch sem ampliar a página. Não são transformadas em cartões que percam relações entre linhas e colunas.

Foco usa contorno de contraste; botões e itens principais de navegação têm pelo menos 44px. A navegação não é escondida pela regra legada do header público. Hover altera apenas cor/borda/sombra. prefers-reduced-motion desliga transições/animações e scroll suave. Nenhuma informação depende de entrada animada ou movimento.

## Home e vitrine

A home apresenta as duas jornadas imediatamente. O antigo hero fotográfico alto foi retirado da composição, preservando os arquivos e imagens demonstrativas do catálogo. “Quero alugar um veículo” leva à orientação real de acessar o link da locadora; “Sou locadora” continua em /admin/login. Não há busca fictícia.

A vitrine prioriza nome/cidade, aviso de disponibilidade e frota. Cards mostram “Sem foto”, identificação, versão quando existir, ano, cor e preço semanal; não prometem disponibilidade nem exibem condições inexistentes. O placeholder é uma área de mídia substituível em checkpoint futuro, não armazenamento ou upload. Publicação/draft/404 permanecem inalterados.

Para fotos futuras, manter a área de mídia e o conteúdo do card independentes. Para políticas comerciais e reservas, usar superfícies e feedbacks existentes somente com dados/ações reais. Não acrescentar cartões vazios de funcionalidades futuras. A experiência de cliente, quando existir, deve preservar a prioridade visual da locadora.

## Evidência e limites

Testes de componentes cobrem navegação, identidade, estados, tabelas e preservação dos fluxos existentes. A inspeção em navegador usa HTML renderizado dos componentes reais com dados sintéticos locais e os mesmos estilos/fontes. Isso verifica composição/overflow/foco, mas não comprova autenticação, publicação ou submissão end-to-end. Foram verificados desktop a 1280px e mobile a 390px e 320px, sem overflow horizontal da página; as tabelas mantiveram rolagem interna. Tab/Enter no link de salto moveu o foco ao conteúdo. A emulação de prefers-reduced-motion confirmou transition=0s e scroll-behavior=auto. A revisão final restaurou overflow-wrap:anywhere na vitrine; cidade, versão e cor com sequências longas sem espaços foram verificadas a 320px, sem overflow ou corte horizontal. Nenhum erro de script foi observado nos previews. Nenhuma fixture ou rota de preview é adicionada ao produto.

CSS legado dos fluxos demonstrativos permanece em globals.css; migração completa desses estilos para tokens pode ser gradual. Sem migration ou operação remota neste checkpoint.
