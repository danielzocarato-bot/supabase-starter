## Objetivo

Corrigir o layout de exportação de **NFS-e Tomadas** (`tipo = nfse_tomada`) no edge function `gerar-txt-separador`, gerando os **28 campos** corretos do leiaute Domínio (em vez dos 33 campos do layout NF-e).

## Escopo

**Arquivo único alterado:** `supabase/functions/gerar-txt-separador/index.ts`

Nenhuma migration, nenhuma mudança de schema, nenhuma outra função/tela tocada.

## Mudança

Bifurcar a montagem do array `campos` no loop de geração:

- Se `isNfseTomada` → emitir 28 campos (layout NFS Tomados).
- Caso contrário (NF-e entrada/saída e documento_avulso) → manter os 33 campos atuais sem qualquer alteração.

### Mapeamento dos 28 campos

| # | Campo | Origem |
|---|-------|--------|
| 1 | CPF/CNPJ | `prestador_cnpj` com máscara |
| 2 | Razão Social | **vazio** |
| 3 | UF | **vazio** |
| 4 | Município | **vazio** |
| 5 | Endereço | **vazio** |
| 6 | Número Documento | `numero_nfe` |
| 7 | Série | `pickSerie(raw_data)` |
| 8 | Data Emissão | `emissao_nfe` em dd/mm/aaaa |
| 9 | Data de Entrada | mesma data de emissão |
| 10 | Situação | `0` ou `2` (cancelada) |
| 11 | Acumulador | `acumuladores.codigo` |
| 12 | CFOP | par configurado em `cliente_operacoes.cfop_servico_par` (1933/1949) |
| 13 | Valor Serviços | `valor_nfe` |
| 14 | Valor Descontos | `desconto` |
| 15 | Valor Contábil | `valor_contabil` (ou `valor_nfe - desconto`) |
| 16 | Base de Cálculo | `raw_data->>'Base de Cálculo ISS'` ou `0` |
| 17 | Alíquota ISS | `0` (não disponível na planilha) |
| 18 | Valor ISS Normal | `0` |
| 19 | Valor ISS Retido | `raw_data->>'Valor ISS Retido'` ou `0` |
| 20 | Valor IRRF | `raw_data->>'Valor IRRF'` ou `0` |
| 21 | Valor PIS | `raw_data->>'Valor PIS'` ou `0` |
| 22 | Valor COFINS | `raw_data->>'Valor COFINS'` ou `0` |
| 23 | Valor CSLL | `raw_data->>'Valor CSLL'` ou `0` |
| 24 | Valor CRF | `raw_data->>'Valor CSRF'` ou `0` |
| 25 | Valor INSS | `raw_data->>'Valor INSS'` ou `0` |
| 26 | Código do Item | vazio |
| 27 | Quantidade | vazio |
| 28 | Valor Unitário | vazio |

### Detalhes técnicos

- Reaproveita helpers existentes: `formatValorBR`, `formatInt`, `formatDateBR`, `formatCnpjMask`, `parseNum`, `toLatin1Bytes`.
- Mantém separador `;`, CRLF, encoding Latin-1, zeros como `"0"`.
- Mantém o nome do arquivo (`dominio_209_<cnpj>_<periodo>_nfse_tomada.txt`) e o `formato` da auditoria (`dominio_layout_209`).
- Mantém o cálculo de CFOP via `cfop_servico_par` (já implementado no ramo `semItens`) para o campo 12.
- Mantém a verificação de pendências de classificação já existente.

## Validação esperada

Linha gerada no formato:
```
62.081.888/0001-91;;;;;13;E;30/04/2026;30/04/2026;0;2500;1933;10000;0;10000;10000;0;0;200;0;0;0;0;0;0;;;
```
(idêntico ao TXT exemplo aceito pela Domínio).
