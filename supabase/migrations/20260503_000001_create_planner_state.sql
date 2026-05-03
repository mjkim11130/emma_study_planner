-- Stores the entire planner data as a single JSON blob per user.
-- This keeps sync simple while still fully separating data per account.

create table if not exists public.planner_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.planner_state enable row level security;

drop policy if exists "planner_state_select_own" on public.planner_state;
create policy "planner_state_select_own"
on public.planner_state
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "planner_state_insert_own" on public.planner_state;
create policy "planner_state_insert_own"
on public.planner_state
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "planner_state_update_own" on public.planner_state;
create policy "planner_state_update_own"
on public.planner_state
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Optional: prevent deletes from client (only allow cascade on user delete)
drop policy if exists "planner_state_delete_none" on public.planner_state;
create policy "planner_state_delete_none"
on public.planner_state
for delete
to authenticated
using (false);

