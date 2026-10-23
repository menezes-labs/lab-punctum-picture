# Punctum Picture — Álbuns Privados de Clientes: Design

**Data:** 2026-10-22  
**Estado:** Especificação para revisão; baseada na proposta funcional aprovada em conversa.  
**Projeto:** `menezesx2k26-byte/lab-punctum-picture`  
**Princípio:** não alterar a lente, o carrossel, o autorretrato ou a experiência editorial pública.

## 1. Intenção e sucesso

A fotógrafa entrega uma galeria exclusiva para um cliente, com login individual e senha inicial controlada pelo estúdio. A pessoa vê exclusivamente os próprios álbuns, navega pelas fotos com a linguagem visual do Punctum, favorita imagens e baixa fotos apenas se permitido. A fotógrafa cria e personaliza o álbum pelo painel existente, inclusive no celular. O portfólio público continua intacto.

Aceitação: um administrador consegue criar cliente, gerar credencial temporária, criar álbum privado, carregar e ordenar fotos, editar capa/tema/texto, publicar para aquele cliente e visualizar favoritos. O cliente autentica, troca a primeira senha, vê somente álbuns publicados a ele atribuídos e nunca acessa os de outro cliente. A experiência imersiva e os fluxos públicos não sofrem regressão.

## 2. Escopo MVP e exclusões

**MVP:** cadastro e desativação de clientes; senha temporária de uso inicial; login/logout; troca de senha obrigatória no primeiro acesso; recuperação assistida pelo administrador com geração de nova senha temporária; biblioteca privada; álbuns com título, introdução, capa, ordenação e tema; upload JPG/PNG/WebP (máximo 25 MiB por arquivo); favoritos persistidos; download original habilitado/desabilitado por álbum; arquivamento e revogação; auditoria; proteção de dados; QA responsivo e rollout controlado.

**Fora do MVP:** pagamento, impressão, seleção comercial, comentários, convites compartilháveis, links públicos, autoatendimento de recuperação por e-mail, música, vídeo, edição avançada de imagens, múltiplos usuários por álbum e domínio separado. São possíveis extensões sem forçar a estrutura atual a suportá-las agora.

## 3. Estratégia arquitetural

Abordagem escolhida: **módulo isolado no Worker/Next.js existentes**. Compartilhar D1, bucket R2 privado e validação/transformação onde adequadas; **não compartilhar** as tabelas `albums/images`, as URLs `/media/*`, o cookie administrativo nem a autorização para conteúdo público. Nenhum álbum privado aparece em `/portfolio`, `/ensaios`, sitemap, API pública, carrossel ou indexação. **Não usar `<Image>`/`/_vinext/image` para fotos privadas:** o proxy de otimização pública não verifica sessão de cliente. Imagens privadas devem passar somente por endpoint do Worker autenticado e responder com `Cache-Control: private, no-store` e `X-Robots-Tag: noindex, nofollow`.

Comparações descartadas: (a) subdomínio/serviço independente adicionaria deploy, CORS e custos sem necessidade; (b) marcar álbuns existentes como privados confundiria modelos de publicação, cache e autorização. Um namespace próprio diminui esse risco, sem reescrever o site.

## 4. Navegação e rotas

- `/albuns/entrar` — entrada do cliente, pública e `noindex`.
- `/albuns` — biblioteca do cliente, exige sessão válida.
- `/albuns/[galleryId]` — galeria exclusiva; ID opaco UUID, sem slug enumerável; `noindex`.
- `/albuns/trocar-senha` — troca obrigatória antes de listar/baixar fotos.
- `/admin/clientes` — gestão de clientes, apenas admin existente.
- `/admin/albuns-privados` e `/admin/albuns-privados/[galleryId]` — editor separado do Studio público.
- APIs administrativas `/admin/api/clientes/*` e `/admin/api/albuns-privados/*` — `requireAdmin` + Origin para mutações.
- APIs do cliente `/api/client/session`, `/api/client/password`, `/api/client/galleries/*` — sessão própria, CSRF/Origin em mutações.
- Mídia autenticada `/api/client/galleries/:galleryId/images/:imageId/:preset` (`thumb`, `gallery`) e `/download`, com verificação de associação, estado de publicação e status de imagem em toda requisição. Preview administrativo usa rota administrativa e autorização admin, nunca URL pública.

O Worker deve fazer o gate antes do handler Next.js para as páginas protegidas. Login/primeira senha não pode dar acesso aos conteúdos antes da troca. Toda resposta HTML privada e de API privada deve ser `no-store` e `noindex`.

## 5. Modelo D1 e imagens R2

Criar migration **`migrations/0009_private_client_galleries.sql`**, sem alterar tabelas públicas:

- `client_accounts`: `id TEXT PK`, `name TEXT`, `email TEXT UNIQUE` (lowercase/trim), `password_hash TEXT`, `password_salt TEXT`, `password_iterations INTEGER`, `must_change_password INTEGER`, `session_version INTEGER`, `disabled_at TEXT NULL`, `created_at TEXT`, `updated_at TEXT`.
- `client_galleries`: `id TEXT PK`, `client_id TEXT FK`, `title TEXT`, `introduction TEXT`, `theme TEXT` (`noir|ivory|warm`), `cover_image_id TEXT NULL`, `allow_downloads INTEGER`, `status TEXT` (`draft|published|archived`), `created_at TEXT`, `updated_at TEXT`, `published_at TEXT NULL`. Um proprietário por álbum no MVP.
- `client_gallery_images`: `id TEXT PK`, `gallery_id TEXT FK`, `storage_key TEXT UNIQUE`, `original_filename TEXT`, `mime_type TEXT`, `size_bytes INTEGER`, `width INTEGER NULL`, `height INTEGER NULL`, `alt_text TEXT`, `position INTEGER`, `status TEXT` (`pending|ready|failed`), `created_at TEXT`, `updated_at TEXT`, `deleted_at TEXT NULL`.
- `client_gallery_upload_intents`: `id TEXT PK`, `gallery_id TEXT FK`, `image_id TEXT FK`, `expected_mime TEXT`, `expected_size INTEGER`, `storage_key TEXT`, `status TEXT` (`pending|uploaded|completed|expired|failed`), `expires_at TEXT`, `created_at TEXT`, `completed_at TEXT NULL`.
- `client_gallery_favorites`: PK composta `(client_id, gallery_id, image_id)`, FKs, `created_at TEXT`; a API verifica que imagem e cliente pertencem à galeria.

Adicionar índices por `client_id/status`, `gallery_id/position`, `gallery_id/status`, intenções expiradas. `client_galleries.cover_image_id` deve ser validada na API como uma imagem pronta da mesma galeria antes de publicar, sem depender de FK circular.

R2: objetos imutáveis com chaves `client-galleries/{galleryId}/{imageId}.{jpg|png|webp}`. O nome original não aparece na URL privada. `pending`, `failed`, apagado ou arquivado não podem ser servidos ao cliente. Não gerar objetos em `public/` para essas fotos. Upload inicialmente pelo Worker autenticado, com assinatura do intent, confirmação de existência e tamanho/MIME do objeto após envio; todas as transformações e downloads ocorrem com consulta atual ao D1.

## 6. Autenticação e autorização

A conta de cliente **não é** conta administrativa nem aceita JWT Cloudflare Access. Usar derivação PBKDF2-HMAC-SHA256 via WebCrypto com salt único, 310.000 iterações, salt único de 16 bytes, hash de 32 bytes e comparação em tempo constante, seguindo o padrão já presente em `worker/utils/auth.ts` sem alterar o contrato admin. Credencial temporária é gerada de forma criptograficamente aleatória e exibida ao admin uma vez; nunca registrada, devolvida em lista ou salva em texto. Primeiro login exige troca de senha de no mínimo 12 caracteres. A recuperação MVP ocorre pelo admin, que emite nova credencial temporária e invalida todas as sessões anteriores.

Cookie separado `punctum_client_session`, `HttpOnly; Secure; SameSite=Strict; Path=/`, prazo máximo de 12 horas e versão de sessão conferida no D1 em toda solicitação protegida. Assinatura HMAC com `CLIENT_SESSION_SECRET` independente do segredo admin. Logout revoga o cookie no navegador; resets e desativações revogam sessões existentes via `session_version`. Todas as operações com escrita exigem `Origin` correto; rate limit por IP e também por identidade no login. Login responde erro genérico para conta inexistente e senha incorreta; negar por padrão. Sem conta válida a galeria responde 404 genérico ao tentar enumerar recursos (ou redireciona à entrada nas páginas). Não incluir segredos em logs.

## 7. Editor de álbuns privados

Criar um fluxo simples no painel: cadastrar cliente; gerar senha temporária; criar álbum associado; adicionar imagens (progresso, tentar novamente, até três envios simultâneos); ordenar e escolher capa; escolher tema (`noir`, `ivory`, `warm`) e introdução; opção de download; publicar somente se título, cliente ativo, capa pronta e pelo menos uma imagem pronta. Despublicar/arquivar revoga imediatamente a visão do cliente; edição de álbum privado nunca altera a configuração pública do Studio nem realiza deploy.

Tema: tokens predefinidos e estilos escopados ao módulo `/albuns`, sem CSS editável, scripts de usuário ou assets externos. Manter enquadramento das fotos e contraste/teclado. Favoritos são por conta/galeria/imagem; a fotógrafa visualiza a seleção no painel.

## 8. Privacidade, estados, falhas e recuperação

- UI acessível e responsiva a partir de 360 px; foco de teclado, Escape e controle de luz para visualização ampliada; respeito a `prefers-reduced-motion`.
- Sem cache público de respostas autenticadas, sem indexação e sem dados de contato/credenciais no HTML público ou logs. URLs compartilhadas sem sessão não devem renderizar as imagens.
- Alterações de permissões, publicação ou senha produzem efeito na próxima requisição. Mensagens de erro de upload não expõem storage keys.
- Upload interrompido deixa intent não público e elegível à limpeza por tarefa existente adaptada à nova tabela. Só marcar `ready` após verificar bytes e MIME no R2.
- Definir, com o responsável pelo estúdio, prazo de retenção e procedimento LGPD para exportação/exclusão antes de liberar produção; até essa decisão, não criar purge automático destrutivo. Revogar acesso e arquivar devem funcionar no MVP.
- Backups D1 e R2, teste de restauração em preview, registro de auditoria e playbook de incidente.

## 9. Rollout, não regressão e segurança operacional

Desenvolver em branch isolada. Flag `PRIVATE_GALLERIES_ENABLED=false` por padrão, incluindo configuração gerada pelo workflow de deploy. Com flag desligada, novas rotas não ficam acessíveis; testar comportamento antes de abrir acesso. A `main` atual aciona deploy e migração D1 automaticamente, portanto qualquer merge exige aprovação explícita, migrations revisadas, rollout aditivo e rollback por desativação da flag sem apagar dados.

Regressões obrigatórias: `tests/unit/immersive-policy.spec.ts`, `tests/unit/portfolio.spec.ts`, `tests/unit/home-render-plan.spec.ts`; verificações do workflow existente de Hero e carrossel; autorretrato em `app/lib/portfolio.ts` e asset atual permanecem intactos. Não modificar `app/components/PhotoCarousel.tsx`, `app/components/HomeExperience.tsx` ou estilos públicos salvo correção explicitamente aprovada. Checklists: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, testes de segurança e QA visual real (mobile/desktop), preview e smoke de produção após autorização.

## 10. Critério de DoD

Um piloto completo com cliente de teste passa: emissão de senha, primeiro acesso/troca, galeria privada publicada, visualização/favoritos, download somente se permitido, logout/reset/desativação, IDOR negado, URL pública/otimizador não revelando mídia, revogação após arquivar, nenhuma regressão da home/carrossel/lente e qualidade móvel aprovada. **Nenhum código de funcionalidade foi implementado neste documento.**
