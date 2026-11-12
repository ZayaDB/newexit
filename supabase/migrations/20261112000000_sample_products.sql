-- Sample listings so the home screen has a full grid (24+ active products).
-- Seller: the demo store account (seller@newexit.mn). Safe to re-run: skips titles that already exist.
with s as (select id from users where email = 'seller@newexit.mn' limit 1),
cat as (select key, id from categories),
data(title, cat_key, price, img, location, badges, short_desc, condition, is_free, is_featured) as (values
  ('Шар өнгийн зөөлөн сандал', 'furniture', 45000, 'photo-1586023492125-27b2c045efd7', 'Сөүл, Мапо', array['Шинэ'], 'Цэвэрхэн, бараг хэрэглээгүй', 'good', false, true),
  ('Давхар ор + матрас', 'furniture', 150000, 'photo-1505693416388-ac5ce068fe85', 'Сөүл, Гуро', array['Хямдрал'], 'Queen хэмжээ, матрастай', 'used', false, true),
  ('Модон баар сандал (2ш)', 'furniture', 30000, 'photo-1503602642458-232111445657', 'Сөүл, Сонгпа', array[]::text[], 'Хос сандал, бат бөх', 'used', false, false),
  ('Гутлын шүүгээ', 'furniture', 25000, 'photo-1595428774223-ef52624120d2', 'Сөүл, Ёндынпо', array['Free pickup'], 'Өөрөө ирж авбал хямдрална', 'used', false, false),
  ('Арьсан буйдан (3 хүн)', 'furniture', 280000, 'photo-1540574163026-643ea20ade25', 'Сөүл, Каннам', array['Verified'], 'Жинхэнэ арьс, хүргэлттэй', 'good', false, true),
  ('Ажлын ширээ + сандал', 'furniture', 90000, 'photo-1524758631624-e2822e304c36', 'Сөүл, Кванак', array[]::text[], 'Гэрээс ажиллахад тохиромжтой', 'used', false, false),
  ('Ноутбук (14 инч)', 'electronics', 550000, 'photo-1496181133206-80ce9b88a853', 'Сөүл, Синчон', array['Verified'], 'Батарей сайн, цэнэглэгчтэй', 'used', false, true),
  ('Ухаалаг утас 128GB', 'electronics', 380000, 'photo-1511707171634-5f897ff02aa9', 'Сөүл, Каннам', array['Шинэ'], 'Хайрцаг, бүх дагалдах хэрэгсэлтэй', 'good', false, true),
  ('Ухаалаг цаг', 'electronics', 120000, 'photo-1546868871-7041f2a55e12', 'Сөүл, Мапо', array[]::text[], 'Спорт, зүрхний цохилт хэмжинэ', 'used', false, false),
  ('Утасгүй чихэвч', 'electronics', 65000, 'photo-1505740420928-5e560c06d30e', 'Сөүл, Гуро', array['Хямдрал'], 'Дуу тусгаарлагчтай', 'used', false, false),
  ('Богино долгионы зуух', 'electronics', 40000, 'photo-1574269909862-7e1d70bb8078', 'Сөүл, Ёнсан', array[]::text[], '20л, хэвийн ажиллаж байгаа', 'used', false, false),
  ('Тоглоомын консол', 'electronics', 450000, 'photo-1606813907291-d86efa9b94db', 'Сөүл, Сонгпа', array['Шинэ'], '2 жойстиктой', 'good', false, true),
  ('Таблет 10.9 инч', 'electronics', 320000, 'photo-1544244015-0df4b3ffc6b0', 'Сөүл, Нованы', array[]::text[], 'Хамгаалалтын гэртэй', 'used', false, false),
  ('Bluetooth чанга яригч', 'electronics', 50000, 'photo-1608043152269-423dbba4e7e1', 'Сөүл, Мапо', array[]::text[], 'Ус нэвтэрдэггүй', 'used', false, false),
  ('Арьсан куртик', 'clothing', 60000, 'photo-1551028719-00167b16eac5', 'Сөүл, Хондэ', array[]::text[], 'M размер, хар өнгө', 'used', false, false),
  ('Пүүз (42 размер)', 'clothing', 35000, 'photo-1549298916-b41d501d3772', 'Сөүл, Каннам', array['Шинэ'], 'Хоёр удаа өмссөн', 'good', false, false),
  ('Нэхмэл цамц', 'clothing', 0, 'photo-1434389677669-e08b4cac3105', 'Сөүл, Гуро', array['Үнэгүй'], 'Үнэгүй өгнө, ирж аваарай', 'used', true, false),
  ('Бомбер хүрэм', 'clothing', 45000, 'photo-1591047139829-d91aecb6caea', 'Сөүл, Ёндынпо', array['Хямдрал'], 'L размер, намар хаварт', 'used', false, false),
  ('Кофе машин + тээрэм', 'kitchen', 200000, 'photo-1570222094114-d054a817e56b', 'Сөүл, Сонгпа', array['Verified'], 'Эспрессо, латте хийнэ', 'used', false, true),
  ('Блендер', 'kitchen', 30000, 'photo-1585515320310-259814833e62', 'Сөүл, Мапо', array[]::text[], 'Смүүти, жүүс хийхэд', 'used', false, false),
  ('Дугуй (хотын)', 'other', 130000, 'photo-1485965120184-e220f721d03e', 'Сөүл, Ёнсан', array[]::text[], 'Хөнгөн, хурд солигчтой', 'used', false, true),
  ('Үүргэвч', 'other', 25000, 'photo-1553062407-98eeb64c6a62', 'Сөүл, Синчон', array[]::text[], 'Ноутбукны тасалгаатай', 'good', false, false),
  ('Ном (10ш багц)', 'other', 0, 'photo-1512820790803-83ca734da794', 'Сөүл, Гуро', array['Үнэгүй'], 'Солонгос хэлний сурах бичиг', 'used', true, false)
)
insert into products (seller_id, category_id, title, short_description, description, price, images, location, condition, badges, is_free, is_featured, delivery_option)
select s.id, cat.id, d.title, d.short_desc, d.short_desc, d.price,
       array['https://images.unsplash.com/' || d.img || '?w=800&q=80'],
       d.location, d.condition, d.badges, d.is_free, d.is_featured, 'delivery'
from data d
join cat on cat.key = d.cat_key
cross join s
where not exists (select 1 from products p where p.title = d.title);
