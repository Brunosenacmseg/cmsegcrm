-- ═════════════════════════════════════════════════════════════════════
-- 032_funis_visibilidade_equipes.sql
--
-- Aplica a regra de visibilidade dos funis por equipe.
-- Tabela base: public.funis_equipes (criada na migration 009).
--   - Sem linhas pra um funil  → visível a todos (regra original).
--   - Com linhas               → só admin + membros das equipes listadas.
--
-- Mapeamento (conforme decisão de produto):
--   VENDA                            → EQUIPE VENDAS JUNDIAI, EQUIPE ADM
--   META + MULTICANAL                → EQUIPE SP, EQUIPE LEAD JUNDIAI
--   FUNIL RECICLADO - VIDA           → ADMINISTRADORES
--   SAUDE                            → ADMINISTRADORES
--   RENOVAÇÕES                       → EQUIPE VENDAS JUNDIAI, EQUIPE ADM
--   ENDOSSO B2B                      → ADMINISTRADORES
--   CONSÓRCIO                        → ADMINISTRADORES
--   CONTA PORTO BANK                 → ADMINISTRADORES
--   CARTÃO PORTO                     → ADMINISTRADORES
--   FINANCIAMENTO E REFINANCIAMENTO  → ADMINISTRADORES
--   FUNIL COBRANÇA                   → EQUIPE COBRANÇA
--   FUNIL RASTREADOR                 → EQUIPE RASTREADOR
--   ASSISTÊNCIA 24HRS                → EQUIPE RASTREADOR
--   SINISTRO                         → EQUIPE SINISTRO
--
-- Idempotente: pode rodar mais de uma vez.
-- ═════════════════════════════════════════════════════════════════════

-- 1) Garante que as equipes existam (sem mexer em equipes já cadastradas).
insert into public.equipes (nome)
select x.nome
from (values
  ('EQUIPE VENDAS JUNDIAI'),
  ('EQUIPE ADM'),
  ('EQUIPE SP'),
  ('EQUIPE LEAD JUNDIAI'),
  ('EQUIPE COBRANÇA'),
  ('EQUIPE RASTREADOR'),
  ('EQUIPE SINISTRO'),
  ('ADMINISTRADORES')
) as x(nome)
where not exists (
  select 1 from public.equipes e where lower(e.nome) = lower(x.nome)
);

-- 2) Aplica o mapeamento (funil_nome, equipe_nomes[]).
--    Limpa as linhas atuais do funil e reinsere as corretas.
do $$
declare
  v_map jsonb := $json$
  [
    {"funil":"VENDA",                            "equipes":["EQUIPE VENDAS JUNDIAI","EQUIPE ADM"]},
    {"funil":"META + MULTICANAL",                "equipes":["EQUIPE SP","EQUIPE LEAD JUNDIAI"]},
    {"funil":"FUNIL RECICLADO - VIDA",           "equipes":["ADMINISTRADORES"]},
    {"funil":"SAUDE",                            "equipes":["ADMINISTRADORES"]},
    {"funil":"RENOVAÇÕES",                       "equipes":["EQUIPE VENDAS JUNDIAI","EQUIPE ADM"]},
    {"funil":"ENDOSSO B2B",                      "equipes":["ADMINISTRADORES"]},
    {"funil":"CONSÓRCIO",                        "equipes":["ADMINISTRADORES"]},
    {"funil":"CONTA PORTO BANK",                 "equipes":["ADMINISTRADORES"]},
    {"funil":"CARTÃO PORTO",                     "equipes":["ADMINISTRADORES"]},
    {"funil":"FINANCIAMENTO E REFINANCIAMENTO",  "equipes":["ADMINISTRADORES"]},
    {"funil":"FUNIL COBRANÇA",                   "equipes":["EQUIPE COBRANÇA"]},
    {"funil":"FUNIL RASTREADOR",                 "equipes":["EQUIPE RASTREADOR"]},
    {"funil":"ASSISTÊNCIA 24HRS",                "equipes":["EQUIPE RASTREADOR"]},
    {"funil":"SINISTRO",                         "equipes":["EQUIPE SINISTRO"]}
  ]
  $json$::jsonb;
  v_item     jsonb;
  v_funil_id uuid;
  v_eq_nome  text;
  v_eq_id    uuid;
begin
  for v_item in select * from jsonb_array_elements(v_map)
  loop
    select id into v_funil_id
    from public.funis
    where lower(nome) = lower(v_item->>'funil')
    limit 1;

    if v_funil_id is null then
      raise notice 'Funil nao encontrado: %', v_item->>'funil';
      continue;
    end if;

    -- Reseta vínculos atuais e reaplica
    delete from public.funis_equipes where funil_id = v_funil_id;

    for v_eq_nome in
      select jsonb_array_elements_text(v_item->'equipes')
    loop
      select id into v_eq_id
      from public.equipes
      where lower(nome) = lower(v_eq_nome)
      limit 1;

      if v_eq_id is null then
        raise notice 'Equipe nao encontrada: %', v_eq_nome;
        continue;
      end if;

      insert into public.funis_equipes (funil_id, equipe_id)
      values (v_funil_id, v_eq_id)
      on conflict (funil_id, equipe_id) do nothing;
    end loop;
  end loop;
end$$;

-- Conferência (rode após aplicar):
-- select f.nome, coalesce(string_agg(e.nome, ', '), '— TODOS —') as equipes
-- from public.funis f
-- left join public.funis_equipes fe on fe.funil_id = f.id
-- left join public.equipes e on e.id = fe.equipe_id
-- group by f.nome
-- order by f.ordem;
