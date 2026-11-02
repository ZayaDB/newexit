-- Store phone numbers in one canonical form (see normalizePhone in backend/src/routes/auth.js):
-- digits only; "+82…" Korean numbers become "0…"; other "+country" numbers keep the "+".
update public.users
set phone = case
  when phone ~ '^\s*\+' and regexp_replace(phone, '\D', '', 'g') like '82%'
    then '0' || substr(regexp_replace(phone, '\D', '', 'g'), 3)
  when phone ~ '^\s*\+' then '+' || regexp_replace(phone, '\D', '', 'g')
  else regexp_replace(phone, '\D', '', 'g')
end
where phone is not null;
