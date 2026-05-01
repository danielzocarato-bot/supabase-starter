-- Promover a conta do usuário inicial para escritório (bootstrap manual)
update public.profiles
   set role = 'escritorio',
       cliente_id = null
 where id = '98ae2e21-5568-42c9-a0d2-3e09a3799fa0'
   and not exists (
     select 1 from public.profiles where role = 'escritorio'
   );