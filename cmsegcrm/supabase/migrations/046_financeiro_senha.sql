-- ─────────────────────────────────────────────────────────────
-- 046_financeiro_senha.sql
-- Senha global de acesso ao módulo Financeiro.
--
--   • financeiro_config            → guarda o hash da senha (1 linha)
--   • fn_financeiro_set_senha(p)   → admin define/troca a senha
--   • fn_financeiro_validar(p)     → valida a senha digitada
--   • fn_financeiro_senha_definida → diz se já existe senha
--
-- Idempotente: pode rodar quantas vezes quiser.
-- ─────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ─── Tabela de config (linha única, id fixo = 1) ────────────────
create table if not exists public.financeiro_config (
  id              int primary key default 1,
  senha_hash      text,
  atualizado_em   timestamptz default now(),
  atualizado_por  uuid references public.users(id),
  constraint financeiro_config_single_row check (id = 1)
);

insert into public.financeiro_config (id) values (1)
  on conflict (id) do nothing;

alter table public.financeiro_config enable row level security;

drop policy if exists "fin_config_le" on public.financeiro_config;
create policy "fin_config_le" on public.financeiro_config
  for select using (auth.role() = 'authenticated');

drop policy if exists "fin_config_admin_escreve" on public.financeiro_config;
create policy "fin_config_admin_escreve" on public.financeiro_config
  for all
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- ─── Define / troca a senha (apenas admin) ─────────────────────
create or replace function public.fn_financeiro_set_senha(p_senha text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin') then
    raise exception 'Apenas admin pode definir a senha do financeiro';
  end if;

  if p_senha is null or length(p_senha) < 4 then
    raise exception 'Senha deve ter ao menos 4 caracteres';
  end if;

  update public.financeiro_config
     set senha_hash      = crypt(p_senha, gen_salt('bf')),
         atualizado_em   = now(),
         atualizado_por  = auth.uid()
   where id = 1;
end;
$$;

revoke all on function public.fn_financeiro_set_senha(text) from public;
grant execute on function public.fn_financeiro_set_senha(text) to authenticated;

-- ─── Valida a senha digitada ───────────────────────────────────
-- Se ainda não foi definida (hash null), retorna true (gate aberto).
create or replace function public.fn_financeiro_validar(p_senha text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  select senha_hash into v_hash from public.financeiro_config where id = 1;
  if v_hash is null then
    return true;
  end if;
  return crypt(coalesce(p_senha,''), v_hash) = v_hash;
end;
$$;

revoke all on function public.fn_financeiro_validar(text) from public;
grant execute on function public.fn_financeiro_validar(text) to authenticated;

-- ─── Helper: senha já está configurada? ────────────────────────
create or replace function public.fn_financeiro_senha_definida()
returns boolean
language sql
security definer
set search_path = public
as $$
  select senha_hash is not null from public.financeiro_config where id = 1;
$$;

grant execute on function public.fn_financeiro_senha_definida() to authenticated;
