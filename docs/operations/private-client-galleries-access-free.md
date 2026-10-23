# Punctum Picture — alternativa sem Workers Paid (Cloudflare Access Free)

**Estado em 2026-10-22:** IMPLEMENTAÇÃO EM PR / NÃO ATIVADA EM PRODUÇÃO.  
**Gate:** requer aplicativo real Cloudflare Access, teste de login por e-mail no edge e piloto completo.  
**Não altera:** lente, carrossel, autorretrato, portfólio público e publicação existente.

## Decisão técnica

Usar Cloudflare Access como provedor de identidade com One-time PIN (OTP) por e-mail, somente para **entrar** nos álbuns privados. A aplicação mantém a autorização por cliente/galeria no D1 e seus próprios cookies HTTP-only HMAC de 12 horas. A validação de senha PBKDF2/310000 continua no código de compatibilidade, mas não é executada quando `CLIENT_AUTH_MODE=access`. A troca de modo altera a audience assinada do cookie, invalidando sessões do modo anterior.

Segundo a página pública de preços da Cloudflare, o Zero Trust/Access Free é destinado a até 50 usuários, com condições próprias; ultrapassar esse volume requer reavaliar plano/custo. Workers Free ainda impõe 10 ms de CPU por requisição: a mudança **remove a maior fonte comprovada de CPU**, mas não garante que todos os fluxos do Worker cumpram esse teto. Referências:
- https://www.cloudflare.com/plans/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/

## Arquitetura e configuração

1. Criar **aplicativo Access Self-hosted para o caminho exato `/albuns/entrar`**, na origem autorizada do Punctum. Não proteger `punctumpicture.com/*` (o portfólio público deve permanecer público). Configurar login One-time PIN por e-mail e política de acesso adequada ao estúdio. A app exige sessão Access antes de repassar esse caminho ao Worker.
2. Configurar `CLIENT_AUTH_MODE=access`, `CLIENT_ACCESS_TEAM_DOMAIN=<team>.cloudflareaccess.com` e `CLIENT_ACCESS_AUD=<audience da app de álbuns>` nos bindings **apenas** do Worker escolhido. O AUD da app de clientes deve ser independente do Access administrativo. Validar que nenhuma variável contém domínio/segredo de produção no QA. O binding team domain está restrito por código a `*.cloudflareaccess.com`, HTTPS.
3. Requisitar `/albuns/entrar`: Cloudflare Access envia `Cf-Access-Jwt-Assertion`, o Worker confirma criptograficamente assinatura RS256, emissor, audience, expiração e e-mail, em seguida localiza o cliente **ativo** no D1 e emite `punctum_client_session` próprio. Sem JWT válido, sem conta cadastrada, desativada ou com `must_change_password=1`, o login falha. Nunca confiar apenas em `Cf-Access-Authenticated-User-Email`.
4. Demais caminhos privados `/albuns`, `/api/client/*` e mídia continuam exigindo cookie assinado e autorização atual por D1. Downloads continuam condicionados ao estado do álbum e à permissão. A conta do cliente não vira administrador.
5. Logout limpa o cookie da aplicação e direciona para `/cdn-cgi/access/logout` no domínio; o endpoint Cloudflare revoga a sessão de identidade. Revogação imediata dos **cookies da aplicação** depende de desativar cliente ou incrementar `session_version` (ação administrativa). O logout do Access afeta também outras apps Access do usuário.
6. Cadastro admin em modo Access deixa de executar PBKDF2 ou exibir senha temporária. Os campos de senha existentes na migration 0009 recebem marcadores `ACCESS_ONLY` não utilizáveis; `password_iterations=310000` preserva o CHECK sem efetuar derivação. A ação administrativa antes denominada `reset-password` passa a **revogar sessões e reenquadrar conta** em Access, sem devolver senha. Clientes legados com `must_change_password=1` precisam desse reenquadramento **antes** de acessar via OTP.
7. A feature flag `PRIVATE_GALLERIES_ENABLED=false` permanece obrigatória em produção até autorização. `CLIENT_AUTH_MODE=access` sozinho não habilita nenhuma galeria.

## Critérios de QA que não podem ser simulados

- App Access REAL registrada no domínio/rota correta, One-time PIN entregue a e-mail fictício autorizado de QA, jwt e audience da app real validados no Worker.
- E-mail não cadastrado no D1 e cliente desativado bloqueados, mesmo após passar pelo Access.
- Logout, login novamente, cookie legado e troca de modo rejeitados.
- Fluxos de upload, publicação, favoritos, download, exclusão de acesso e restauração aprovados no edge Free sem `exceededCpu`.
- Browser desktop e dispositivos Android/iPhone reais; nenhum vazamento do portfólio, lente ou carrossel.
- Política LGPD do estúdio e estratégia de cópia privada dos originais R2 aprovadas.

## Limitação do piloto automatizado no preview

O workflow `Deploy` com `environment=preview` utiliza somente D1 e R2 isolados, não aplica `limits.cpu_ms` quando o modo é Access e exige `PRIVATE_GALLERY_PREVIEW_AUTH_MODE=access`. A configuração dos testes inclui team domain/AUD **marcadores**, sem app Access real.

Para conseguir verificar as rotas internas (álbum, uploads, favoritos, download, revogação, restauração), o script gera uma **sessão HMAC exclusivamente de QA** com um segredo aleatório do Worker preview, sem forjar um JWT do Cloudflare Access. Esse cookie nunca é exportado em artefatos. O relatório declara `accessProviderTested:false` e `status:partial-access-setup-required`, mesmo quando as rotas de QA passam.

**A sessão sintética do piloto não demonstra o login real por e-mail** e não fecha o DoD. O teste real exige configurar a app Access na conta autorizada e repetir as provas; não usar a modalidade sintética para conceder acesso a clientes reais.

## Restrições de custos e rollback

- Não contratar Workers Paid nem alterar billing por conta da alternativa Free.
- Não reduzir número de iterações de senhas antigas (compatibilidade, sem uso neste modo).
- Se 50 usuários Access ou 10 ms de Worker forem excedidos, reavaliar arquitetura/custos com o estúdio — sem prometer escalabilidade ilimitada.
- Rollback operacional: desabilitar `PRIVATE_GALLERIES_ENABLED` (não remover D1 nem apagar fotos), revalidar rotas 404 e cookies. Um retorno futuro para senha demanda cadastro/redefinição formal de credenciais; marcadores `ACCESS_ONLY` são inutilizáveis.
