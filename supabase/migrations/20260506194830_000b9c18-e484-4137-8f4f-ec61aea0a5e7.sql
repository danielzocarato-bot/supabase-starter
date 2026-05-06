ALTER TABLE public.cliente_operacoes
ADD COLUMN IF NOT EXISTS cfop_servico_par text NOT NULL DEFAULT '1933_2933';

ALTER TABLE public.cliente_operacoes
DROP CONSTRAINT IF EXISTS cliente_operacoes_cfop_servico_par_check;

ALTER TABLE public.cliente_operacoes
ADD CONSTRAINT cliente_operacoes_cfop_servico_par_check
CHECK (cfop_servico_par IN ('1933_2933','1949_2949'));