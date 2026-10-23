# Punctum Picture Private Client Albums Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar álbuns fotográficos privados e personalizados com autenticação individual, editor da fotógrafa e favoritos, sem regressões na experiência pública do Punctum.

**Architecture:** Novo domínio independente de clientes/galerias no D1, mídia em namespace privado R2, API protegida no Worker e telas específicas Next.js. Reutilizar infraestrutura administrativa, mas isolar cookies, autorização, tabelas e rotas da biblioteca pública; feature flag desligada até homologação.

**Tech Stack:** TypeScript 5.9, React 19/Next.js 16 via vinext, Cloudflare Workers + D1 + R2 + Images, Zod 4, Vitest/Miniflare, CSS escopado e API nativa WebCrypto; sem nova dependência runtime no MVP.

**Spec:** `docs/superpowers/specs/2026-10-22-punctum-client-albums-design.md`

## Global Constraints

- Não tocar no comportamento da lente, carrossel, autorretrato, portfólio público, SEO ou configuração editorial.
- Nenhum arquivo de álbum privado pode ser servido por `/media/*`, `/admin/media/*` sem admin, `/_vinext/image`, `public/`, sitemap ou APIs públicas.
- 1 cliente por galeria no MVP; um cliente pode ter muitas galerias. URLs opacas com UUID, sem compartilhamento público.
- MIME permitidos: `image/jpeg`, `image/png`, `image/webp`. Máximo por imagem: 26_214_400 bytes (25 MiB).
- Temas: `noir|ivory|warm`; status da galeria: `draft|published|archived`; status de imagem: `pending|ready|failed`.
- Cliente tem cookie e segredo separados do admin; primeira senha temporária e troca obrigatória; mínimo 12 caracteres.
- Mídia e dados autenticados: `Cache-Control: private, no-store`; páginas e mídia privadas: `X-Robots-Tag: noindex, nofollow`.
- Guardas de autenticação/autorização devem estar no Worker, não só no React. Escrever só com Origin validada e rate limit onde aplicável.
- `PRIVATE_GALLERIES_ENABLED=false` por padrão em produção; merge/publicação depende de revisão e consentimento explícitos.
- Migrations somente aditivas e versionadas em `migrations/`. Nenhum comando de migração em produção durante implementação.
- Rodar TDD (RED → GREEN → refactor), commitar cada entrega aprovada e não afirmar testes passando sem saída real.

## Review Focus

1. Um cliente tenta `galleryId`/`imageId` de outra pessoa → recebe 404 e nenhum byte da foto. Cobertura: Tasks 5, 7 e 8.
2. Uma pessoa acessa a mídia privada via `/_vinext/image` ou URL de mídia pública → nenhuma imagem retorna. Cobertura: Task 7 e Task 12.
3. Senha temporária roubada, resetada, sessão antiga ou conta desativada → acesso a galerias negado imediatamente. Cobertura: Task 3.
4. Upload interrompido, forjado ou com bytes/MIME divergentes → nunca se torna `ready`, nunca vaza. Cobertura: Task 6.
5. Álbum arquivado ou download desabilitado enquanto uma página está aberta → requisição subsequente nega download/foto sem confiar em estado cacheado. Cobertura: Tasks 5, 7 e 8.

## File Responsibility Map

- `shared/client-galleries.ts`: schemas Zod, tipos e limites compartilhados; não contém queries SQL.
- `migrations/0009_private_client_galleries.sql`, `db/schema.ts`: novo domínio D1, sem alterar a semântica de `albums/images`.
- `worker/client/passwords.ts`, `worker/client/auth.ts`: credenciais e sessões de cliente; nenhuma dependência em autorização admin.
- `worker/client/repository.ts`: queries D1 de contas/galerias/fotos e pertencimento; retorna dados tipados.
- `worker/api/client-admin.ts`: clientes e gestão administrativa de galerias.
- `worker/api/client-session.ts`: login, logout e troca de senha.
- `worker/api/client-gallery-upload.ts`: intents/upload/completion para imagens privadas.
- `worker/api/client-galleries.ts`: leitura e favoritos do cliente.
- `worker/media/private-gallery.ts`: acesso ao R2 e imagens privadas, com autorização por requisição.
- `worker/index.ts`, `worker/test-entry.ts`: apenas roteamento/adaptação de autorização e flag.
- `app/albuns/**`, `app/admin/clientes/**`, `app/admin/albuns-privados/**`: UI separada; CSS em `app/albuns/albuns.css` e estilos admin escopados.
- `tests/unit/client-galleries.spec.ts`, `tests/unit/client-passwords.spec.ts`, `tests/integration/client-galleries.spec.ts`, `tests/integration/client-media.spec.ts`: provas do novo domínio.

---

### Task 1: Contratos e persistência isolada

**Files:** Create `shared/client-galleries.ts`, `migrations/0009_private_client_galleries.sql`, `tests/unit/client-galleries.spec.ts`, `tests/integration/client-galleries.spec.ts`; Modify `db/schema.ts`.

**Interfaces:** Export `clientAccountCreateSchema`, `clientGalleryCreateSchema`, `clientGalleryUpdateSchema`, `clientImageIntentSchema`, `CLIENT_THEMES`, `CLIENT_MAX_UPLOAD_BYTES` e tipos inferidos; tabelas/colunas exatamente conforme a Spec §5.

- [ ] **Step 1: Write the failing tests.** `tests/unit/client-galleries.spec.ts`: `clientGalleryCreateSchema.safeParse({clientId:'11111111-1111-4111-8111-111111111111',title:'Ensaio',theme:'noir'}).success === true`; tema `'custom-script'` é rejeitado; `CLIENT_MAX_UPLOAD_BYTES === 26_214_400`. Integração: inserir cliente/galeria e garantir FKs e consulta de galeria por `client_id`.
- [ ] **Step 2: Verify RED.** `npm test -- tests/unit/client-galleries.spec.ts tests/integration/client-galleries.spec.ts` → FAIL por módulos/tabelas inexistentes.
- [ ] **Step 3: Implement.** Schemas estritos Zod; migration aditiva de cinco tabelas com índices/FKs, `db/schema.ts` tipado. Estender o helper de bootstrap na nova spec de integração para importar/aplicar as migrations `0001` a `0009` (incluindo `0008`).
- [ ] **Step 4: Verify GREEN.** Mesmo comando → PASS, incluindo FK de cliente inexistente recusada (ativar `PRAGMA foreign_keys=ON` na fixture se necessário).
- [ ] **Step 5: Commit.** `git add shared/client-galleries.ts migrations/0009_private_client_galleries.sql db/schema.ts tests/unit/client-galleries.spec.ts tests/integration/client-galleries.spec.ts && git commit -m "feat(albuns): add isolated private gallery schema"`.

### Task 2: Repositório D1 e regras de pertencimento

**Files:** Create `worker/client/repository.ts`; Modify `tests/integration/client-galleries.spec.ts`.

**Interfaces:** Export `getActiveClient(db: D1Database, id: string): Promise<ClientRow | null>`, `getOwnedGallery(db, clientId, galleryId): Promise<GalleryRow | null>`, `getReadyGalleryImage(db, galleryId, imageId): Promise<GalleryImageRow | null>`, `listPublishedGalleriesForClient(db, clientId): Promise<GalleryRow[]>`. Os tipos `ClientRow`, `GalleryRow`, `GalleryImageRow` residem no mesmo módulo.

- [ ] **Step 1: RED tests.** Dois clientes A/B, duas galerias e imagem pronta: `getOwnedGallery(db,A,galleryB) === null`; `getReadyGalleryImage(db,galleryA,imageB) === null`; `listPublishedGalleriesForClient(db,A)` retorna somente publicadas e próprias.
- [ ] **Step 2: Run.** `npm test -- tests/integration/client-galleries.spec.ts` → FAIL nas funções ausentes.
- [ ] **Step 3: Implement.** Queries SQL parametrizadas que restringem simultaneamente o ID da galeria, proprietário, status, soft-delete e imagem; não inferir posse a partir de ID recebido em JSON.
- [ ] **Step 4: Run.** Comando anterior → PASS.
- [ ] **Step 5: Commit.** `git add worker/client/repository.ts tests/integration/client-galleries.spec.ts && git commit -m "feat(albuns): enforce gallery ownership in D1"`.

### Task 3: Passwords, sessões e revogação dos clientes

**Files:** Create `worker/client/passwords.ts`, `worker/client/auth.ts`, `tests/unit/client-passwords.spec.ts`; Modify `vitest.config.ts`, `tests/integration/client-galleries.spec.ts`.

**Interfaces:** `hashClientPassword(password: string): Promise<{hash:string;salt:string;iterations:number}>`; `verifyClientPassword(password: string, stored: ClientPasswordRecord): Promise<boolean>`; `createClientSession(clientId:string,version:number,env:Env): Promise<string>`; `requireClient(request:Request, env:Env, db:D1Database, options?:{allowPasswordChange?:boolean}): Promise<ClientIdentity>`; `clientSessionCookie(token:string):string`; `clearClientSessionCookie():string`. Sessão HMAC com `CLIENT_SESSION_SECRET`, cookie `punctum_client_session`, TTL 12h e `session_version` validado no D1; PBKDF2-HMAC-SHA256 com 310_000 iterações, salt aleatório de 16 bytes e derivação de 32 bytes, registrado por credencial.

- [ ] **Step 1: RED tests.** Hash jamais igual a senha; salts únicos; verificação errada é false; cookie contém `HttpOnly`, `Secure`, `SameSite=Strict`; sessão inválida/expirada/assinada com segredo admin é negada; incremento de `session_version` e `disabled_at` invalidam sessão; primeira senha bloqueia galerias mas permite troca.
- [ ] **Step 2: Run.** `npm test -- tests/unit/client-passwords.spec.ts tests/integration/client-galleries.spec.ts` → FAIL por interfaces ausentes.
- [ ] **Step 3: Implement.** WebCrypto PBKDF2, igualdade constante, geração segura por `crypto.getRandomValues`, HMAC e validação atual no banco; nenhuma reutilização de cookie/admin Access. Adicionar somente `CLIENT_SESSION_SECRET` de teste ao `vitest.config.ts`; runtime exige segredo real fora do git. Habilitar flag em ambiente de teste quando introduzida na Task 12.
- [ ] **Step 4: Run.** Mesmo comando → PASS.
- [ ] **Step 5: Commit.** `git add worker/client/passwords.ts worker/client/auth.ts vitest.config.ts tests/unit/client-passwords.spec.ts tests/integration/client-galleries.spec.ts && git commit -m "feat(albuns): add revocable client authentication"`.

### Task 4: API de cadastro, credencial temporária e reset pelo estúdio

**Files:** Create `worker/api/client-admin.ts`; Modify `worker/index.ts`, `worker/test-entry.ts`, `tests/integration/client-galleries.spec.ts`.

**Interfaces:** `handleClientAdminApi(request:Request,url:URL,env:Env):Promise<Response|null>` roteia `POST/GET /admin/api/clientes`, `PATCH /admin/api/clientes/:id`, `POST /admin/api/clientes/:id/reset-password`; administrador autenticado `requireAdmin` e `assertAllowedOrigin` em escrita. Resposta da criação/reset inclui `temporaryPassword` **somente nessa resposta**, contas listadas não incluem hash, salt nem segredo.

- [ ] **Step 1: RED tests.** Sem admin → 401/403; admin cria com `name/email` válidos → 201 e senha temporária; listagem omite credenciais; duplicata `email` normalizado → 409; reset aumenta `session_version`, define `must_change_password=1`; PATCH desativar revoga sessão; Origin externa → 403.
- [ ] **Step 2: Run.** `npm test -- tests/integration/client-galleries.spec.ts` → FAIL em rotas ausentes.
- [ ] **Step 3: Implement.** Rotas admin com Zod, rate limit, auditoria via `writeAudit`; nunca escrever segredo em auditoria/log; devolver erro de cadastro legível sem revelar credencial.
- [ ] **Step 4: Run.** Mesmo comando → PASS.
- [ ] **Step 5: Commit.** `git add worker/api/client-admin.ts worker/index.ts worker/test-entry.ts tests/integration/client-galleries.spec.ts && git commit -m "feat(albuns): manage client accounts in admin API"`.

### Task 5: Login/logout/troca obrigatória e gate de páginas

**Files:** Create `worker/api/client-session.ts`; Modify `worker/index.ts`, `worker/test-entry.ts`, `tests/integration/client-galleries.spec.ts`.

**Interfaces:** `handleClientSessionApi(request,url,env):Promise<Response|null>` para `POST/DELETE /api/client/session`, `POST /api/client/password`, `GET /api/client/me`; `protectClientPage(request,url,env):Promise<Response|null>` para `/albuns`, `/albuns/[galleryId]` e `/albuns/trocar-senha` (rota `/albuns/entrar` livre). `requireClient` impede acesso a fotos antes da troca obrigatória.

- [ ] **Step 1: RED tests.** Erro genérico igual para email ausente/senha errada, brute-force → 429, cookie próprio criado, Origin inválida → 403, troca `min(12)` e invalida token anterior, reset antigo não autentica, conta disabled não acessa, página privada sem sessão redireciona para `/albuns/entrar`, `/albuns/entrar` permanece pública.
- [ ] **Step 2: Run.** `npm test -- tests/integration/client-galleries.spec.ts` → FAIL nas novas rotas.
- [ ] **Step 3: Implement.** Validar credenciais por hash, sesssão assinada, CSRF/Origin e alteração da senha em transação lógica D1, gate antes do handler vinext e `no-store/noindex` inclusive no HTML.
- [ ] **Step 4: Run.** Mesmo comando → PASS.
- [ ] **Step 5: Commit.** `git add worker/api/client-session.ts worker/index.ts worker/test-entry.ts tests/integration/client-galleries.spec.ts && git commit -m "feat(albuns): add gated client sessions and first-login flow"`.

### Task 6: CRUD de galerias privadas + upload isolado

**Files:** Create `worker/api/client-gallery-upload.ts`; Extend `worker/api/client-admin.ts`, `tests/integration/client-galleries.spec.ts`; Create `tests/integration/client-media.spec.ts`.

**Interfaces:** Admin API: `POST/GET /admin/api/albuns-privados`, `GET/PATCH /admin/api/albuns-privados/:id`, `POST /admin/api/albuns-privados/:id/uploads/intents`, `PUT /admin/api/albuns-privados/:id/uploads/:intentId/direct`, `POST .../:intentId/complete`; handler `handleClientGalleryUploadApi(request,url,env):Promise<Response|null>`. Chaves R2 `client-galleries/{galleryId}/{imageId}.{ext}`; `uploadUrl` autentica administração e deve ter Origin verificada no upload sensível.

- [ ] **Step 1: RED tests.** Criar galeria sem cliente válido → 404/400; payload inválido/extra → 400; upload GIF ou `26_214_401` bytes → 400; `pending` não serve; PUT falha em MIME/tamanho ausente ou intent vencido; completion verifica `R2.head` (size/MIME) e produz `ready` só quando conferidos; tentativa de completar intent de outra galeria → 404; retry de falha mantém outras fotos.
- [ ] **Step 2: Run.** `npm test -- tests/integration/client-galleries.spec.ts tests/integration/client-media.spec.ts` → FAIL.
- [ ] **Step 3: Implement.** CRUD isolado, intents tipadas, upload direto ao Worker seguindo `worker/site-media.ts` sem reutilizar registro público e armazenamento imutável.
- [ ] **Step 4: Run.** Mesmo comando → PASS; confirmar R2 contém `client-galleries/` e não `originals/`.
- [ ] **Step 5: Commit.** `git add worker/api/client-admin.ts worker/api/client-gallery-upload.ts worker/index.ts worker/test-entry.ts tests/integration/client-galleries.spec.ts tests/integration/client-media.spec.ts && git commit -m "feat(albuns): create galleries and isolated photo uploads"`.

### Task 7: Autorização de mídia, miniaturas e downloads privados

**Files:** Create `worker/media/private-gallery.ts`; Modify `worker/index.ts`, `worker/test-entry.ts`, `tests/integration/client-media.spec.ts`.

**Interfaces:** `servePrivateGalleryImage(request:Request,env:Env,galleryId:string,imageId:string,preset:'thumb'|'gallery'|'download',audience:'client'|'admin'):Promise<Response>`; `GET /api/client/galleries/:galleryId/images/:imageId/:preset` e `GET /admin/api/albuns-privados/:galleryId/images/:imageId/:preset`. `download` retorna original somente se `allow_downloads=1` (admin pode baixar sempre). `thumb/gallery` usam presets existentes do módulo `worker/media/presets.ts`; proteger transformações antes de chamar Images/R2.

- [ ] **Step 1: RED tests.** Sem sessão → negado; A tenta gallery/image B → 404; `pending/failed/deleted` → 404; galeria `draft/archived` → 404 ao cliente; `download` com flag false → 403; após arquivar resposta seguinte negada; resposta bem-sucedida contém `private, no-store`, `nosniff`, `noindex`, sem link R2; `/media/{imageId}/thumb` e `/_vinext/image?url=/api/client/...` não obtêm mídia privada, inclusive se navegador enviar cookies.
- [ ] **Step 2: Run.** `npm test -- tests/integration/client-media.spec.ts` → FAIL.
- [ ] **Step 3: Implement.** Validar client/session/version e posse no D1 em **cada** request; admin via `requireAdmin`; usar stream do R2 e transformação após autorização, sem `next/image` nas fotos privadas; não cachear, `Content-Disposition: attachment` só no download.
- [ ] **Step 4: Run.** Mesmo comando → PASS e inspeção de headers/bytes.
- [ ] **Step 5: Commit.** `git add worker/media/private-gallery.ts worker/index.ts worker/test-entry.ts tests/integration/client-media.spec.ts && git commit -m "feat(albuns): serve private media with per-request authorization"`.

### Task 8: Publicação, capa, ordem e favoritos

**Files:** Extend `worker/api/client-admin.ts`; Create `worker/api/client-galleries.ts`; Modify `worker/index.ts`, `worker/test-entry.ts`, `tests/integration/client-galleries.spec.ts`.

**Interfaces:** Admin `PATCH /admin/api/albuns-privados/:id` (title/introduction/theme/allowDownloads), `PUT .../:id/order` (`imageIds:string[]`), `PUT .../:id/cover` (`imageId:string`), `POST .../:id/publish`, `POST .../:id/archive`; Client `GET /api/client/galleries`, `GET /api/client/galleries/:id`, `PUT/DELETE /api/client/galleries/:id/favorites/:imageId`.

- [ ] **Step 1: RED tests.** Publicação falha sem capa pronta ou fotos `ready`; capa de outra galeria → 404; reordenação exige conjunto exato dos IDs; cliente A lista só galerias publicadas próprias; favoritos persistem em idempotência PUT/DELETE, não permitem ID da galeria B; admin recebe contagem de favoritos por galeria; arquivamento interrompe listagem e mídia na requisição seguinte; download flag é aplicada imediatamente.
- [ ] **Step 2: Run.** `npm test -- tests/integration/client-galleries.spec.ts tests/integration/client-media.spec.ts` → FAIL.
- [ ] **Step 3: Implement.** Validar checklist transacional do servidor, ordenar na D1 e consultas parametrizadas; `writeAudit` em publicar, arquivar e mudanças de permissão.
- [ ] **Step 4: Run.** Mesmo comando → PASS.
- [ ] **Step 5: Commit.** `git add worker/api/client-admin.ts worker/api/client-galleries.ts worker/index.ts worker/test-entry.ts tests/integration/client-galleries.spec.ts && git commit -m "feat(albuns): publish private galleries and collect favorites"`.

### Task 9: Login e biblioteca mobile do cliente

**Files:** Create `app/albuns/layout.tsx`, `app/albuns/albuns.css`, `app/albuns/entrar/page.tsx`, `app/albuns/trocar-senha/page.tsx`, `app/albuns/page.tsx`, `app/albuns/components/ClientLogin.tsx`, `app/albuns/components/ClientLibrary.tsx`, `app/albuns/components/routes.ts`; Create `tests/unit/client-gallery-ui.spec.ts` (testar estado puro/formatadores; não introduzir runner de DOM sem aprovação).

**Interfaces:** Frontend consome `POST /api/client/session`, `POST /api/client/password`, `GET /api/client/galleries` e `DELETE /api/client/session`; páginas sem `next/image` privado, `metadata.robots={index:false,follow:false}`. Biblioteca expõe imagem de capa pela rota autenticada do Task 7.

- [ ] **Step 1: RED tests.** Helpers puros `loginErrorMessage(401) === 'E-mail ou senha incorretos.'`, `galleryHref(id) === '/albuns/'+id`; componentes devem exibir estado vazio, loading, logout, troca inicial e erro de rede (revisão manual do HTML se sem DOM runner).
- [ ] **Step 2: Run.** `npm test -- tests/unit/client-gallery-ui.spec.ts` → FAIL por helpers ausentes.
- [ ] **Step 3: Implement.** Telas responsivas e sem elementos públicos herdados; formulário com labels, validação e feedback; sem credenciais em querystrings; redirecionar para troca obrigatória quando API indicar.
- [ ] **Step 4: Run.** Teste focado → PASS; `npm run typecheck` → PASS; revisão manual 360/390 px e teclado (registrar evidência, não marcar como validado antes de executar).
- [ ] **Step 5: Commit.** `git add app/albuns tests/unit/client-gallery-ui.spec.ts && git commit -m "feat(albuns): add client login and private library"`.

### Task 10: Galeria fotográfica, temas, favoritos e download no cliente

**Files:** Create `app/albuns/[galleryId]/page.tsx`, `app/albuns/components/PrivateGallery.tsx`, `app/albuns/components/PhotoViewer.tsx`, `app/albuns/components/theme.ts`; Extend `app/albuns/albuns.css`, `tests/unit/client-gallery-ui.spec.ts`.

**Interfaces:** `themeTokens(theme:'noir'|'ivory'|'warm')` retorna tokens aprovados; galeria usa `GET /api/client/galleries/:id`, mídia Task 7 e favoritos Task 8; botões de download só quando `allowDownloads` verdadeiro, mas servidor sempre decide.

- [ ] **Step 1: RED tests.** Tema desconhecido não injetável; `themeTokens('ivory')` retorna configuração distinta de `noir`; formatação não corta `altText`; URLs de foto geradas contêm `/api/client/galleries/` e nunca `/media/` nem `/_vinext/image`.
- [ ] **Step 2: Run.** `npm test -- tests/unit/client-gallery-ui.spec.ts` → FAIL.
- [ ] **Step 3: Implement.** Galeria com proporções preservadas, dialog de foto com Escape/setas e foco devolvido, favoritos idempotentes, download e estado de falha/sem fotos; `prefers-reduced-motion` e alvos de toque adequados.
- [ ] **Step 4: Run.** Teste focado e typecheck → PASS; inspeção manual em 360/390/768/desktop e navegação só teclado.
- [ ] **Step 5: Commit.** `git add app/albuns tests/unit/client-gallery-ui.spec.ts && git commit -m "feat(albuns): render themed private client galleries"`.

### Task 11: Painel para criação e personalização dos álbuns

**Files:** Create `app/admin/clientes/page.tsx`, `app/admin/albuns-privados/page.tsx`, `app/admin/albuns-privados/[galleryId]/page.tsx`, `app/admin/components/ClientAccountsManager.tsx`, `app/admin/components/PrivateGalleryEditor.tsx`, `app/admin/components/private-gallery-utils.ts`; Modify `app/admin/components/AdminShell.tsx`; Extend `tests/unit/client-gallery-ui.spec.ts`.

**Interfaces:** Painel usa endpoints dos Tasks 4, 6, 8; criação de cliente exibe senha temporária somente uma vez com função copiar; editor: capa, título, introdução, temas, organização, upload três em paralelo, retry isolado, favorites e publish/archive. Não toca `StudioManager` nem a gestão de ensaios públicos.

- [ ] **Step 1: RED tests.** Extrair `canSubmitPrivateGallery(form)` para exigir título + cliente; `uploadQueueBatch(items,3)` preserva grupos de até três e retries não reiniciam uploads completados; navegação de menu adiciona links privados sem excluir os existentes.
- [ ] **Step 2: Run.** `npm test -- tests/unit/client-gallery-ui.spec.ts` → FAIL.
- [ ] **Step 3: Implement.** Views mobile-first; labels, feedback de erro, publicação bloqueada pelo checklist vindo do servidor; senha visível apenas na resposta de criação/reset. Usar padrão de progresso de `app/admin/components/AlbumEditor.tsx` sem alterá-lo.
- [ ] **Step 4: Run.** Teste + typecheck → PASS; QA manual com uploads de pelo menos 10 fotos e uma falha isolada.
- [ ] **Step 5: Commit.** `git add app/admin tests/unit/client-gallery-ui.spec.ts && git commit -m "feat(albuns): add admin client and private gallery editor"`.

### Task 12: Flag, defesa contra regressão e rollout seguro

**Files:** Modify `worker/index.ts`, `worker/test-entry.ts`, `.github/workflows/cloudflare-git-main.yml`, `.env.example`, `tests/unit/immersive-policy.spec.ts`, `tests/unit/portfolio.spec.ts`, `tests/integration/client-media.spec.ts`, `tests/unit/deploy-workflow.spec.ts`; Create `docs/operations/private-client-galleries-rollout.md`.

**Interfaces:** `isPrivateGalleriesEnabled(env:Env):boolean` (false salvo string explícita `'true'`), com aplicação no roteamento novo; workflow define `PRIVATE_GALLERIES_ENABLED:'false'` no patch de config; runbook define ativação/desativação, segredos e backup, smoke e rollback sem drops D1.

- [ ] **Step 1: RED tests.** Flag ausente/false → rotas novas 404; true permite apenas novas rotas autorizadas; testar o flag desabilitado fornecendo override explícito de `Env` ao handler de teste e manter `PRIVATE_GALLERIES_ENABLED='true'` como binding exclusivamente no `vitest.config.ts`; source `app/lib/portfolio.ts` preserva `p001-autorretrato.jpg`; testes imersivos garantem Hero `cinematic`, reel `horizontal` e foto selecionada; `/media/*`, `/_vinext/image`, sitemap e public APIs não expõem `client-galleries/`.
- [ ] **Step 2: Run.** `npm test -- tests/unit/immersive-policy.spec.ts tests/unit/portfolio.spec.ts tests/unit/deploy-workflow.spec.ts tests/integration/client-media.spec.ts` → FAIL pelas expectativas novas.
- [ ] **Step 3: Implement.** Guardar todas as rotas novas por flag (inclui admin, páginas e APIs), publicar padrão false; adicionar runbook de rollback e proteção automática dos contratos imersivos e privacidade; não atualizar o conteúdo editorial.
- [ ] **Step 4: Run.** Testes focados → PASS. Também `npm run typecheck && npm run lint && npm test && npm run build` → todos PASS antes de qualquer PR.
- [ ] **Step 5: Commit.** `git add worker/index.ts worker/test-entry.ts .github/workflows/cloudflare-git-main.yml .env.example tests docs/operations/private-client-galleries-rollout.md && git commit -m "test(albuns): gate rollout and preserve public experience"`.

### Task 13: Homologação, segurança e go/no-go

**Files:** Create `docs/operations/private-client-galleries-qa-2026-10-22.md` (registrar data real na execução, renomeando se necessário); Modify apenas testes/documentos para achados objetivos.

**Interfaces:** Entrega é pacote verificável de resultados, capturas, diffs de rotas e checklist; sem publicação automática.

- [ ] **Step 1: Preparar ambiente de preview isolado.** Conferir D1/R2 próprios, criar um cliente piloto e duas galerias com 10+ fotos; não usar dados pessoais reais de cliente sem autorização.
- [ ] **Step 2: Exercitar cenário de ponta a ponta.** Cadastrar, emitir senha, trocar, publicar, favoritar, negar download, habilitar download, arquivar, resetar, desativar; registrar status HTTP sem exibir segredo.
- [ ] **Step 3: Tentar abusos.** IDOR em galeria/imagem/favorito; replay do cookie após reset, Origin externa, URL `/_vinext/image`, URL sem cookie, upload adulterado, excesso de tamanho/MIME, cache/CDN, XSS nos textos. Resultado esperado: acesso negado sem vazamento.
- [ ] **Step 4: QA visual e gates.** Comparar lente/carrossel/autorretrato antes/depois; Android Chrome, iPhone Safari (360–430 px), 768 e desktop; `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, smoke preview. Registrar outputs; nenhum teste pode ser considerado PASS sem execução.
- [ ] **Step 5: Revisão independente e aprovação.** Revisar PR/docs/evidências; obter decisão LGPD de retenção e procedimento de exclusão; confirmar restore em preview. **Não mesclar na `main` ou habilitar flag em produção sem aprovação expressa.** Registrar Go/No-go e plano de rollback.

## Self-review checklist

- [ ] Cobertura da Spec §§1–10 vinculada às Tasks 1–13.
- [ ] Todos os métodos referenciados têm tarefa produtora e os tipos são consistentes.
- [ ] Review Focus 1–5 possui teste no passo RED da tarefa proprietária.
- [ ] Nenhum teste sugerido depende de auth admin para cliente ou de `/_vinext/image` privado.
- [ ] Nenhum secret, senha ou imagem privada é versionado.
- [ ] SQL aditivo e config default-off; fluxo `main → Cloudflare` preservado.
- [ ] Nenhum PASS ou deploy é afirmado sem evidência executada.

## Execution handoff

**Método recomendado:** Subagent-driven, por causa das fronteiras de autorização e do risco de vazar fotos privadas. Um implementador independente por Task, revisão de cada contrato antes de seguir, revisão integral da branch ao final. Alternativa: Native, com revisão externa final; mais simples, mas menos robusta para segurança.

**Estado na elaboração deste documento:** planejamento somente. Solicitar revisão do usuário e escolha do método antes de iniciar código; não fazer merge ou deploy automático.
