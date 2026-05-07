# Correção: ISS retido e alíquota ISS — NFS-e Tomadas

## Problema

O exportador `gerar-txt-separador` lê o `raw_data` da nota procurando chaves que **não existem** na planilha do UneCont:

- Procura `raw_data["Valor ISS Retido"]` → não existe na planilha → sai `0`
- Define alíquota ISS como literal `"0"` → fica sempre zerado

A planilha real tem colunas separadas para ISS dentro/fora do município (alíquota como decimal e valor) e o `importar-planilha` salva a row inteira em `raw_data`, então os dados estão lá — só o nome da chave está errado no exportador.

## Solução

Em `supabase/functions/gerar-txt-separador/index.ts`, dentro do bloco `if (isNfseTomada)`, ajustar o mapeamento dos campos 17 e 19 para ler as colunas corretas da planilha.

**Regra:** se houver valor em "ISS Dentro do Município" usa esse par; senão usa "Fora". Se ambos zerados, fica `0`.

### Mudanças exatas

Antes (campo 17 e 19):
```ts
const vISSRetido = formatValorBR(raw["Valor ISS Retido"]);
// ...
"0",                  // 17 Alíquota ISS
"0",                  // 18 Valor ISS Normal
vISSRetido,           // 19 Valor ISS Retido
```

Depois:
```ts
const issDentroVal = parseNum(raw["ISS Dentro do Município"]);
const issForaVal   = parseNum(raw["ISS Fora do Município"]);
const issDentroPct = parseNum(raw["% ISS Dentro do Município"]);
const issForaPct   = parseNum(raw["% ISS Fora do Município"]);

const usarDentro = issDentroVal > 0 || (issDentroPct > 0 && issForaVal === 0);
const valorIssRetido = usarDentro ? issDentroVal : issForaVal;
const aliquotaIssDecimal = usarDentro ? issDentroPct : issForaPct;
// planilha guarda como decimal (0.02). TXT espera 2 → multiplica por 100.
const aliquotaIss = formatValorBR(aliquotaIssDecimal * 100);
const vISSRetido  = formatValorBR(valorIssRetido);
// ...
aliquotaIss,          // 17 Alíquota ISS
"0",                  // 18 Valor ISS Normal
vISSRetido,           // 19 Valor ISS Retido
```

Os demais campos (IRRF, PIS, COFINS, CSLL, CSRF, INSS, Base ISS) já estão com nomes corretos na planilha — não mexer.

## Validação esperada

Para a NF do exemplo (Magon Consultoria, valor 10000, ISS Dentro 200, % ISS Dentro 0.02):

```
...;10000;10000;2;0;200;0;0;0;0;0;0;;;
       ^      ^   ^
    base=10000 alíq=2 retido=200
```

Que bate exatamente com o TXT aceito pela Domínio.

## Escopo

- Apenas `supabase/functions/gerar-txt-separador/index.ts`
- Sem migration, sem alteração de outras funções, sem mudança de UI
