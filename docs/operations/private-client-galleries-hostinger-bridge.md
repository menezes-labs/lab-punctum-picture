# Punctum — plano B2: Hostinger Node.js como coprocessador de senhas

**Estado:** spike implementado em PR #13, DESATIVADO por padrão, sem deploy da Hostinger, sem migração e sem custos contratados. **Não aprovado para produção.**  
**Data da investigação:** 2026-10-23.

## Evidência de infraestrutura e limites da inferência

- A API Hostinger conectada lista um site do tipo `nodejs`, habilitado, em `darkslategrey-raccoon-448222.hostingersite.com`, mas não expõe qual código/GitHub está implantado. Uma tentativa de consulta HTTP pública não comprovou `/healthz` nem o vínculo com PersistFlow.
- `menezes-platform/ops-persistflow-sandbox` contém documentação de design de 2026-09-16, porém o README da `main` informa que a implementação **ainda não havia começado**; é uma sandbox de execução, não um Identity Provider. Fonte: https://github.com/menezes-platform/ops-persistflow-sandbox
- `menezes-platform/ops-codex-os/docs/persistflow-hostinger.md` documenta um control plane PersistFlow real em Hostinger Node.js. Sua autoridade e credenciais são distintas; **nunca adicionar rotas de cliente nele sem revisão de isolamento**.
- A existência de algum secret GitHub Hostinger não foi comprovada (escopos de org/env não acessados; nenhum valor consultado). O acesso Hostinger via conector ativo não é um secret automaticamente disponível no workflow GitHub.
- A cota específica de banco de 20 GB mencionada pelo proprietário não foi verificada nos metadados de assinatura; a implementação abaixo **não precisa do banco da Hostinger**.

## Escolha: terceirizar apenas CPU, não autenticação

```text
Browser Punctum (mesma origem)
   | POST /api/client/session (senha)
   v
Cloudflare Worker Free ---- D1 contas, salt e hash, rate limit
   | POST HTTPS assinado por HMAC (server-to-server)
   v
Hostinger Node.js ISOLADO
   | PBKDF2-SHA256 / 310000, native crypto.pbkdf2()
   v
JSON valid/credential sem cookie ou sessão
   |
   v
Worker: emite cookie HttpOnly e valida autorização D1 a cada rota
   |
   v
R2 originais privados, galeria e favoritos protegidos
```

Vantagens: o Punctum preserva o login nativo de senha temporária e troca obrigatória; não precisa copiar cliente/álbum para MySQL nem criar outra autoridade sobre permissões. Os 310 mil ciclos executam fora do Worker. A alternativa Access OTP continua existente e é **a escolha atual do preview**; usar Hostinger requer optar por `CLIENT_AUTH_MODE=password` explicitamente e reexecutar toda QA.

## Arquivos do spike

- `services/punctum-password-bridge/server.mjs` — serviço HTTP mínimo independente, endpoint interno `POST /internal/punctum-password/v1`, PBKDF2 nativo, HMAC SHA-256 de timestamp+nonce+body, resposta tipada, limite de tamanho de 4 KiB, fila simultânea limitada, proteção contra replay em memória e healthz sem credenciais.
- `services/punctum-password-bridge/index.mjs` — entrypoint Node que lê `PORT` e `PUNCTUM_PASSWORD_BRIDGE_SECRET`.
- `worker/client/password-provider.ts` — adaptador opcional HTTPS do Worker; serviço não responde ou fornece dados inválidos => 503 (falha fechada), sem fallback silencioso para derivação local. As rotas `client-admin` (create/reset), `client-session` (login/troca) optam pelo backend por binding.
- `tests/unit/client-password-provider.spec.ts` + `services/punctum-password-bridge/server.test.mjs` — HMAC, algoritmo, integridade, replay, fail-closed e compatibilidade.

## Configuração em ambiente isolado (NÃO executar ainda)

**Worker de QA:** `CLIENT_AUTH_MODE=password`, `CLIENT_PASSWORD_BACKEND=hostinger`, `CLIENT_PASSWORD_SERVICE_URL=https://<domínio-qa-com-ssl>/internal/punctum-password/v1`, secret `CLIENT_PASSWORD_SERVICE_SECRET` aleatório com 32+ bytes.

**Hostinger app QA dedicada:** `PORT`, `PUNCTUM_PASSWORD_BRIDGE_SECRET` (mesmo valor secreto do Worker; nunca commitar, incluir nos logs ou expor ao cliente). Deploy a partir de **repositório específico aprovado**, não automaticamente do espelho do PersistFlow. A app não necessita acesso a D1, R2, GitHub ou ao banco Hostinger.

**Requisitos adicionais antes de piloto remoto:**
1. Identificar dono, aplicação e GitHub de implantação do Node ativo; provar que não é a autoridade PersistFlow nem um ambiente compartilhado com secrets operacionais.
2. Hospedar um **serviço separado** ou caminho com isolamento equivalente; confirmar instância única para o replay cache em memória, ou trocar por store compartilhado atômico antes de múltiplas réplicas. Validar backups e políticas de acesso, rede e limitação de requisições na borda Hostinger.
3. Testar HMAC assinado pelo Worker real e assinaturas inválidas; requisições não autenticadas devem receber 401. Reexecutar login, primeiro acesso, recuperação de senha, rotação de chave, revogação de sessão, dez uploads, isolamento entre clientes e restauração R2/D1.
4. Testar falha de rede sem fallback, latência e capacidade. O request ao Hostinger contém senha em TLS e hash/salt apenas durante a autenticação; avaliar LGPD, residência e logs de proxies e **nunca registrar corpos HTTP**. Reduzir exposição e rotacionar a chave se comprometida.
5. Confirmar que apps ou fluxos automatizados da Hostinger não sobrescrevem o diretório e que backups não capturam secrets. Estabelecer healthcheck, plano de incidentes e rollback.
6. Aprovar mudança de `CLIENT_AUTH_MODE` e `CLIENT_PASSWORD_BACKEND` somente após QA. Não automatizar promoção para produção; manter `PRIVATE_GALLERIES_ENABLED=false` até aprovação explícita.

## Critérios de decisão

- **Cloudflare Access Free:** menos superfície própria, mas requer IdP OTP e configuração correta de organização/AUD. Se a app real for ativada, tende a ser melhor para operação contínua.
- **Hostinger CPU bridge:** preserva UX com senha, não usa DB Hostinger nem Workers Paid; adiciona dependência operacional e tratamento de senhas por segundo serviço. Útil se o Access Free ficar bloqueado e se houver **instância Node isolada, saudável e monitorada**.
- **Não reutilizar o controle PersistFlow:** sua disponibilidade não foi comprovada e sua função é coordenação de trabalhos, não autenticação de clientes de fotografia.

**DoD Hostinger bridge:** CI verde é apenas prova local; DoD global exige piloto remoto real, isolamento da app existente, incident/backup/LGPD, testes móveis e autorização de ativação.
