# Álbuns privados — evidências e decisão de liberação

Data: 2026-10-22. Implementação em branch agent/private-client-albums-20261022 a partir de af55e1526b731be099e804335eb143d2b5cfa95e. Nenhuma alteração ou migration em produção.

## Resultado funcional executado

Os testes executam o Worker real com D1, R2 e Cloudflare Images locais do Miniflare. O piloto client-pilot.spec.ts percorre APIs de cadastro, senha temporária, troca obrigatória, criação de álbum, dez uploads reais em lotes de três, uma falha de bytes e retry isolado, conclusão, capa, publicação, favoritos, visualização, download negado/permitido, arquivamento, reset e desativação. Nenhuma credencial é incluída nas evidências.

Os demais testes exercitam FKs, cliente A versus B, IDs de fotos de outro álbum, ordem exata, capa inválida, estado pending/failed/deleted, sessão adulterada, segredo diferente, incremento de versão, primeira senha, Origin, rate limit, expiração de intent, tipo/tamanho/bytes inválidos, raster corrompido, conclusão idempotente e limpeza que preserva originais prontos. Respostas de mídia são no-store/noindex/nosniff e não incluem ETag público.

As rotas públicas /media e /_vinext/image negam fotos privadas. A flag ausente ou diferente da string 'true' fecha páginas, APIs, mídia e administração do módulo. O workflow de produção mantém a flag false.

## HTTP com renderização real

Smoke executado com Vite + Worker + vinext, usando somente dados locais:

| Rota | Status | Cache-Control | X-Robots-Tag |
| --- | --- | --- | --- |
| /albuns/entrar | 200, formulário renderizado | private, no-store | noindex, nofollow |
| /albuns sem cookie | 303 para /albuns/entrar | private, no-store | noindex, nofollow |
| /admin/clientes com admin local | 200, formulário renderizado | private, no-store | noindex, nofollow |
| /admin/albuns-privados com admin local | 200, formulário renderizado | private, no-store | noindex, nofollow |

## Verificações automatizadas

Base antes da implementação: 108 testes em 25 arquivos, todos aprovados. Validação final: **145 testes aprovados em 37 arquivos**; npm run typecheck, npm run lint e npm run build concluídos com código 0. Lint sem erros nem avisos. Build emite apenas a observação já existente do vinext sobre classificação estática de rotas dinâmicas.

Revisão independente identificou três problemas importantes: PATCH concorrente poderia restaurar download revogado; parser confiava somente no Content-Length; limpeza não retomava após falha na exclusão. Cada problema teve reprodução RED e correção GREEN: atualização apenas de campos fornecidos, leitura JSON com limite real de 64 KiB e retomada de intents expirados até confirmar exclusão. O completed_at de um intent expired registra a conclusão da limpeza; de completed, registra a conclusão do upload.

Também foram corrigidos e cobertos por testes os cabeçalhos de redirecionamentos privados no entrypoint de produção, alertas de erro de favoritos dentro do dialog e as FKs compostas equivalentes no ORM. A revisão não encontrou divulgação de mídia entre clientes. Os arquivos do módulo receberam formatação consistente após a revisão.

Regressões existentes immersive-policy, portfolio, home-render-plan e deploy-workflow aprovadas. Nenhuma alteração em PhotoCarousel.tsx, HomeExperience.tsx, globals.css, app/lib/portfolio.ts ou assets públicos. Logo, o autorretrato vigente é mantido exatamente como encontrado na main.

## Pendências de homologação

- A tela de entrada foi inspecionada no Chrome desktop local e remoto. Um ensaio local dos componentes reais, com dez fotos públicas e dados fictícios, confirmou Ivory/Noir/Warm, abertura do dialog, setas, Escape, alternância de luz, favorito e retorno de foco ao botão da foto. Esse ensaio não valida autenticação. Permanecem QA autenticado da UI, 360/390/768 e aparelhos Android Chrome/iPhone Safari; não se afirma homologação visual completa.
- Conclusão do piloto e restauração de D1/R2 em preview. Deploy isolado, migrations remotas e smoke SSR passaram; a troca de senha bloqueou por CPU antes dos uploads e da restauração.
- Política de retenção e aprovação do procedimento LGPD pelo estúdio, conforme runbook.
- Aprovação explícita para merge/main e ativação da flag. A implementação não executa esses passos.

Decisão atual: código para revisão; **NO-GO para ativação em produção** até fechamento dos gates acima. Rollback é desligar a flag, sem apagar tabelas ou originais.

## Piloto remoto reproduzível

O workflow Deploy, ambiente preview, executa scripts/private-galleries-preview.mjs exclusivamente no GitHub Actions. Cria recursos punctum-picture-albums-qa próprios, aplica migrations em dois D1 e usa três buckets privados. O piloto valida dez uploads, acesso privado, favoritos, downloads, revogação e restauração de todas as linhas e originais prontos. A cópia R2 é comparada byte a byte, e revogar a conta somente na origem comprova a troca para os bindings restaurados. O relatório público contém apenas resultados e identificadores de infraestrutura; senhas e sessões ficam mascaradas. Conclusão do piloto remoto ainda pendente.

Primeira execução remota: [Actions 39819189535](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/39819189535). Typecheck, lint, 142 testes e build aprovados; os recursos isolados foram criados e o smoke SSR passou. A criação da conta retornou 500: o log remoto confirmou `Pbkdf2 failed: iteration counts above 100000 are not supported (requested 310000)`. O código mantém PBKDF2-SHA256/310000 e usa @noble/hashes 2.4.0 quando encontra especificamente esse limite; erros criptográficos diferentes continuam falhando. A regressão reproduz o limite remoto e compara os bytes com WebCrypto independente. A [diferença entre workerd local e managed edge está documentada pelo projeto](https://github.com/cloudflare/workerd/issues/1346). Não houve redução do fator de trabalho.

## Bloqueio operacional confirmado no edge

[Execução 39821485840](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/39821485840), commit d2d00c606cf1fae47ecb4b614688b1c964d212e2: typecheck, lint, **145 testes** e build aprovados. A espera pela propagação validou a sessão administrativa nova. Cadastro fictício, login e bloqueio de álbum antes da primeira troca passaram. A troca de senha retornou 503; Workers Observability registrou `outcome=exceededCpu`, 350 ms de CPU e `Worker exceeded CPU time limit.` em 2026-10-22T17:20:22Z.

A consulta somente leitura das assinaturas confirmou ausência de Workers Paid (R2 Paid já existe e é distinto). A configuração de preview agora declara 2000 ms de CPU; sua aplicação exige Workers Paid. Nenhuma assinatura ou cobrança foi alterada. O fator PBKDF2 permanece 310000, sem redução para contornar o orçamento. [Preços oficiais](https://developers.cloudflare.com/workers/platform/pricing/): Workers Paid tem mínimo de US$5/mês por conta, além de excedentes.

| Gate remoto | Resultado |
| --- | --- |
| Dois D1 e três buckets R2 privados, migrations | Aprovado |
| SSR, headers privados, gate de página e sessão administrativa nova | Aprovado |
| Cadastro, login e troca obrigatória exigida | Aprovado |
| Conclusão da troca de senha | Bloqueado por CPU do plano atual |
| Dez uploads, publicação, favoritos, download e revogação | Aprovados localmente; não executados remotamente nesta tentativa |
| Restauração D1/R2 e comparação de originais | Implementada; execução remota pendente |

Não houve merge ou deploy em produção. A homologação completa depende da autorização comercial para Workers Paid e da nova execução do piloto, além dos demais gates documentados. O código temporário do ensaio visual foi removido; nenhuma fixture de autenticação foi publicada. A captura do navegador não sincronizou com o workspace e não é apresentada como artifact disponível.

## Continuação do handoff — revisão de segurança (2026-10-22)

A PR #13 permanece em draft, sem merge e com PRIVATE_GALLERIES_ENABLED=false em produção. A conta Cloudflare e o Worker isolado de QA foram identificados por consulta somente leitura; nenhum billing, secret, binding ou Worker foi modificado nesta retomada.

- O workflow manual deploy.yml passou a exigir `github.ref == refs/heads/main` antes de qualquer deploy para environment=production, além da frase de confirmação já exigida. A branch de revisão não pode mais realizar este deploy manual acidentalmente.
- A validação de CLIENT_SESSION_SECRET foi centralizada para sessões e tokens de upload: mínimo de 32 bytes UTF-8 e valor distinto do ADMIN_SESSION_SECRET, com testes de regressão.
- CI da primeira correção, após commits 5523dfb/8ca16c1: [39859102047](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/39859102047), sucesso.
- A CI completa da segunda rodada (incluindo a correção do fixture de sessão adulterada) passou em [39860562898](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/39860562898): **148 testes em 38 arquivos**, typecheck, lint e build.
- Nova homologação remota isolada em [39860598691](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/39860598691): todos os testes e build passaram; dois D1 e três R2 QA conferidos. O deploy do Worker QA foi recusado pela Cloudflare com **código 100328**, mensagem **"CPU limits are not supported for the Free plan"** ao aplicar `limits.cpu_ms: 2000`. A operação encerrou sem trocar secrets, sem iniciar os fluxos de cliente, uploads ou restauração; artifact sanitizado `private-galleries-preview-report` informou `productionTouched: false`.
- O resultado confirma que **Workers Paid não está ativo** nesta conta em 2026-10-22, diferentemente de R2 Paid; qualquer assinatura é decisão comercial exclusiva do proprietário.

**NO-GO mantido:** habilitar Workers Paid mediante autorização, repetir preview até o relatório `passed`, homologar UI autenticada em 360/390/768 e em Android/iPhone reais, aprovar política LGPD de retenção e obter autorização explícita de merge e produção. Não reduzir PBKDF2/310000 nem desativar o limite de CPU para contornar o plano atual.

## Piloto Workers Free — alternativa B, 2026-10-23 UTC

**Evidência:** [GitHub Actions #39884123860](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/39884123860); artefato sanitizado `private-galleries-preview-report` (ID `12472306438`). Executado a partir da PR #13 em recursos isolados, no Worker `punctum-picture-albums-qa`. **Produção não alterada, Workers Paid não contratado.**

- CI da execução: **154 testes aprovados em 39 arquivos**, typecheck, lint e build concluídos com sucesso.
- Deploy real do preview no **Workers Free** sem `limits.cpu_ms`: concluído.
- Criação de conta `CLIENT_AUTH_MODE=access` sem senha PBKDF2 local e rotas legadas de senha bloqueadas.
- 10 uploads JPG/PNG/WebP **no piloto foram PNGs fictícios**, com rejeição de carga adulterada, publicação, favoritos, download com permissão, mídia pública negada e revogação.
- Restauração de **24 linhas D1** e **10 originais R2**, conferindo os bytes de cada objeto, verificada no preview restaurado; depois disso arquivamento, reset de sessão e desativação também passaram.
- Campo do artefato `productionTouched: false`; `authMode: "access"`; `status: "partial-access-setup-required"`; `accessProviderTested: false`.
- **Limite do piloto:** o acesso ao cliente no cenário E2E foi feito com sessão HMAC sintética criada pelo script usando segredo aleatório exclusivamente no QA isolado. **Não** validou o e-mail OTP e a assinatura JWT de uma aplicação Cloudflare Access **real**. Os testes criptográficos locais de JWT assinado/issuer/audience passaram, mas não substituem o login remoto de verdade.

**NO-GO operacional permanece:** configurar aplicativo Access Self-hosted de QA limitado a `/albuns/entrar`, copiar o team domain e audience para o ambiente preview, fazer login por código OTP em e-mail de teste e verificar bloqueio de e-mails desconhecidos/desativados. Ainda precisam de QA móvel real, LGPD aprovada, backup rotineiro R2 e aprovação de merge/ativação. O custo Workers Paid deixa de ser gate da opção B **para o que foi testado**; qualquer nova rota sob `exceededCpu` deve ser corrigida antes de produção, sem supor que todo tráfego futuro caberá no Free.

## Descoberta de permissões Cloudflare Access — 2026-10-23 UTC

Verificação de **leitura exclusivamente no ambiente preview**: [GitHub Actions #39885380716](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/39885380716), arquivo sanitizado `private-access-qa-discovery` (artifact ID `12471834810`). Script `scripts/private-access-qa-discovery.mjs`, commit `f399805b`.

- A conexão Cloudflare do usuário anunciou privilégios **Super Administrator**, incluindo `#access:read` e `#access:edit`.
- O GitHub Actions **não** utilizou uma Global API Key; identificou autenticação **API Token** em `CLOUDFLARE_API_TOKEN`. Portanto, privilégios globais do usuário e escopos do token não são intercambiáveis.
- Endpoint `GET /accounts/{id}/access/apps`: **HTTP 200**, lista permitida. Nenhum app específico para `punctum-picture-albums-qa.menezesx2k26.workers.dev/albuns/entrar` encontrado.
- Endpoint `GET /accounts/{id}/access/identity_providers`: **HTTP 200**, mas não encontrou IdP `onetimepin` no conjunto retornado.
- Endpoint `GET /accounts/{id}/access/organizations`: **HTTP 403**, falta de acesso efetivo via token atual ou restrição organizacional. Não foi possível derivar com segurança o team domain para JWT.
- **Nenhum POST/PUT/PATCH/DELETE enviado à API Access.** Não foi verificada capacidade de criar aplicativos nem de habilitar OTP. `productionTouched:false`.
- Próximo gate: habilitar/confirmar Zero Trust organization e One-time PIN no contexto certo; preferir um **API Token de menor privilégio**, com `Access: Apps and Policies Write` e `Access: Organizations, Identity Providers, and Groups Read`, no lugar de distribuir Global API Key. Configurar app restrito ao **hostname de QA e caminho único**, confirmar AUD e issuer, depois executar OTP real com conta fictícia.

**Não concluir que a Global API Key falhou:** ela **não** estava disponível ao job. O HTTP 403 refere-se exclusivamente à credencial atualmente configurada no workflow.
