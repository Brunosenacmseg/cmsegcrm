-- Anexo da Nota Fiscal em contas a pagar (separado do boleto/PDF já existente)
alter table public.contas_pagar
  add column if not exists nf_anexo_id uuid references public.anexos(id) on delete set null;
