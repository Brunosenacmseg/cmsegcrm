-- ─────────────────────────────────────────────────────────────
-- 044_rh_rls_e_storage.sql
-- A) RLS revisada: líder vê tudo; usuário vê o próprio cadastro
--    e seus dados (férias, documentos, avaliações, treinamentos,
--    benefícios, banco de horas). Edição: admin/líder.
-- B) Bucket "rh-documentos" no Supabase Storage + policies.
-- ─────────────────────────────────────────────────────────────

-- Helper: verifica se o uid logado tem papel admin OU lider
create or replace function public.is_admin_or_lider()
returns boolean language sql stable as $$
  select exists (
    select 1 from public.users u
     where u.id = auth.uid() and u.role in ('admin','lider')
  );
$$;

-- Helper: dado um funcionario_id, verifica se o uid logado é o "dono"
-- (o user_id atrelado a esse funcionário é o próprio).
create or replace function public.is_owner_funcionario(fid uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.rh_funcionarios f
     where f.id = fid and f.user_id = auth.uid()
  );
$$;

-- ── RH_FUNCIONARIOS ──────────────────────────────────────────
drop policy if exists "auth_le_rh_funcionarios"      on public.rh_funcionarios;
drop policy if exists "admin_escreve_rh_funcionarios" on public.rh_funcionarios;

create policy "rh_func_select" on public.rh_funcionarios for select
  using (public.is_admin_or_lider() or user_id = auth.uid());
create policy "rh_func_write"  on public.rh_funcionarios for all
  using (public.is_admin_or_lider());

-- ── Tabelas filhas (uso o mesmo padrão para todas) ──────────
do $$
declare
  t text;
  filhas text[] := array[
    'rh_documentos','rh_ferias','rh_banco_horas','rh_avaliacoes',
    'rh_treinamentos','rh_beneficios'
  ];
begin
  foreach t in array filhas loop
    execute format('drop policy if exists "auth_le_%I" on public.%I', t, t);
    execute format('drop policy if exists "admin_escreve_%I" on public.%I', t, t);
    execute format($f$
      create policy "%1$I_select" on public.%1$I for select
        using (public.is_admin_or_lider() or public.is_owner_funcionario(funcionario_id))
    $f$, t);
    execute format($f$
      create policy "%1$I_write" on public.%1$I for all
        using (public.is_admin_or_lider())
    $f$, t);
  end loop;
end $$;

-- ── Cargos: leitura para todos os autenticados; escrita admin/lider ──
drop policy if exists "auth_le_rh_cargos"        on public.rh_cargos;
drop policy if exists "admin_escreve_rh_cargos"  on public.rh_cargos;
create policy "rh_cargos_select" on public.rh_cargos for select using (auth.role() = 'authenticated');
create policy "rh_cargos_write"  on public.rh_cargos for all   using (public.is_admin_or_lider());

-- ── Desligamentos: só admin/lider (dado sensível) ──
drop policy if exists "auth_le_rh_desligamentos"        on public.rh_desligamentos;
drop policy if exists "admin_escreve_rh_desligamentos"  on public.rh_desligamentos;
create policy "rh_desl_select" on public.rh_desligamentos for select using (public.is_admin_or_lider());
create policy "rh_desl_write"  on public.rh_desligamentos for all   using (public.is_admin_or_lider());

-- ── B) Storage bucket: rh-documentos ────────────────────────
insert into storage.buckets (id, name, public)
  values ('rh-documentos', 'rh-documentos', false)
  on conflict (id) do nothing;

-- Storage policies
drop policy if exists "rh_doc_storage_select" on storage.objects;
create policy "rh_doc_storage_select" on storage.objects for select
  using (
    bucket_id = 'rh-documentos'
    and (
      public.is_admin_or_lider()
      or exists (
        select 1 from public.rh_documentos d
         where d.arquivo_url = name
           and public.is_owner_funcionario(d.funcionario_id)
      )
    )
  );

drop policy if exists "rh_doc_storage_write" on storage.objects;
create policy "rh_doc_storage_write" on storage.objects for insert
  with check (bucket_id = 'rh-documentos' and public.is_admin_or_lider());

drop policy if exists "rh_doc_storage_delete" on storage.objects;
create policy "rh_doc_storage_delete" on storage.objects for delete
  using (bucket_id = 'rh-documentos' and public.is_admin_or_lider());
