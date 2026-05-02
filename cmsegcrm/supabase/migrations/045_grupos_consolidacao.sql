-- ─────────────────────────────────────────────────────────────
-- 045_grupos_consolidacao.sql
-- Grupos de mensagens já existem desde 012 (mensagens_grupos /
-- mensagens_grupo_membros + mensagens_internas.grupo_id).
-- Este arquivo:
--   1) Remove as tabelas/colunas duplicadas que a 043 criou
--      (grupos_mensagens, grupo_membros, mensagens_internas.para_grupo_id
--       e a constraint mensagens_destino_xor).
--   2) Restringe a criação de grupos a admin/lider.
-- ─────────────────────────────────────────────────────────────

-- 1) Limpa duplicatas
alter table public.mensagens_internas
  drop constraint if exists mensagens_destino_xor;
alter table public.mensagens_internas
  drop column if exists para_grupo_id;

drop table if exists public.grupo_membros    cascade;
drop table if exists public.grupos_mensagens cascade;

-- 2) Restringe criação a admin/lider
drop policy if exists "auth_cria_grupo" on public.mensagens_grupos;
create policy "lider_admin_cria_grupo" on public.mensagens_grupos
  for insert with check (
    auth.uid() = criado_por
    and exists (
      select 1 from public.users u
       where u.id = auth.uid() and u.role in ('admin','lider')
    )
  );
