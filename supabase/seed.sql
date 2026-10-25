-- NEW EXIT demo data. Wipes all tables, then inserts demo accounts,
-- categories and products. Demo password for every account: demo1234
-- Run with: cd backend && npm run seed   (or paste into the Supabase SQL editor)

begin;

truncate table public.deliveries, public.orders, public.products,
               public.categories, public.users restart identity cascade;

insert into public.users (name, email, phone, password, role, is_verified, points, location, badge) values
  ('Баярцогт',    'buyer@newexit.mn',  '+97699112233',  '$2a$10$rTtqywjDAszN1zEXUu4qIuKdJRW4cBTsz/7hvaenQtxenOcJIdE5W', 'buyer',  true, 4580, 'Сөүл, Солонгос', null),
  ('Happy Store', 'seller@newexit.mn', '+821012345678', '$2a$10$rTtqywjDAszN1zEXUu4qIuKdJRW4cBTsz/7hvaenQtxenOcJIdE5W', 'seller', true, 4580, 'Сөүл, Каннам',   null),
  ('Баярцогт',    'mover@newexit.mn',  '+821098765432', '$2a$10$rTtqywjDAszN1zEXUu4qIuKdJRW4cBTsz/7hvaenQtxenOcJIdE5W', 'mover',  true, 4580, 'Сөүл, Солонгос', 'GOLD MOVER');

insert into public.categories (key, name_mn, name_en, icon, color, sort_order) values
  ('all',         'Бүх ангилал', 'All',         'sofa',    '#22C55E', 0),
  ('furniture',   'Тавилга',     'Furniture',   'chair',   '#F97316', 1),
  ('electronics', 'Цахилгаан',   'Electronics', 'monitor', '#3B82F6', 2),
  ('clothing',    'Хувцас',      'Clothing',    'shirt',   '#60A5FA', 3),
  ('kitchen',     'Гал тогоо',   'Kitchen',     'pot',     '#A855F7', 4),
  ('other',       'Бусад',       'Other',       'box',     '#EC4899', 5);

insert into public.products (
  seller_id, category_id, title, short_description, description, price, location,
  condition, badges, dimensions, is_featured, is_free, images, delivery_option,
  has_warranty, view_count, favorite_count, status, created_at
)
select
  (select id from public.users where email = 'seller@newexit.mn'),
  (select id from public.categories where key = p.category_key),
  p.title, p.short_description, p.description, p.price, p.location,
  p.condition, p.badges, p.dimensions, true, p.price = 0, array[p.image], 'delivery',
  p.condition = 'new', p.view_count, p.favorite_count, 'active',
  now() - (p.ord * interval '1 minute')
from (values
  (1, 'furniture',   'Софа (3 хүний суудал)',  'Цэвэрхэн, гэмтэлгүй зөөлөн суудал',
      'Цэвэрхэн, гэмтэлгүй. 2 жилийн өмнө авсан. Тав тухтай, бат бөх, өдөр тутмын хэрэглээнд тохиромжтой.',
      120000, 'Сөүл, Каннам', 'new',  array['Шинэ', 'Verified'],
      '{"width": 220, "height": 90, "depth": 85, "unit": "cm"}'::jsonb,
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80', 241, 18),
  (2, 'electronics', 'Угаалгын машин', 'LG угаалгын машин, сайн төлөвтэй',
      '6 сар хэрэглэсэн, бага зэрэг хэрэглэсэн.',
      250000, 'Сөүл, Мапо', 'good', array['Free pickup'], null,
      'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=800&q=80', 187, 12),
  (3, 'furniture',   'Хоолны ширээ', '4 хүний хоолны ширээ + сандал',
      'Модон хоолны ширээ, 4 сандал дагалдана.',
      180000, 'Сөүл, Сонгпа', 'used', array['Хямдрал'], null,
      'https://images.unsplash.com/photo-1617806118233-18e1de247200?w=800&q=80', 132, 9),
  (4, 'electronics', 'Телевиз 55"', 'Samsung Smart TV 55 инч',
      '4K Smart TV, remote control багтана.',
      350000, 'Сөүл, Каннам', 'good', array['Шинэ'], null,
      'https://images.unsplash.com/photo-1593359673509-e6b7e52e8b8b?w=800&q=80', 298, 27),
  (5, 'electronics', 'Хөргөгч', 'Хоёр хаалгатай том хөргөгч',
      'Эрчим хүчний хэмнэлттэй, цэвэрхэн.',
      420000, 'Сөүл, Йонсан', 'used', array[]::text[], null,
      'https://images.unsplash.com/photo-1571175443880-fa4870e4d672?w=800&q=80', 76, 6),
  (6, 'furniture',   'Зөөлөн суудал (үнэгүй)', 'Үнэгүй өгөх зөөлөн сандал',
      'Нүүлгэлтийн улмаас үнэгүй өгөх.',
      0, 'Сөүл, Каннам', 'fair', array['Үнэгүй'], null,
      'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=800&q=80', 163, 21)
) as p(ord, category_key, title, short_description, description, price, location,
       condition, badges, dimensions, image, view_count, favorite_count);

commit;
