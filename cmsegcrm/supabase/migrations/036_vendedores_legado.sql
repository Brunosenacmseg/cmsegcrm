-- ─────────────────────────────────────────────────────────────
-- 036_vendedores_legado.sql
-- Vendedores antigos (não logam mais no sistema). Mantém o
-- histórico de quem vendeu cada apólice. Apenas rótulos.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.vendedores_legado (
  id         uuid primary key default uuid_generate_v4(),
  nome       text not null,
  ativo      boolean default true,
  criado_em  timestamptz default now()
);
create unique index if not exists vendedores_legado_nome_idx on public.vendedores_legado(lower(nome));

alter table public.negocios
  add column if not exists vendedor_legado_id uuid references public.vendedores_legado(id) on delete set null;

create index if not exists idx_negocios_vendedor_legado on public.negocios(vendedor_legado_id);

alter table public.vendedores_legado enable row level security;

drop policy if exists "auth_le_vendedores_legado" on public.vendedores_legado;
create policy "auth_le_vendedores_legado" on public.vendedores_legado
  for select using (auth.role() = 'authenticated');

drop policy if exists "admin_escreve_vendedores_legado" on public.vendedores_legado;
create policy "admin_escreve_vendedores_legado" on public.vendedores_legado
  for all using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

-- Seed dos vendedores legados
insert into public.vendedores_legado (nome) values
  ('ADAILTON LIMA'),('ADRIEL SILVA'),('ALICE'),('AMANDA RENV'),('AMANDA SGARBI'),
  ('ANNE CAROLINE'),('ANNE CAROLINE PART'),('ARTHUR MACEDO'),('BERNARDO'),('BERNARDO RENOV'),
  ('BRUNO BONS'),('BRUNO BONS RENOV'),('BRUNO CM'),('BRUNO PART'),('CHRISTHYAN'),
  ('CHRISTHYAN PART'),('DAVYSON'),('DIEGO'),('EDUARDO CHAGAS'),('EMILLY SILVIA'),
  ('ERICKSON RENOV'),('ERICKSON TURQUETTO'),('FELIPE'),('FELIPE RENOV'),('FERNANDO'),
  ('FRED'),('GABRIEL'),('GABRIEL PART'),('GEAN ARAUJO'),('GEAN RENOV'),
  ('GI RENOVAÇÃO'),('GIOVANNA'),('GIOVANNA PART'),('GISLENE VICTORINO'),('GREGORI'),
  ('GREGORI RENOV'),('GUSTAVO ARAUJO'),('GUSTAVO ARAUJO RENV'),('GUSTAVO PILOTO'),('GUSTAVO PILOTO RENOV'),
  ('GUTO'),('HIGOR'),('ISABELA'),('ISABELA PART'),('JANAINA CM'),
  ('JESSICA'),('JOAO'),('JONATHAN'),('JONATHAN PART'),('KAREN RENOV'),
  ('KARINA SPINA'),('LAIS VANJURA'),('LILIAN CRUZ'),('LILIAN RENOV'),('LIVIA LUMASINI'),
  ('LUANNA'),('LUANNA PART'),('LUCAS MONTEZE'),('LUIZ SCHELOTAG'),('MAIRA'),
  ('MAIRA PART'),('MALU'),('MALU RENOV'),('MARCELO OLIVEIRA'),('MARY ELLEN ROSA'),
  ('MARY RENOV'),('PAVANI'),('PAVANI PART'),('PEIXOTO & SENA CORRETORA DI'),('PRISCILA'),
  ('PROFEE BRUNO'),('PROFEE CM'),('RAFAEL'),('RCO'),('ROSANGELA'),
  ('SALVII'),('SANTOS GI'),('TAMIRES'),('TAMIRES PART'),('VIP SELECTION'),
  ('VITORIA'),('WILLIAM'),('WILLIAM RENOVAÇÃO')
on conflict (lower(nome)) do update set ativo = true;
