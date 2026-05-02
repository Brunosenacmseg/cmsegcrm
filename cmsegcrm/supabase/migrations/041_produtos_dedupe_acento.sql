-- ─────────────────────────────────────────────────────────────
-- 041_produtos_dedupe_acento.sql
-- Trata "AUTOMOVEL" e "Automóvel" como o MESMO produto.
-- 1) Cria função pt_norm() (lower + remove acentos via translate)
-- 2) Limpa duplicatas em produtos: para cada grupo com mesmo
--    pt_norm(nome), mantém o "mais bonito" (com mais letras
--    acentuadas / minúsculas) e remove os demais.
-- 3) Substitui o índice unique para considerar pt_norm(nome).
-- ─────────────────────────────────────────────────────────────

create or replace function public.pt_norm(t text)
returns text
language sql
immutable
as $$
  select lower(translate(coalesce(t,''),
    'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÝÇÑáàâãäåéèêëíìîïóòôõöúùûüýÿçñ',
    'AAAAAAEEEEIIIIOOOOOUUUUYCNaaaaaaeeeeiiiiooooouuuuyycn'));
$$;

-- Score: quanto mais minúsculas + caracteres acentuados, "melhor"
-- (preferimos "Automóvel" a "AUTOMOVEL").
with ranqueado as (
  select id, nome,
    public.pt_norm(nome) as chave,
    -- pontua: tem acento? tem mistura de caixa?
    ( case when nome ~ '[áàâãäåéèêëíìîïóòôõöúùûüýÿçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÝÇÑ]' then 10 else 0 end
    + case when nome ~ '[a-z]' and nome ~ '[A-Z]' then 5 else 0 end
    + case when nome ~ '[a-z]' then 1 else 0 end
    ) as score,
    row_number() over (
      partition by public.pt_norm(nome)
      order by
        ( case when nome ~ '[áàâãäåéèêëíìîïóòôõöúùûüýÿçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÝÇÑ]' then 10 else 0 end
        + case when nome ~ '[a-z]' and nome ~ '[A-Z]' then 5 else 0 end
        + case when nome ~ '[a-z]' then 1 else 0 end
        ) desc,
        criado_em asc
    ) as rn
  from public.produtos
),
manter as (select id, chave from ranqueado where rn = 1),
remover as (select id from ranqueado where rn > 1)
-- Antes de apagar, repõe FKs que apontem pros perdedores para os vencedores.
-- (Hoje produtos não tem FKs externas referenciando seu id; se tiver
--  no futuro, adicionar updates aqui.)
delete from public.produtos
 where id in (select id from remover);

-- Substitui o índice unique para usar a forma normalizada
drop index if exists produtos_nome_idx;
create unique index produtos_nome_norm_idx
  on public.produtos (public.pt_norm(nome));
