-- ─────────────────────────────────────────────────────────────
-- 046_financeiro_senha.sql
-- Adiciona uma senha extra (cofre) para acessar o módulo
-- Financeiro / DRE. Mesmo usuários já liberados em
-- financeiro_acessos precisam digitar essa senha.
-- A senha é guardada como hash (pgcrypto / bcrypt-like) e
-- só é manipulada via RPC; a tabela não pode ser lida direto.
-- ─────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

create table if not exists public.financeiro_senha (
  id           int primary key default 1,
  senha_hash   text not null,
  atualizada_em   timestamptz not null default now(),
  atualizada_por  uuid references public.users(id),
  constraint financeiro_senha_singleton check (id = 1)
);

alter table public.financeiro_senha enable row level security;

-- ninguém lê/escreve direto: apenas via RPC abaixo
drop policy if exists "fin_senha_no_select" on public.financeiro_senha;
create policy "fin_senha_no_select" on public.financeiro_senha
  for select using (false);

-- ── RPC: definir/trocar a senha (admin) ──────────────────────
create or replace function public.set_financeiro_senha(nova text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  is_admin boolean;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  select (role = 'admin') into is_admin from public.users where id = uid;
  if not coalesce(is_admin,false) then
    raise exception 'apenas admin pode definir a senha financeira';
  end if;
  if nova is null or length(nova) < 4 then
    raise exception 'senha precisa ter pelo menos 4 caracteres';
  end if;

  insert into public.financeiro_senha (id, senha_hash, atualizada_em, atualizada_por)
    values (1, crypt(nova, gen_salt('bf')), now(), uid)
  on conflict (id) do update
    set senha_hash      = excluded.senha_hash,
        atualizada_em   = now(),
        atualizada_por  = uid;
end;
$$;

revoke all on function public.set_financeiro_senha(text) from public;
grant execute on function public.set_financeiro_senha(text) to authenticated;

-- ── RPC: verificar a senha ───────────────────────────────────
create or replace function public.verify_financeiro_senha(tentativa text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  hash text;
  liberado boolean;
begin
  if uid is null then return false; end if;

  -- precisa estar liberado (admin ou linha em financeiro_acessos)
  select (
    exists (select 1 from public.users u where u.id = uid and u.role = 'admin')
    or exists (select 1 from public.financeiro_acessos a where a.user_id = uid)
  ) into liberado;
  if not liberado then return false; end if;

  select senha_hash into hash from public.financeiro_senha where id = 1;
  if hash is null then
    -- nenhuma senha configurada ainda → exige cadastro pelo admin
    return false;
  end if;

  return hash = crypt(tentativa, hash);
end;
$$;

revoke all on function public.verify_financeiro_senha(text) from public;
grant execute on function public.verify_financeiro_senha(text) to authenticated;

-- ── RPC: saber se já existe senha cadastrada ─────────────────
create or replace function public.financeiro_senha_definida()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.financeiro_senha where id = 1);
$$;

revoke all on function public.financeiro_senha_definida() from public;
grant execute on function public.financeiro_senha_definida() to authenticated;
