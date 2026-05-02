create or replace function public.dashboard_atencao()
returns table (
  competencia_id uuid,
  cliente_id uuid,
  cliente_razao text,
  periodo text,
  tipo tipo_operacao,
  status competencia_status,
  total_notas integer,
  notas_classificadas integer,
  pct numeric,
  motivo text,
  dias_parado integer,
  ultima_atividade timestamptz
)
language sql
security definer
set search_path = public
as $$
  with ultimas as (
    select c.id as cid,
           greatest(
             c.created_at,
             coalesce((select max(classificado_em) from public.notas_fiscais where competencia_id = c.id), c.created_at),
             coalesce((select max(i.classificado_em) from public.notas_fiscais_itens i
                      join public.notas_fiscais n on n.id = i.nota_id
                      where n.competencia_id = c.id), c.created_at)
           ) as ultima
    from public.competencias c
  )
  select
    c.id,
    c.cliente_id,
    cli.razao_social,
    c.periodo,
    c.tipo,
    c.status,
    c.total_notas,
    c.notas_classificadas,
    case
      when c.total_notas > 0 then round((c.notas_classificadas::numeric / c.total_notas) * 100, 0)
      else 0
    end as pct,
    case
      when c.status = 'concluida' then 'pronta_exportar'
      when c.status = 'aberta' and c.notas_classificadas = 0 and c.total_notas > 0
           and u.ultima < (now() - interval '5 days') then 'parada_sem_progresso'
      when c.status = 'aberta' and c.notas_classificadas > 0 and c.notas_classificadas < c.total_notas
           and u.ultima < (now() - interval '5 days') then 'parada_progresso_parcial'
      else null
    end as motivo,
    extract(day from now() - u.ultima)::integer as dias_parado,
    u.ultima
  from public.competencias c
  join public.clientes cli on cli.id = c.cliente_id
  join ultimas u on u.cid = c.id
  where (select role from public.profiles where id = auth.uid()) = 'escritorio'
    and cli.ativo = true
    and (
      c.status = 'concluida'
      or (c.status = 'aberta' and c.total_notas > 0 and u.ultima < (now() - interval '5 days'))
    )
  order by
    case
      when c.status = 'concluida' then 1
      when u.ultima < (now() - interval '10 days') then 2
      else 3
    end,
    u.ultima asc
  limit 15;
$$;

grant execute on function public.dashboard_atencao() to authenticated;

create or replace function public.dashboard_em_andamento()
returns table (
  competencia_id uuid,
  cliente_id uuid,
  cliente_razao text,
  periodo text,
  tipo tipo_operacao,
  status competencia_status,
  total_notas integer,
  notas_classificadas integer,
  pct numeric,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.cliente_id,
    cli.razao_social,
    c.periodo,
    c.tipo,
    c.status,
    c.total_notas,
    c.notas_classificadas,
    case
      when c.total_notas > 0 then round((c.notas_classificadas::numeric / c.total_notas) * 100, 0)
      else 0
    end as pct,
    c.created_at
  from public.competencias c
  join public.clientes cli on cli.id = c.cliente_id
  where (select role from public.profiles where id = auth.uid()) = 'escritorio'
    and cli.ativo = true
    and c.status in ('aberta', 'concluida')
  order by
    case c.status when 'concluida' then 1 when 'aberta' then 2 else 3 end,
    c.periodo desc,
    cli.razao_social asc
  limit 50;
$$;

grant execute on function public.dashboard_em_andamento() to authenticated;