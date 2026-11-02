-- Dedicated login role for the Express backend.
-- The password is NOT stored here. Set it once in the Supabase SQL editor:
--   alter role newexit_api with password '<long random password>';
-- then use it in backend/.env:
--   DATABASE_URL=postgresql://newexit_api.<project-ref>:<password>@<pooler-host>:5432/postgres
create role newexit_api with login noinherit;

grant usage on schema public to newexit_api;
grant select, insert, update, delete on public.users, public.categories, public.products,
  public.orders, public.deliveries to newexit_api;
grant execute on function public.set_updated_at() to newexit_api;

-- RLS stays on for everyone else (anon/authenticated get nothing); the backend role gets full access.
create policy backend_all on public.users      for all to newexit_api using (true) with check (true);
create policy backend_all on public.categories for all to newexit_api using (true) with check (true);
create policy backend_all on public.products   for all to newexit_api using (true) with check (true);
create policy backend_all on public.orders     for all to newexit_api using (true) with check (true);
create policy backend_all on public.deliveries for all to newexit_api using (true) with check (true);
