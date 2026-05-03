-- ─────────────────────────────────────────────────────────────
-- 063_rh_ferias_documentos.sql
-- (1) Férias: usuário comum pode SOLICITAR e ver as próprias férias.
--     Líder/RH/admin aprova, recusa ou marca como 'ajustes' para
--     pedir mais informações ao colaborador (campo motivo_ajustes).
-- (2) Documentos: campo descrição para a biblioteca de docs.
-- ─────────────────────────────────────────────────────────────

-- Helper: é membro da equipe RH (idem 060)
create or replace function public.is_rh_team()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (select true
       from public.equipe_membros em
       join public.equipes e on e.id = em.equipe_id
      where em.user_id = auth.uid()
        and public.pt_norm(e.nome) = public.pt_norm('RH')
      limit 1),
    false
  ) or exists (
    select 1 from public.users u
     where u.id = auth.uid() and u.role = 'admin'
  );
$$;

-- Férias: novos campos + status 'ajustes'
alter table public.rh_ferias
  add column if not exists motivo_ajustes text,
  add column if not exists justificativa  text;

alter table public.rh_ferias drop constraint if exists rh_ferias_status_check;
alter table public.rh_ferias add constraint rh_ferias_status_check
  check (status in ('solicitada','aprovada','recusada','ajustes','cancelada','gozada'));

-- RLS: substitui as policies antigas (que eram só admin/lider)
drop policy if exists "rh_ferias_select" on public.rh_ferias;
drop policy if exists "rh_ferias_write"  on public.rh_ferias;
drop policy if exists "rh_ferias_user_select" on public.rh_ferias;
drop policy if exists "rh_ferias_user_insert" on public.rh_ferias;
drop policy if exists "rh_ferias_user_update" on public.rh_ferias;
drop policy if exists "rh_ferias_admin_all"   on public.rh_ferias;

-- SELECT: RH/admin/lider vê todas; usuário comum vê apenas as próprias
create policy "rh_ferias_user_select" on public.rh_ferias
  for select using (
    public.is_rh_team()
    or public.is_admin_or_lider()
    or exists (
      select 1 from public.rh_funcionarios f
       where f.id = rh_ferias.funcionario_id and f.user_id = auth.uid()
    )
  );

-- INSERT: usuário pode solicitar para si mesmo (status='solicitada')
create policy "rh_ferias_user_insert" on public.rh_ferias
  for insert with check (
    public.is_rh_team()
    or public.is_admin_or_lider()
    or exists (
      select 1 from public.rh_funcionarios f
       where f.id = funcionario_id and f.user_id = auth.uid()
    )
  );

-- UPDATE: RH/admin/lider tudo; usuário pode CANCELAR a própria
create policy "rh_ferias_user_update" on public.rh_ferias
  for update using (
    public.is_rh_team() or public.is_admin_or_lider() or exists (
      select 1 from public.rh_funcionarios f
       where f.id = rh_ferias.funcionario_id and f.user_id = auth.uid()
    )
  ) with check (
    public.is_rh_team() or public.is_admin_or_lider() or exists (
      select 1 from public.rh_funcionarios f
       where f.id = funcionario_id and f.user_id = auth.uid()
    )
  );

-- DELETE: só RH/admin/lider
create policy "rh_ferias_admin_delete" on public.rh_ferias
  for delete using (public.is_rh_team() or public.is_admin_or_lider());

-- Documentos: campo descrição (biblioteca)
alter table public.rh_documentos
  add column if not exists descricao text;

create index if not exists rh_doc_descricao_idx
  on public.rh_documentos using gin (to_tsvector('portuguese', coalesce(descricao,'')));
