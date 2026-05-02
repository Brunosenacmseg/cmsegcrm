-- ─────────────────────────────────────────────────────────────
-- 042_aliases_extras.sql
-- Adiciona aliases que apareceram no sync mas não estavam no seed:
--   - "Dayvson Pimentel Tavares" (variante de "Davyson..."): mesmo email
--   - "Maria Luisa" (sem acento): mesmo email da "Maria Luísa"
-- Reforça "Lilian Cruz" (caso o seed não tenha entrado).
-- ─────────────────────────────────────────────────────────────

insert into public.rd_responsaveis_alias (nome_planilha, email) values
  ('Dayvson Pimentel Tavares', 'dayvson.tavares@cmseguros.com.br'),
  ('Maria Luisa',              'marialuisa.duraes@cmseguros.com.br'),
  ('Lilian Cruz',              'lilian.cruz@cmseguros.com.br')
on conflict (lower(nome_planilha)) do update set
  email = excluded.email,
  ativo = true;
