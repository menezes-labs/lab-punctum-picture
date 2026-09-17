# Punctum — exportação somente leitura do armazenamento do ChatGPT Sites

## Objetivo

Gerar um snapshot completo e verificável do **estado persistente atual do Punctum no ChatGPT Sites**, sem alterar o site, sem publicar nova versão e sem escrever/apagar qualquer dado da origem.

Este documento é um handoff operacional para uma sessão do ChatGPT Work/Sites anexada ao Site Punctum atual.

## Fonte autoritativa

- Site público atual: `https://punctumpicture.com`
- Repositório: `menezes-labs/lab-punctum-picture`
- Branch de referência: `main`
- O vínculo com o hosting gerenciado está em `.openai/hosting.json`.
- Binding D1 gerenciado: `DB`
- Binding R2 gerenciado: `ORIGINALS`

O Git contém o aplicativo, mas **não contém todo o estado vivo de produção**.

## Regras obrigatórias de segurança

1. **Somente leitura na origem.**
2. NÃO alterar código.
3. NÃO criar commit.
4. NÃO salvar/publicar/deployar nova versão do Site.
5. NÃO alterar domínio, DNS, acesso ou compartilhamento.
6. NÃO executar migrations.
7. NÃO inserir, atualizar ou apagar linhas do D1.
8. NÃO inserir, atualizar ou apagar objetos do R2.
9. NÃO revelar secrets do Site.
10. Se alguma operação de exportação não for suportada pelas ferramentas disponíveis, pare e descreva exatamente a limitação; não improvise uma operação mutável.

## Exportação D1

Use o binding gerenciado `DB` e produza um artefato chamado:

`punctum-source-d1-full.json`

O artefato deve conter:

- data/hora UTC da captura;
- lista de tabelas existentes;
- definição/schema disponível de cada tabela;
- nomes das colunas;
- todas as linhas de todas as tabelas de aplicação;
- contagem de linhas por tabela.

A descoberta das tabelas deve vir do banco real (por exemplo, catálogo SQLite), não de uma lista histórica hardcoded.

As tabelas críticas que **obrigatoriamente precisam aparecer se existirem na origem** incluem:

- `site_settings`
- `categories`
- `albums`
- `album_categories`
- `images`
- `upload_intents`
- `inquiries`
- `audit_log`
- `backup_runs`
- `rate_limit_buckets`
- `site_config`
- `site_config_versions`
- `site_config_pointers`
- `admin_credentials`

`site_config_versions` e `site_config_pointers` são críticas: elas preservam o draft atual, publicação atual e histórico/restaurações do Punctum Studio.

Não é necessário exportar valores de secrets do ambiente. Credenciais/secrets de runtime serão recriados no destino. Se a ferramenta classificar `admin_credentials` como material de credencial e impedir a exportação dos valores, registre essa tabela, sua contagem e a limitação no relatório; **não contorne a proteção**.

## Exportação R2

Use o binding gerenciado `ORIGINALS` e produza:

1. `punctum-source-r2-manifest.json`
2. um ou mais arquivos contendo **todos os objetos originais** do bucket.

O manifesto deve registrar, para cada objeto quando disponível:

- `key` completa;
- tamanho em bytes;
- ETag/checksum;
- content type / HTTP metadata;
- custom metadata;
- data de upload.

Preserve a key/caminho original de cada objeto no arquivo exportado.

Preferência de empacotamento:

- `punctum-source-r2-originals.zip`, se o tamanho permitir;
- se houver limite de artefato, dividir deterministicamente em partes numeradas (`part-001`, `part-002`, ...), sem omitir nenhum objeto.

Não transforme, recomprima ou redimensione imagens. Precisamos dos bytes originais armazenados no R2.

## Relatório de integridade

Produza também:

`punctum-source-export-report.json`

Com no mínimo:

- timestamp UTC;
- project id identificado em `.openai/hosting.json`;
- nome dos bindings usados;
- contagem de tabelas;
- row count de cada tabela;
- quantidade total de objetos R2;
- total de bytes R2;
- lista de artefatos gerados;
- SHA-256 dos artefatos, quando a ferramenta permitir;
- quaisquer limitações encontradas.

## Sanity checks conhecidos da produção pública

Estes números vêm de uma auditoria HTTP realizada antes desta exportação e servem apenas como verificação, não como fonte de verdade do banco:

- 16 álbuns publicados;
- 192 fotografias públicas;
- 7 categorias públicas;
- existem os álbuns dinâmicos `jogo-do-gremio`, `lugar-ao-sol` e `beach-tennis`;
- o SiteConfig publicado usa `identity.sourcePresetId = "aconchegante-organico"`;
- tipografia publicada: `fraunces` nos títulos e `nunito-sans` no corpo;
- hero da home publicado: variante `split`;
- seção about publicada: variante `side-portrait`.

O banco pode conter mais registros que os números públicos por causa de drafts, arquivados, soft deletes, histórico e dados administrativos. **Não filtre o export pelos números públicos.**

## Resultado esperado da sessão

Ao terminar, responda com:

1. confirmação explícita de que nenhuma escrita/deploy/publicação ocorreu;
2. resumo das contagens D1/R2;
3. os arquivos exportados disponíveis para download;
4. limitações, se houver.

Não altere o site para facilitar a exportação. Esta sessão existe apenas para retirar uma cópia fiel do estado persistente atual.
