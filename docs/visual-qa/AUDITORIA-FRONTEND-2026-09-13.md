# Auditoria visual e frontend — 13/09/2026

## Escopo

Auditoria da experiência pública, dos fluxos editoriais e dos painéis Admin/Studio. A inspeção combinou revisão visual real no navegador, medições de layout, verificação de imagens, navegação e validações automatizadas.

## Correções desta rodada

1. **Retrato do bloco “Sobre” desalinhado**
   - Causa: a imagem ainda herdava largura máxima, margem lateral e rotação do estilo editorial anterior.
   - Correção: o retrato padrão agora ocupa exatamente a moldura definida pelo mesmo eixo visual do texto, sem deslocamento nem distorção.
   - Resultado validado: alinhamento em 320, 390, 768, 1280 e 1920 px.

2. **Miniaturas quebradas em “Serviços”**
   - Causa: o tamanho solicitado (`120 px`) não era aceito pelo otimizador de imagens do ambiente Vinext.
   - Correção: as três miniaturas passaram a usar o tamanho suportado de `128 px`, com proporção preservada.
   - Resultado validado: nenhuma imagem quebrada em `/servicos` no mobile e no desktop.

3. **Imagens do carrossel fora do pipeline de otimização**
   - Causa: o carrossel espacial, sua alternativa de movimento reduzido e a fita de filme usavam elementos de imagem sem tamanhos responsivos declarados.
   - Correção: as imagens passaram pelo componente otimizado, com dimensões e regras `sizes` específicas de cada composição.
   - Resultado validado: lint sem avisos e imagens carregadas sem alterar a geometria ou a interação do carrossel.

4. **Navegação administrativa com recarga completa**
   - Causa: três fluxos internos usavam atribuição direta de URL ao criar ensaio, encerrar sessão e concluir troca de senha.
   - Correção: os fluxos usam o roteador do aplicativo; logout e troca de senha também atualizam o estado da sessão.

5. **Dependências de produção desatualizadas**
   - Correção: Next, React, PostCSS e a cadeia Cloudflare foram atualizados para versões compatíveis e corrigidas.
   - Resultado: `npm audit --omit=dev` responde com zero vulnerabilidades conhecidas.

## Matriz visual

Breakpoints inspecionados na página inicial: 320, 390, 768, 1280 e 1920 px.

Rotas inspecionadas visualmente em mobile e desktop:

- `/`
- `/portfolio`
- `/arquivo`
- `/contato`
- `/servicos`
- `/fotografia`
- `/ensaios/ritos-de-luz`
- `/admin`
- `/admin/studio`

Critérios verificados:

- ausência de rolagem horizontal acidental;
- imagens sem distorção e sem falhas de carregamento;
- um único `h1` e um único `main` por página pública;
- idioma `pt-BR` presente;
- ausência de IDs duplicados, links vazios e imagens sem atributo `alt`;
- fontes carregadas;
- contêineres, texto e imagens presos ao mesmo eixo responsivo;
- botão flutuante do WhatsApp sem colisão com o conteúdo.

## Experiência e interações

- Abertura da lente validada no desktop: a máscara cresce durante a rolagem e revela a fotografia completa.
- Carrossel espacial validado por teclado e clique.
- Modal de fotografia abre com nome acessível e fecha com `Escape`.
- Alternância entre Composição e Grade validada.
- Formulário de contato inspecionado em mobile e desktop.
- Admin validado em desktop e mobile, incluindo a navegação inferior responsiva.
- Studio validado em desktop e mobile; a prévia interna carrega a experiência da lente e responde sem estouro lateral.

Os elementos do carrossel e as lâminas da lente podem ocupar espaço fora do quadro durante a animação. Esse deslocamento é intencional e permanece recortado: a largura rolável do documento continua igual à largura da tela.

## Verificações técnicas

- TypeScript: aprovado.
- Lint: aprovado.
- Testes: 25 arquivos e 108 testes aprovados.
- Build de produção Vinext: aprovado.
- Sitemap local: 30 rotas públicas responderam HTTP 200.
- Auditoria das dependências de produção: zero vulnerabilidades conhecidas.
- Workflow CI: aprovado.
- Workflow de publicação: aprovado, incluindo migrações, experiência publicada, smoke público e contrato autenticado do Studio.
- `www.punctumpicture.com`: redireciona por HTTP 308 para o domínio principal; o smoke foi ajustado para acompanhar esse redirecionamento.

O auditor completo ainda aponta avisos restritos às ferramentas locais Vinext, Drizzle Kit e ao pool de testes da Cloudflare. As correções automáticas propostas substituem essas ferramentas por versões incompatíveis ou beta. Elas não entram no pacote executado pelo site e foram mantidas para evitar uma migração de infraestrutura sem relação com esta entrega.

## Definition of Done

- [x] Erros visuais encontrados e corrigidos.
- [x] Mobile first validado a partir de 320 px.
- [x] Desktop amplo validado até 1920 px.
- [x] Lente e carrossel preservados e funcionais.
- [x] Admin e Studio operacionais.
- [x] Testes, lint, tipos e build aprovados.
- [x] Lint aprovado sem erros ou avisos.
- [x] Dependências executadas em produção sem vulnerabilidades conhecidas.
- [x] Todas as URLs do sitemap respondendo localmente.
- [x] Commit publicado na `main`.
- [x] Workflow de produção aprovado.
- [x] Produção conferida após o deploy.
