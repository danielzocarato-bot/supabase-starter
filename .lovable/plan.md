## Problema

O TXT gerado para `nfe_entrada` (layout `dominio_separador`, macro Excel) hoje produz **33 campos** por linha e **não inclui a chave de acesso da NF-e** (44 dígitos). O Domínio, ao importar entradas, exige a chave para amarrar a nota — sem ela a importação falha ou registra a nota sem chave.

A chave já existe no banco (`notas_fiscais.chave_nfe`) e já é selecionada na query (`gerar-txt-separador/index.ts` linha 256), apenas não está sendo escrita no arquivo.

## Onde inserir no layout

No layout macro do Domínio para entradas, a **chave de acesso é o campo 34**, logo após o último campo de COFINS (campo 33). É posição padrão "anexa ao final" dos 33 campos da macro — não desloca nenhum campo existente, apenas acrescenta uma coluna.

Posição final (apenas para `nfe_entrada`):

```text
... 32 R Aliq COFINS
    33 R Valor COFINS
    34 C Chave NF-e   ← NOVO (44 dígitos, sem máscara)
```

Para `nfe_saida` a chave normalmente não é exigida (a Domínio gera/valida pela emissão), então mantemos 33 campos. Mesmo assim, o mais seguro é **emitir a chave também na saída** (campo 34) — Domínio aceita campo extra e ignora se não usar. Confirmar com você abaixo.

## Mudança

Arquivo único: `supabase/functions/gerar-txt-separador/index.ts`

1. No bloco `else` (NF-e entrada/saída e doc avulso), após a linha 572 (`"" // 33 Valor COFINS`), acrescentar:
   ```ts
   digitsOnly(n.chave_nfe), // 34 C Chave NF-e (44 dígitos)
   ```
2. Para `documento_avulso` a chave normalmente é vazia → `digitsOnly` já devolve `""`, então fica em branco automaticamente. Sem tratamento extra.
3. NFS-e tomada (28 campos) **não muda** — layout 209 não tem chave.

Nada mais é tocado: contagem de campos do layout 209 e do bloco NFS-e ficam intactos, ordem dos campos 1–33 preservada.

## Pergunta antes de implementar

Confirmar 2 pontos:

1. Adiciono a chave no campo 34 **só para `nfe_entrada`**, ou **para entrada e saída** (mais seguro, Domínio ignora extra)?
2. Para notas de entrada **sem chave no banco** (raro, mas possível em importações antigas), prefere: (a) gerar campo vazio e deixar Domínio reclamar, ou (b) bloquear export listando essas notas como pendência, igual ao que já fazemos para classificação?