update public.cliente_operacoes
set cfop_servico_par = '1949_2949'
where tipo in ('nfse_tomada', 'documento_avulso')
  and cfop_servico_par = '1933_2933';

alter table public.cliente_operacoes
  alter column cfop_servico_par set default '1949_2949';