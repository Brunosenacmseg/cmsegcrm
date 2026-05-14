-- ─────────────────────────────────────────────────────────────
-- 109_notas_autor_edita_exclui.sql
-- Antes: só admin podia editar/excluir notas. Autor ficava sem
-- permissão, o botão aparecia mas a operação falhava silenciosa
-- via RLS.
-- Agora: autor pode editar/excluir suas próprias notas (admin
-- continua podendo qualquer uma).
-- ─────────────────────────────────────────────────────────────

drop policy if exists "autor_atualiza_nota" on public.negocio_notas;
create policy "autor_atualiza_nota" on public.negocio_notas
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "autor_deleta_nota" on public.negocio_notas;
create policy "autor_deleta_nota" on public.negocio_notas
  for delete using (auth.uid() = user_id);
