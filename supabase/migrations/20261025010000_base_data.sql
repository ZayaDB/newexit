-- Base reference data the app needs to work (not demo data):
-- product categories. Safe to run more than once.
insert into public.categories (key, name_mn, name_en, icon, color, sort_order) values
  ('all',         'Бүх ангилал', 'All',         'sofa',    '#22C55E', 0),
  ('furniture',   'Тавилга',     'Furniture',   'chair',   '#F97316', 1),
  ('electronics', 'Цахилгаан',   'Electronics', 'monitor', '#3B82F6', 2),
  ('clothing',    'Хувцас',      'Clothing',    'shirt',   '#60A5FA', 3),
  ('kitchen',     'Гал тогоо',   'Kitchen',     'pot',     '#A855F7', 4),
  ('other',       'Бусад',       'Other',       'box',     '#EC4899', 5)
on conflict (key) do nothing;

-- New accounts start with 0 points (was a demo value of 4580).
alter table public.users alter column points set default 0;
