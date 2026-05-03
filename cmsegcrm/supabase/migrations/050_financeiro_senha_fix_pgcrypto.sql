-- ─────────────────────────────────────────────────────────────
-- 050_financeiro_senha_fix_pgcrypto.sql
-- Fix: no Supabase pgcrypto vive no schema "extensions", então
-- gen_salt() / crypt() não são resolvidos com search_path = public.
-- Recriamos as RPCs incluindo "extensions" no search_path.
-- ─────────────────────────────────────────────────────────────

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_financeiro_senha(nova text)
returns void
language plpgsql
security definer
set search_path = public, extensions
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
    values (1, extensions.crypt(nova, extensions.gen_salt('bf')), now(), uid)
  on conflict (id) do update
    set senha_hash      = excluded.senha_hash,
        atualizada_em   = now(),
        atualizada_por  = uid;
end;
$$;

create or replace function public.verify_financeiro_senha(tentativa text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  hash text;
  liberado boolean;
begin
  if uid is null then return false; end if;

  select (
    exists (select 1 from public.users u where u.id = uid and u.role = 'admin')
    or exists (select 1 from public.financeiro_acessos a where a.user_id = uid)
  ) into liberado;
  if not liberado then return false; end if;

  select senha_hash into hash from public.financeiro_senha where id = 1;
  if hash is null then return false; end if;

  return hash = extensions.crypt(tentativa, hash);
end;
$$;

revoke all on function public.set_financeiro_senha(text)    from public;
revoke all on function public.verify_financeiro_senha(text) from public;
grant execute on function public.set_financeiro_senha(text)    to authenticated;
grant execute on function public.verify_financeiro_senha(text) to authenticated;
