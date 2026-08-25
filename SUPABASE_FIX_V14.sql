-- ============================================================
-- FÊNIX ONE v14 — SUPABASE
-- Execute este arquivo no SQL Editor.
-- Mantém os dados existentes.
-- ============================================================

-- RESULTADOS
alter table if exists public.consultant_results enable row level security;
grant select, insert, update, delete on public.consultant_results to authenticated;

drop policy if exists "results read" on public.consultant_results;
drop policy if exists "results write" on public.consultant_results;

create policy "results read"
on public.consultant_results
for select to authenticated
using (true);

create policy "results write"
on public.consultant_results
for all to authenticated
using (true)
with check (true);

-- PROPOSTAS: necessário para Cancelar / Cancelar selecionadas.
alter table if exists public.proposals enable row level security;
grant select, update on public.proposals to authenticated;

drop policy if exists "proposals authenticated update" on public.proposals;

create policy "proposals authenticated update"
on public.proposals
for update to authenticated
using (true)
with check (true);

-- RESPOSTAS DOS POP-UPS
alter table if exists public.routine_alert_responses enable row level security;
grant select, insert, update, delete on public.routine_alert_responses to authenticated;

drop policy if exists "alert own" on public.routine_alert_responses;
drop policy if exists "alert own read" on public.routine_alert_responses;
drop policy if exists "alert own insert" on public.routine_alert_responses;
drop policy if exists "alert own update" on public.routine_alert_responses;
drop policy if exists "alert own delete" on public.routine_alert_responses;
drop policy if exists "alert supervisor read" on public.routine_alert_responses;

create policy "alert own read"
on public.routine_alert_responses
for select to authenticated
using (profile_id = auth.uid());

create policy "alert supervisor read"
on public.routine_alert_responses
for select to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'supervisora'
      and p.active = true
  )
);

create policy "alert own insert"
on public.routine_alert_responses
for insert to authenticated
with check (profile_id = auth.uid());

create policy "alert own update"
on public.routine_alert_responses
for update to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy "alert own delete"
on public.routine_alert_responses
for delete to authenticated
using (profile_id = auth.uid());
