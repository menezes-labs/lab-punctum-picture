# Álbuns privados — minuta de retenção e atendimento LGPD

**Data:** 2026-10-22  
**Estado:** PROPOSTA OPERACIONAL — não aprovada pelo estúdio; **não habilita produção**.  
**Escopo:** `client_accounts`, `client_galleries`, `client_gallery_images`,
`client_gallery_upload_intents`, `client_gallery_favorites`, objetos
`client-galleries/*` do R2 privado, backups e auditoria.

Esta minuta organiza decisões do controlador e evidências de operação; não
substitui avaliação jurídica. Nenhuma pessoa real deve ser cadastrada no preview.

## 1. Inventário e finalidade

| Dado | Local de armazenamento | Finalidade | Acesso |
| --- | --- | --- | --- |
| Nome e e-mail do cliente | D1 `client_accounts` | Identificação e entrega da coleção | Administrador e titular autenticado, conforme API |
| Hash, salt, política de senha | D1 `client_accounts` | Autenticação | Worker e backup restrito; jamais exibidos ao cliente/admin |
| Título, texto, tema, capa e publicação | D1 `client_galleries` | Organização e entrega do álbum | Administrador e proprietário autenticado se publicado |
| Foto original, nome e metadados | R2 ORIGINALS privado e D1 `client_gallery_images` | Exibir / permitir download autorizado | Worker com autorização por requisição |
| Favoritos e intenções de envio | D1 | Escolha de fotografias e integridade do upload | Proprietário/administrador, conforme endpoint |
| Registros de auditoria e backups | D1 e R2 BACKUPS privado | Segurança, recuperação e prestação de contas | Operadores autorizados, com acesso restrito |

Fotos, nomes de arquivo, legendas, favoritos, hashes e backups podem
conter dados pessoais; fotografias podem expor dados pessoais sensíveis
conforme o contexto. Não publicar objetos privados em `r2.dev`,
domínios públicos ou indexadores.

## 2. Comportamento **já implementado** (não confundir com política aprovada)

- O acesso é revogado por desativação da conta, alteração de `session_version`,
  arquivamento ou despublicação do álbum.
- Uploads abandonados têm intent de 15 minutos e limpeza posterior;
  o trabalho agendado marca intents como expirados e remove os **objetos não
  prontos** após janela operacional, por padrão 24 horas. Não apaga fotos
  prontas nem necessariamente remove linhas de intents.
- Não existe expiração ou exclusão automática de fotos prontas, contas,
  galerias ou favoritos.
- O backup lógico de D1 inclui tabelas privadas, quando instaladas, com
  nomes, e-mails e hashes de senha. Rotinas atuais removem **objetos de
  backup lógico** por prazo de 7 dias (daily), 28 dias (weekly) e 183 dias
  (monthly); isso não apaga originais do R2.
- Não existe cópia automática diária de todo `client-galleries/*` para outro
  bucket: antes de produção é preciso decidir, implementar e testar a
  estratégia de recuperação de **originais R2**. O piloto de restauração em
  preview valida cópia byte a byte, mas sua execução remota segue bloqueada.
- A exclusão de contas/imagens é assistida, registrada e não automática.

## 3. Decisões obrigatórias do estúdio (não preenchidas pelo assistente)

| Tema | Decisão a registrar | Estado |
| --- | --- | --- |
| Controlador e responsável operacional | Identidade/contato de quem atende solicitações | PENDENTE |
| Base legal e informação ao titular | Texto de transparência, canal e base legal conforme serviço | PENDENTE |
| Fim da entrega/serviço | Evento que inicia o prazo de retenção de fotos e álbuns | PENDENTE |
| Originais/favoritos | Prazo pós-entrega, exceções documentadas e aviso ao cliente | PENDENTE |
| Contas e registros de autenticação | Prazo de conservação e critério de desativação/exclusão | PENDENTE |
| Auditoria e backups | Prazo justificado, acesso, restauração e eliminação após prazo | PENDENTE |
| Solicitações do titular | Canal, verificação de identidade, responsável e prazos | PENDENTE |
| Incidentes e suboperadores | Procedimento de resposta, registros e responsabilidades | PENDENTE |
| Estratégia de cópia R2 | Periodicidade, destino privado, integridade e teste de restauração | PENDENTE |

Nenhum prazo foi atribuído por suposição. A política final deverá considerar
obrigações contratuais, legais, direitos dos titulares e retenção de backups.

## 4. Procedimento proposto para acesso, exportação e exclusão

1. Abrir registro privado da solicitação, data, tipo e responsável. Confirmar a
   identidade do solicitante e sua legitimidade; não aceitar IDs de álbum como
   prova suficiente.
2. Localizar somente contas, galerias, imagens e favoritos relacionados ao
   titular. Verificar dados vinculados a terceiros presentes nas fotografias.
3. Para pedido de acesso/exportação, preparar pacote autorizado sem
   `password_hash`, `password_salt`, tokens ou segredos. Entregar por canal
   privado com expiração e controle de destinatário.
4. Para pedido de exclusão, aplicar imediatamente os controles de revogação
   autorizados; inventariar tabelas e chaves R2, avaliar retenção legal e cópias
   de backup. Antes da exclusão definitiva, preservar evidência de integridade
   e restauração quando exigida pela política aprovada.
5. Após autorização formal, excluir em ordem referencial apropriada:
   favoritos, intents, imagens, galerias, conta e originais R2 correspondentes;
   confirmar que não sobraram chaves órfãs.
6. Registrar resultado, exceções legais, períodos de retenção remanescente em
   backups e comunicação ao titular — sem incluir credenciais ou fotos em logs.

**Atenção:** nenhuma etapa de exclusão destrutiva deve ser automatizada antes
da aprovação de prazo, base legal, salvaguardas de backup e teste de restauração.

## 5. Evidências mínimas para o gate LGPD

- Política final aprovada pelo estúdio, data, versão e responsável.
- Comprovação do acesso exclusivamente autenticado e revogável.
- Registro de teste de exportação de cliente fictício sem dados de autenticação.
- Registro de teste de exclusão e restauração em recursos isolados, incluindo R2.
- Demonstração de que backup lógico e originais seguem ciclos definidos e
  que pedidos alcançam backups conforme a política aplicável.
- Procedimento para incidentes, canal de contato e responsabilidade operacional.

**Decisão de liberação:** `NO-GO` até todos os campos obrigatórios terem
decisão registrada e os testes de recuperação/exclusão serem executados. Esta
minuta não altera dados, secrets, planos, migrations nem produção.
