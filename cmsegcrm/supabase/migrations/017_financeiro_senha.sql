-- ─────────────────────────────────────────────────────────────
-- 017_financeiro_senha.sql
-- Senha única (compartilhada) para acesso ao módulo financeiro/DRE.
-- Hash com bcrypt via pgcrypto. Apenas administradores podem ler/setar.
-- ─────────────────────────────────────────────────────────────

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.financeiro_config (
  id          int primary key default 1 check (id = 1),
  senha_hash  text not null,
  updated_at  timestamptz default now(),
  updated_by  uuid references public.users(id)
);

-- Senha inicial = 170921. Trocada via UI/API depois.
insert into public.financeiro_config (id, senha_hash)
values (1, extensions.crypt('170921', extensions.gen_salt('bf')))
on conflict (id) do nothing;

alter table public.financeiro_config enable row level security;

-- Só admin lê/escreve esta tabela. A verificação de senha em si vai
-- via service role (server-side) — nenhum cliente lê o hash diretamente.
do $$ begin
  if not exists (select 1 from pg_policies where tablename='financeiro_config' and policyname='admin_le_config_fin') then
    create policy "admin_le_config_fin" on public.financeiro_config
      for select using (
        exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
      );
  end if;
  if not exists (select 1 from pg_policies where tablename='financeiro_config' and policyname='admin_escreve_config_fin') then
    create policy "admin_escreve_config_fin" on public.financeiro_config
      for all using (
        exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
      );
  end if;
end $$;

-- Função pública (security definer) que verifica a senha sem expor o hash.
create or replace function public.verificar_senha_financeiro(senha text)
returns boolean
language sql security definer set search_path = public, extensions
as $$
  select exists (
    select 1 from public.financeiro_config
    where id = 1 and senha_hash = extensions.crypt(senha, senha_hash)
  );
$$;

grant execute on function public.verificar_senha_financeiro(text) to authenticated;

-- Trocar a senha (só admin). Validação do role é feita no endpoint server-side
-- antes de chamar essa função (a função usa service role).
create or replace function public.set_senha_financeiro(nova text)
returns void
language sql security definer set search_path = public, extensions
as $$
  update public.financeiro_config
     set senha_hash = extensions.crypt(nova, extensions.gen_salt('bf')),
         updated_at = now()
   where id = 1;
$$;

revoke all on function public.set_senha_financeiro(text) from public, authenticated;
-- Só service_role chama (via endpoint server-side com checagem de admin).

