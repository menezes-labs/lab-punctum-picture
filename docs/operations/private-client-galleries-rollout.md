# Álbuns privados — operação e rollout

O módulo é aditivo e vem desligado. Não executar comandos remotos nem merge sem autorização do responsável. A main aplica migrations e publica automaticamente.

## Pré-requisitos para piloto

1. D1, R2 ORIGINALS e BACKUPS exclusivos de preview, sem dados reais. Manter R2 privado, sem domínio público e sem r2.dev; nunca compartilhar um bucket público de originais.
2. Aplicar migrations 0001–0009 apenas no ambiente autorizado. O SQL 0009 não altera tabelas públicas.
3. Criar CLIENT_SESSION_SECRET aleatório com pelo menos 32 bytes, independente de ADMIN_SESSION_SECRET, como secret do Worker. Nunca colocá-lo em vars versionadas ou logs.
4. Configurar PRIVATE_GALLERIES_ENABLED='true' apenas no preview autorizado; SITE_ORIGIN deve ser exatamente a origem acessada.
5. O workflow gera PRIVATE_GALLERIES_ENABLED='false' a cada deploy. Uma ativação de produção exige alteração explícita e revisada desse valor no workflow e na configuração do ambiente.

## Homologação

Criar duas contas fictícias e álbuns de teste com pelo menos 10 fotos. Verificar primeiro login/troca de senha, publicação/capa/ordem, favoritos, permissões de download, logout, reset/desativação e arquivamento. Cada alteração deve valer na próxima requisição. Tentar IDs de outro cliente e mídia pública/otimizador: nenhum byte privado pode retornar.

Validar UI 360/390/768/desktop, teclado, Escape/setas/foco no visualizador e redução de movimento. Comparar home/lente/carrossel/autorretrato. Rodar typecheck, lint, npm test e build. Testes locais não substituem Safari/Chrome em aparelhos reais nem um preview implantado.

## Retenção, exportação e exclusão

Antes de ativar produção, o estúdio deve aprovar e registrar prazo de retenção, responsável por pedidos LGPD e prazo de atendimento. Não há purge automático de fotos prontas. A [minuta de decisão LGPD](./private-client-galleries-lgpd-decision.md) inventaria dados, ciclos efetivos de backup e campos ainda pendentes. A minuta **não é uma política aprovada** e não autoriza tratamento adicional ou exclusão.

Exportação assistida: verificar a identidade do titular e autorização do estúdio; exportar somente client_accounts sem hashes/salts, suas galerias/imagens/favoritos e originais correspondentes. Entregar por canal privado autorizado. Não criar links públicos.

Exclusão assistida: após autorização registrada e avaliação de retenção, desativar conta e arquivar galerias imediatamente. Inventariar originais e relacionamentos; realizar export/backup e confirmar restauração antes de qualquer exclusão. Excluir em ordem favoritos, intents, imagens, galerias e conta, então objetos R2 correspondentes. Registrar a operação sem credenciais e considerar a retenção de backups na resposta ao titular. O módulo não automatiza essa operação destrutiva.

## Backup e restauração

O backup lógico diário inclui as cinco tabelas privadas quando instaladas, mesmo com a flag desligada. O arquivo de backup contém hashes e dados pessoais: somente bucket BACKUPS privado, acessível a operadores autorizados. O agendamento não duplica originais R2; criar cópia privada de todos os objetos client-galleries/ no procedimento operacional de backup antes de liberar o piloto. Nunca excluir o bucket de origem.

Em preview vazio, restaurar primeiro contas, depois galerias (cover_image_id não tem FK circular), imagens, intents e favoritos. Restaurar também objetos R2 com as mesmas chaves/metadados. Conferir contagens, hashes dos bytes e autenticação de uma conta fictícia. O teste de restauração remoto é gate pendente até sua execução; não afirmá-lo aprovado apenas pelo backup.

## Incidente e rollback

Limites de JSON privado são verificados pelos bytes lidos, inclusive sem Content-Length, com máximo de 64 KiB. A limpeza de uploads retoma intents expired sem completed_at; somente após excluir o objeto grava a conclusão. Objetos prontos são excluídos dessa rotina em todas as tentativas.

1. Desligar PRIVATE_GALLERIES_ENABLED no Worker/fluxo de deploy; todas as páginas/APIs/mídias novas passam a 404 sem apagar dados.
2. Para uma conta, desativar pelo painel ou incrementar session_version em operação autorizada. Para um álbum, arquivar/despublicar.
3. Se houver suspeita de segredo comprometido, rotacionar CLIENT_SESSION_SECRET. Cookies antigos deixam de autenticar.
4. Preservar logs/auditoria e backups com acesso restrito; registrar IDs e horários, nunca senhas/cookies.
5. Corrigir em branch isolada e repetir QA. Não reverter migration com DROP. A restauração e a reabertura de acesso requerem decisão do responsável.

Uploads abandonados expiram e a limpeza existente remove apenas objetos não prontos após a janela configurada; fotos prontas e favoritas permanecem.

## Workflow de homologação isolada

Executar Deploy (deploy.yml) na branch de revisão com environment=preview. Exige os secrets CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN e CLOUDFLARE_D1_API_TOKEN no ambiente preview/repositório. O script recusa outros accounts, IDs de D1 de produção e execução fora do GitHub Actions; substitui rotas, bindings, segredos e cron. Nenhum recurso de produção é reutilizado. O artifact private-galleries-preview-report contém somente o JSON sanitizado, sem originais, senhas ou cookies. Recursos QA são preservados para inspeção e não contêm clientes reais.

## Orçamento de CPU — pré-requisito confirmado

A derivação PBKDF2-SHA256/310000 pode exigir implementação JS no edge, pois o WebCrypto gerenciado limita a chamada nativa a 100000 iterações. O piloto confirmou excesso de CPU no Workers Free durante a troca de senha. Exigir Workers Paid e orçamento de pelo menos 2000 ms por invocação para homologar este módulo. A configuração de preview já declara esse teto; produção permanece sem alteração e com a flag desligada. Antes de ativar em produção, confirmar o plano e orçamento efetivos do Worker de produção.

Habilitar o plano é uma mudança comercial na conta e exige autorização do proprietário: mínimo de US$5/mês mais excedentes conforme https://developers.cloudflare.com/workers/platform/pricing/. R2 Paid não habilita Workers Paid. Após a autorização e ativação do plano, executar novamente Deploy/preview e exigir o relatório passed antes de fechar o gate de restauração. Nunca reduzir o fator de trabalho da senha para fazer o piloto passar no plano gratuito.
