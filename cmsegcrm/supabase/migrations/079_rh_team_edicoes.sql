-- ═══════════════════════════════════════════════════════════════════════
-- Migration 079: Equipe RH com permissão de edição no módulo RH
--
-- Até a 044/063 só admin/líder escreviam nas tabelas do RH (funcionários,
-- documentos, cargos, benefícios, avaliações, treinamentos, banco de horas
-- e desligamentos). A equipe "RH" só conseguia escrever em rh_comissoes
-- (060) e rh_ferias (063).
--
-- Esta migration estende `is_rh_team()` para todas as tabelas e para o
-- bucket de storage `rh-documentos`, permitindo que a equipe RH:
--   • edite cadastros, documentos, cargos, benefícios, avaliações etc.
--   • envie/excluia arquivos de documentos.
--   • lance comissões com anexo (já existia via 060, mantido aqui).
-- ═══════════════════════════════════════════════════════════════════════

-- Helper combinado: admin/líder OU membro da equipe RH
create or replace function public.can_edit_rh()
returns boolean
language sql
stable
security definer
as $$
  select public.is_admin_or_lider() or public.is_rh_team();
$$;

-- ── rh_funcionarios ─────────────────────────────────────────────────────
drop policy if exists "rh_func_select" on public.rh_funcionarios;
drop policy if exists "rh_func_write"  on public.rh_funcionarios;

create policy "rh_func_select" on public.rh_funcionarios for select
  using (public.can_edit_rh() or user_id = auth.uid());
create policy "rh_func_write"  on public.rh_funcionarios for all
  using (public.can_edit_rh())
  with check (public.can_edit_rh());

-- ── tabelas filhas (mesmo padrão) ───────────────────────────────────────
do $$
declare
  t text;
  filhas text[] := array[
    'rh_documentos','rh_banco_horas','rh_avaliacoes',
    'rh_treinamentos','rh_beneficios'
  ];
begin
  foreach t in array filhas loop
    execute format('drop policy if exists "%1$I_select" on public.%1$I', t);
    execute format('drop policy if exists "%1$I_write"  on public.%1$I', t);
    execute format($f$
      create policy "%1$I_select" on public.%1$I for select
        using (public.can_edit_rh() or public.is_owner_funcionario(funcionario_id))
    $f$, t);
    execute format($f$
      create policy "%1$I_write" on public.%1$I for all
        using (public.can_edit_rh())
        with check (public.can_edit_rh())
    $f$, t);
  end loop;
end $$;

-- ── rh_cargos: leitura para autenticados; escrita admin/líder/RH ────────
drop policy if exists "rh_cargos_select" on public.rh_cargos;
drop policy if exists "rh_cargos_write"  on public.rh_cargos;
create policy "rh_cargos_select" on public.rh_cargos for select
  using (auth.role() = 'authenticated');
create policy "rh_cargos_write"  on public.rh_cargos for all
  using (public.can_edit_rh())
  with check (public.can_edit_rh());

-- ── rh_desligamentos: dado sensível; só admin/líder/RH ──────────────────
drop policy if exists "rh_desl_select" on public.rh_desligamentos;
drop policy if exists "rh_desl_write"  on public.rh_desligamentos;
create policy "rh_desl_select" on public.rh_desligamentos for select
  using (public.can_edit_rh());
create policy "rh_desl_write"  on public.rh_desligamentos for all
  using (public.can_edit_rh())
  with check (public.can_edit_rh());

-- ── rh_ferias: amplia escrita para equipe RH ────────────────────────────
-- (063 já contemplava `is_rh_team()`, mas usamos `can_edit_rh()` para
-- consolidar e garantir consistência).
drop policy if exists "rh_ferias_user_select"   on public.rh_ferias;
drop policy if exists "rh_ferias_user_insert"   on public.rh_ferias;
drop policy if exists "rh_ferias_user_update"   on public.rh_ferias;
drop policy if exists "rh_ferias_admin_delete"  on public.rh_ferias;

create policy "rh_ferias_user_select" on public.rh_ferias for select
  using (
    public.can_edit_rh() or exists (
      select 1 from public.rh_funcionarios f
       where f.id = rh_ferias.funcionario_id and f.user_id = auth.uid()
    )
  );

create policy "rh_ferias_user_insert" on public.rh_ferias for insert
  with check (
    public.can_edit_rh() or exists (
      select 1 from public.rh_funcionarios f
       where f.id = funcionario_id and f.user_id = auth.uid()
    )
  );

create policy "rh_ferias_user_update" on public.rh_ferias for update
  using (
    public.can_edit_rh() or exists (
      select 1 from public.rh_funcionarios f
       where f.id = rh_ferias.funcionario_id and f.user_id = auth.uid()
    )
  )
  with check (
    public.can_edit_rh() or exists (
      select 1 from public.rh_funcionarios f
       where f.id = funcionario_id and f.user_id = auth.uid()
    )
  );

create policy "rh_ferias_admin_delete" on public.rh_ferias for delete
  using (public.can_edit_rh());

-- ── rh_comissoes: garante que equipe RH lance/edite (já existia via 060) ─
-- Recriação idempotente para usar o helper único.
drop policy if exists rh_com_select on public.rh_comissoes;
drop policy if exists rh_com_insert on public.rh_comissoes;
drop policy if exists rh_com_update on public.rh_comissoes;
drop policy if exists rh_com_delete on public.rh_comissoes;

create policy rh_com_select on public.rh_comissoes
  for select using (public.can_edit_rh() or vendedor_id = auth.uid());
create policy rh_com_insert on public.rh_comissoes
  for insert with check (public.can_edit_rh());
create policy rh_com_update on public.rh_comissoes
  for update using (public.can_edit_rh() or vendedor_id = auth.uid())
              with check (public.can_edit_rh() or vendedor_id = auth.uid());
create policy rh_com_delete on public.rh_comissoes
  for delete using (public.can_edit_rh());

-- ── Storage bucket "rh-documentos": leitura/escrita/exclusão para RH ────
drop policy if exists "rh_doc_storage_select" on storage.objects;
create policy "rh_doc_storage_select" on storage.objects for select
  using (
    bucket_id = 'rh-documentos'
    and (
      public.can_edit_rh()
      or exists (
        select 1 from public.rh_documentos d
         where d.arquivo_url = name
           and public.is_owner_funcionario(d.funcionario_id)
      )
    )
  );

drop policy if exists "rh_doc_storage_write" on storage.objects;
create policy "rh_doc_storage_write" on storage.objects for insert
  with check (bucket_id = 'rh-documentos' and public.can_edit_rh());

drop policy if exists "rh_doc_storage_delete" on storage.objects;
create policy "rh_doc_storage_delete" on storage.objects for delete
  using (bucket_id = 'rh-documentos' and public.can_edit_rh());
