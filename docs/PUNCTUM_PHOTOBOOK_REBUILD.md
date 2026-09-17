# Punctum — livro de fotografia digital

## Autoridade e estado

Frontend Director: APPROVED (candidato 4006772, 2026-09-09). Publicado e verificado após o merge 2a310b0. Contrato instalado lido em `C:\Users\Pichau\.agents\skills\frontend-director\SKILL.md` em 2026-09-08. Lead: frontend-design (RUFLOW). Execução sequencial. Revisão visual e de acessibilidade após candidato estável. O usuário delegou expressamente decisões reversíveis e continuidade até aprovação; não há gate de aprovação intermediária.

## Reconhecimento verificado

- Fonte: GitHub `menezes-labs/lab-punctum-picture`, main `38c43d1294914209ea640ef803c0e7bb143d82b5`. A cópia Sites parava em `948a28a`; atualizada por bundle verificado antes de criar branch.
- Branch isolada: `feat/punctum-photobook-redesign-20260908`, checkout `/workspace/sites/punctum-picture`.
- Pasta antiga no Desktop tem exclusões preexistentes. Preservada. Pasta Documents está limpa na main.
- PR #2 de upload está aberto como draft; implementação equivalente foi integrada por #3/#4. Não interferir.
- Baseline: 97 testes / 21 arquivos passam. Node 22+, React 19, Next 16 via Vinext/Vite, Worker único, Cloudflare D1/R2/Images.
- Produção observada no Cloud Browser: home, portfólio, ensaio documental, contato, hub regional, São Bento do Sul, música e shows. 16 histórias / 192 fotos segundo API pública.
- Diagnóstico: hero vertical recortado em tela horizontal; botão branco com texto branco; carrosséis e textos repetidos; fotos cobertas por títulos; CSS de 4.791 linhas com sucessivas sobreposições; imagem estática de crianças na página de música e shows.
- Dados atuais de tema: nocturne-plum, Cormorant Garamond, Manrope; hero próprio administrado. Configuração deve continuar editável.

## Tese e pesquisa

Um livro de fotografia digital de Maria Helena: passe-partout neutro, imagens íntegras, sequência entre escalas diferentes e legendas editoriais fora das fotografias. A presença humana, os ritos, a cor de palco e o movimento formam a identidade.

Referências consultadas: [Rinko Kawauchi / Illuminance](https://rinkokawauchi.com/en/works/194/) (pares de imagens, proporções, navegação silenciosa; página renderizada inspecionada); [Jack Davison](https://www.jackdavison.co.uk/) (entrada direta na imagem, índice); [Refero](https://github.com/referodesign/refero_skill) (pesquisa, reference lock e papel de tokens; MCP não disponível nesta sessão). Refero não é autoridade superior ao Director. Nenhuma imagem externa será incorporada.

Direções consideradas: papel claro favorece livro impresso; preto fotográfico favorece shows e documental e respeita modo escuro publicado; alternância constante prejudica coesão. Escolha: preto fotográfico neutro no tema noturno publicado, com sistema também funcional nos temas claros do Studio. Cor pertence principalmente à fotografia. Sem shader, gradiente decorativo ou novo catálogo de componentes.

## Decisões e source lock

| Decisão | Fonte | Papel e motivo |
| --- | --- | --- |
| Fotografias sem recorte em ensaios e capas | Brief + Kawauchi | Mostrar a decisão original de enquadramento |
| Abertura composta por imagem principal e contraponto menor | Brief editorial + acervo real | Apresentar autora e trabalho numa dupla página |
| Legendas e títulos fora da imagem | Diagnóstico produção | Fotografia íntegra e contraste independente |
| Fundo noturno neutro | Tema publicado + acervo | Cor das fotos deixa de disputar com ameixa/gradientes |
| Tipografia administrável, títulos em romano | Site Config + brief | Preservar escolhas do Studio, evitar palavra em itálico decorativo |
| Índice de séries com escalas alternadas | Brief + sequência fotográfica | Hierarquia editorial sem catálogo de cards |
| Contato visível cedo, navegação por teclado | Brief mobile | Facilitar uso de clientes e Maria |

DFII: impacto 4, contexto 5, viabilidade 5, performance 5, risco de consistência 3 = 16 (a fórmula publicada na skill excede seu intervalo descritivo; julgamento: forte).

## Preservar

Não alterar contratos de API, esquema/migrations, dados de produção, Worker, R2, D1, autenticação, publicação/arquivo de ensaios, categorias, ordem, alt text, capas administradas, SEO, canonicals, sitemap/robots/JSON-LD, deploy Cloudflare. Preservar presets, fontes, conteúdo, reorder e visibilidade do Studio; preview usa o mesmo HomeExperience. Não criar endereços ou afirmar onde fotos foram feitas sem localização cadastrada.

## Plano de implementação

1. Ambiente e evidência: corrigir somente compatibilidade do comando dev com preview supervisionado; reproduzir conteúdo público em banco local isolado; capturar baseline responsivo. Registrar resultados e fontes.
2. Composição: reconstruir HomeHeroSection, FeaturedStories/PortfolioGrid por um componente compartilhado de ensaio; redesenhar SiteChrome e contato; separar CSS público dos estilos administrativos, eliminando regras públicas antigas sobrepostas.
3. Sistema: temas continuam resolvidos por Site Config; ajustar paleta noturna dentro da camada visual; manter presets/fontes; seções e variantes continuam respeitando atributos existentes. Sem dependência runtime nova.
4. Páginas: portfólio, arquivo, ensaios, seis serviços e cinco cidades recebem mesmo sistema. Serviços escolhem fotografia compatível do acervo publicado; corrigir estáticas incompatíveis. Conteúdo SEO preservado com copy voltada ao cliente.
5. Interação: lightbox com dialog nativo, foco restaurado, teclado/gestos; carrossel manual, reduced motion. Estados vazios claros. Testes de comportamento onde há alteração, sem testes que espelham CSS.
6. Gates: typecheck, lint, suíte completa, build, rotas, links/canonicals/schema; QA renderizado 360/390/768/1363/1920, foco/teclado, lightbox, filtros, formulário sem envio real, console/rede, imagens e payloads.
7. Revisão: se houver falha, NEEDS_REVISION e correção autônoma. Branch/commits/PR; preview quando infra suportar. Só integrar após todos os gates materiais. Validar versão publicada pelo fluxo Cloudflare existente.

## Gates finais do candidato — 2026-09-09

| Gate | Evidência | Estado |
| --- | --- | --- |
| Funcional | Navegação HTTPS; filtro mobile; lightbox/setas/Escape/foco; formulário enviado e limpo apenas no D1 local isolado; 20 rotas HTTP 200 + 2 HTTP 404 esperados | PASS |
| Engenharia | Typecheck, lint, 100 testes / 22 arquivos, build local e Windows; CI [34376688734](https://github.com/menezes-labs/lab-punctum-picture/actions/runs/34376688734) | PASS |
| Visual | Cloud Browser: home, portfólio, arquivo, ensaios horizontal/vertical e série de 52 fotos, contato, serviço e cidade; antes/depois desktop + mobile | PASS |
| Responsividade | 360, 390, 768, desktop ~1363 e 1920 px. 1920 inspecionado em frame com viewport real, reduzido visualmente para caber na captura; sem overflow do documento | PASS |
| UX/acessibilidade | Skip link visível com Tab; outline; dialog modal, foco contido/restaurado, Escape e setas; alvos principais ≥44 px; feedback de envio e disabled; reduced-motion no CSS/carrossel | PASS |
| Studio/conformidade | Resolver e registries existentes; HomeExperience compartilhado; tema claro + fundo escuro configurado com contraste preservado; statement centralizado renderizado. Configuração alterada somente no D1 local e restaurada | PASS |
| Performance | CSS entregue 167.808 → 148.150 bytes (−11,7%); hero 241.944 bytes, inalterado; logo seleciona 640 em vez de 1920 no navegador; miniaturas sheet de 640 px, lazy loading e nenhuma biblioteca nova | PASS |
| Isolamento | Fixtures 17,9 MB retirados de public; plugin apenas serve, dist sem qa/qa-media; sem dados de teste publicados | PASS |
| Publicação | Merge 2a310b0; deploy 34378054225 e CI 34378054129 concluídos; smoke autenticado do Studio; 22 rotas 200 + 2 404 esperados; inspeção Cloud Browser em produção | PASS |

[Comparação visual com capturas originais](visual-qa/comparison.html) · [Smokes de rotas](visual-qa/route-smoke-preview.json) · [Medições de recursos](visual-qa/performance-preview.json).

Preview final: https://1c082973-punctum-picture-migration.menezesx2k26.workers.dev · versão `1c082973-9926-4cc3-9ae0-807778024558`. Upload de versão sem trocar tráfego de produção, migrations ou triggers. Canonicals mantidos em punctumpicture.com; preview noindex. PR [#7](https://github.com/menezes-labs/lab-punctum-picture/pull/7).

## Revisão final do Director

Estratégia: rebuild da apresentação, com reuse-first dos contratos e da infraestrutura. Lead: frontend-design. Review: revisão independente de engenharia, seguida de frontend-quality-reviewer e inspeção visual pelo Director. Os três achados materiais da revisão — contraste do fundo configurável, centralização do statement e fixtures no build — foram corrigidos e verificados. Iteração final compactou filtro/abertura do portfólio e trouxe o formulário antes da informação repetida no mobile.

A composição depende das fotografias: proporções íntegras, legendas fora das imagens, escalas alternadas e retrato real da autora. Não há catálogo de cards, badges, shaders ou imagem externa. O sistema funciona como sequência fotográfica e passa no transplant test. Páginas de serviço/local compartilham a direção, preservam os seis serviços e cinco regiões atendidas e não inventam estabelecimento físico.

Mudanças estruturais: HomeHeroSection recomposto; EssayLink compartilhado; CSS público reconstruído e CSS admin extraído/escopado; navegação/rodapé e contato reconstruídos; galeria dialog nativa; carrossel manual; resolução de foto selecionada pelo Studio preservada; fotografias adequadas nos serviços. Nenhuma dependência adicionada, removida ou atualizada. O comando dev foi ajustado à integração Vite existente; deploy e framework de produção preservados. O único acréscimo no pipeline é o preset aditivo sheet, sem mudar os seis presets anteriores.

Limites reais da evidência: mobile usa documento SSR real em viewport de inspeção, não um aparelho físico; não há alegação de métricas de campo/Core Web Vitals ou nota Lighthouse. Os 192 registros da origem têm width/height nulos: dívida de metadados preexistente, sem reparo no D1 de produção nesta reconstrução. O fallback src do logo gerado pelo Vinext pede largura 1254 não aceita pelo endpoint (também na versão antiga); navegadores inspecionados usam srcset válido e carregam a marca. Isso fica registrado como dívida de compatibilidade do framework. As thumbnails sheet custam 17.344 bytes na amostra contra 8.096 do antigo thumb recortado; o ganho é preservar enquadramento e detalhe, evitando a galeria de 168.563 bytes nesse espaço.

Nenhuma falha material aberta no candidato. Estado: APPROVED. Conclusão operacional confirmada pela verificação publicada abaixo.

## Histórico — checkpoint de implementação — 2026-09-08

Composição implementada na branch: abertura em dupla página; EssayLink compartilhado; títulos/legendas fora das imagens; portfólio e contato compactados; sequência de ensaio íntegra; arquivo com dialog nativo, setas/gesto e restauração de foco; carrossel manual; imagens de serviços corrigidas; CSS público reconstruído e CSS administrativo extraído com seletores compartilhados escopados. Marca oficial intacta. Nenhuma dependência adicionada/removida.

O preset `sheet` (640 × 640, scale-down) é uma extensão aditiva do pipeline existente: miniaturas de arquivo íntegras sem carregar a versão de galeria de 1600 px. Os seis presets anteriores e contratos existentes permanecem iguais. Sem alteração de migrations, banco de produção, storage ou deploy.

O emulador local de Images acrescentou padding preto indevido. A reprodução local usa `localPhotographyFixtures`, plugin estritamente `serve` e inativo sem manifesto local ignorado, com cópias das imagens públicas reais. 192 registros públicos reproduzidos em D1 local; parte dos downloads de uploads retornou 503 e ainda precisa ser verificada. Nenhum fixture pode entrar no artefato final.

Primeiro candidato: typecheck passou, lint passou, 97 testes passaram e build completo passou. Após adicionar preset sheet e regressões específicas, repetir gates. A revisão independente encontrou contraste em superfície accent e foco do dialog (corrigidos em código, verificação renderizada pendente) e porta dev (fixada em 3000). O revisor interrompeu por limite de uso; sua revisão está incompleta.

Estado do Director: NEEDS_REVISION. Home e portfólio foram inspecionados em 1363 e 390 px; reduzir espaço antes das fotos do portfólio e abaixo do hero mobile foi necessário. Correções feitas, nova captura pendente. Ainda faltam QA completo, evidências finais, PR e publicação. Não integrar enquanto gates estiverem abertos.

A sessão de preview saudável anterior foi encerrada durante o intervalo da conversa. Reiniciada para retomada. A inspeção responsiva usa um frame local com o HTML SSR real, preservando os headers de segurança da aplicação. Artefato de inspeção local não será publicado.

## Verificação publicada — 2026-09-09

O [PR #7](https://github.com/menezes-labs/lab-punctum-picture/pull/7) foi integrado como `2a310b03c2b05b42716eeeb04c3980ef05b7f226`. O [deploy 34378054225](https://github.com/menezes-labs/lab-punctum-picture/actions/runs/34378054225) e a [CI 34378054129](https://github.com/menezes-labs/lab-punctum-picture/actions/runs/34378054129) concluíram com sucesso. O pipeline confirmou hero WebP, API pública e Studio autenticado. Resultado sanitizado persistido pelo próprio workflow em requests/cloudflare-git-deploy-result.json.

[Smoke independente de produção](visual-qa/route-smoke-production.json): 22 respostas 200 e dois 404 esperados; 192 fotos, 16 ensaios, sete categorias. Canonicals corretos e sem noindex no domínio principal. Inclui seis serviços, cinco cidades, ensaio curto e ensaio de 52 fotografias. Cloud Browser confirmou a home publicada, navegação para portfólio, filtro Música com três ensaios e contato. Nenhuma imagem carregada falhou; nenhum erro de aplicação no console (mensagens da extensão do ambiente excluídas). Formulário de produção não foi enviado.

As capturas punctum-published-home-20260909.jpg e punctum-published-contact-20260909.jpg documentam a versão em punctumpicture.com. O único alerta do pipeline é `wwwSmokeStatus: unexpected-stats`, idêntico ao resultado de 2026-09-03 na baseline 38c43d1. Trata-se de débito preexistente de domínio/infraestrutura, fora desta reconstrução pública. O domínio canônico principal foi validado.

Estado final do Frontend Director: **APPROVED**. Todos os gates materiais da reconstrução e a verificação pós-publicação possuem evidência.
