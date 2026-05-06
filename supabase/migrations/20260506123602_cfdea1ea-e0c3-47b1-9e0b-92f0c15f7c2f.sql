alter type tipo_operacao add value if not exists 'documento_avulso';

alter table public.notas_fiscais add column if not exists categoria_doc text;
comment on column public.notas_fiscais.categoria_doc is 'Subtipo do documento avulso: boleto, fatura, apolice. Null para NFSe/NFe.';

alter table public.notas_fiscais add column if not exists data_vencimento date;
comment on column public.notas_fiscais.data_vencimento is 'Data de vencimento do boleto/fatura. Null para NFSe/NFe.';

create index if not exists idx_notas_categoria_doc
  on public.notas_fiscais(categoria_doc)
  where categoria_doc is not null;