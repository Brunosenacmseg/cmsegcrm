-- Permite "fixar" uma nota no card. Notas fixadas aparecem no topo da
-- listagem do modal de negociação. Corresponde ao pedido do Gabriel
-- na página /dashboard/melhorias.

ALTER TABLE public.negocio_notas
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_negocio_notas_negocio_pinned
  ON public.negocio_notas (negocio_id, pinned DESC, criado_em DESC);
