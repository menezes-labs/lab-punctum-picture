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

Base antes da implementação: 108 testes em 25 arquivos, todos aprovados. Validação final: **140 testes aprovados em 36 arquivos**; npm run typecheck, npm run lint e npm run build concluídos com código 0. Lint sem erros nem avisos. Build emite apenas a observação já existente do vinext sobre classificação estática de rotas dinâmicas.

Revisão independente identificou três problemas importantes: PATCH concorrente poderia restaurar download revogado; parser confiava somente no Content-Length; limpeza não retomava após falha na exclusão. Cada problema teve reprodução RED e correção GREEN: atualização apenas de campos fornecidos, leitura JSON com limite real de 64 KiB e retomada de intents expirados até confirmar exclusão. O completed_at de um intent expired registra a conclusão da limpeza; de completed, registra a conclusão do upload.

Também foram corrigidos e cobertos por testes os cabeçalhos de redirecionamentos privados no entrypoint de produção, alertas de erro de favoritos dentro do dialog e as FKs compostas equivalentes no ORM. A revisão não encontrou divulgação de mídia entre clientes. Formatação mais extensa de alguns arquivos permanece melhoria de manutenção, sem efeito funcional.

Regressões existentes immersive-policy, portfolio, home-render-plan e deploy-workflow aprovadas. Nenhuma alteração em PhotoCarousel.tsx, HomeExperience.tsx, globals.css, app/lib/portfolio.ts ou assets públicos. Logo, o autorretrato vigente é mantido exatamente como encontrado na main.

## Pendências de homologação

- QA visual real 360/390/768/desktop, teclado/foco/Escape/setas e aparelhos Android Chrome/iPhone Safari. O navegador local não estava instalado e o download forneceu arquivo inválido; não há capturas aprovadas nem alegação de QA visual concluído.
- Deploy em preview isolado, smoke externo e restauração de D1/R2 em preview. Migrations locais 0001–0009 foram aplicadas com sucesso; isso não prova restauração remota.
- Política de retenção e aprovação do procedimento LGPD pelo estúdio, conforme runbook.
- Aprovação explícita para merge/main e ativação da flag. A implementação não executa esses passos.

Decisão atual: código para revisão; **NO-GO para ativação em produção** até fechamento dos gates acima. Rollback é desligar a flag, sem apagar tabelas ou originais.
