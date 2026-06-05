require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('./config/db');
const User = require('./models/User');
const Category = require('./models/Category');
const Product = require('./models/Product');

const categories = [
  { key: 'all', nameMn: 'Бүх ангилал', nameEn: 'All', icon: 'sofa', color: '#22C55E', sortOrder: 0 },
  { key: 'furniture', nameMn: 'Тавилга', nameEn: 'Furniture', icon: 'chair', color: '#F97316', sortOrder: 1 },
  { key: 'electronics', nameMn: 'Цахилгаан', nameEn: 'Electronics', icon: 'monitor', color: '#3B82F6', sortOrder: 2 },
  { key: 'clothing', nameMn: 'Хувцас', nameEn: 'Clothing', icon: 'shirt', color: '#60A5FA', sortOrder: 3 },
  { key: 'kitchen', nameMn: 'Гал тогоо', nameEn: 'Kitchen', icon: 'pot', color: '#A855F7', sortOrder: 4 },
  { key: 'other', nameMn: 'Бусад', nameEn: 'Other', icon: 'box', color: '#EC4899', sortOrder: 5 },
];

const sampleProducts = [
  {
    title: 'Софа (3 хүний суудал)',
    shortDescription: 'Цэвэрхэн, гэмтэлгүй зөөлөн суудал',
    description:
      'Цэвэрхэн, гэмтэлгүй. 2 жилийн өмнө авсан. Тав тухтай, бат бөх, өдөр тутмын хэрэглээнд тохиромжтой.',
    price: 120000,
    location: 'Сөүл, Каннам',
    condition: 'new',
    badges: ['Шинэ', 'Verified'],
    dimensions: { width: 220, height: 90, depth: 85 },
    isFeatured: true,
    categoryKey: 'furniture',
    image:
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80',
  },
  {
    title: 'Угаалгын машин',
    shortDescription: 'LG угаалгын машин, сайн төлөвтэй',
    description: '6 сар хэрэглэсэн, бага зэрэг хэрэглэсэн.',
    price: 250000,
    location: 'Сөүл, Мапо',
    condition: 'good',
    badges: ['Free pickup'],
    isFeatured: true,
    categoryKey: 'electronics',
    image:
      'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=800&q=80',
  },
  {
    title: 'Хоолны ширээ',
    shortDescription: '4 хүний хоолны ширээ + сандал',
    description: 'Модон хоолны ширээ, 4 сандал дагалдана.',
    price: 180000,
    location: 'Сөүл, Сонгпа',
    condition: 'used',
    badges: ['Хямдрал'],
    isFeatured: true,
    categoryKey: 'furniture',
    image:
      'https://images.unsplash.com/photo-1617806118233-18e1de247200?w=800&q=80',
  },
  {
    title: 'Телевиз 55"',
    shortDescription: 'Samsung Smart TV 55 инч',
    description: '4K Smart TV, remote control багтана.',
    price: 350000,
    location: 'Сөүл, Каннам',
    condition: 'good',
    badges: ['Шинэ'],
    isFeatured: true,
    categoryKey: 'electronics',
    image:
      'https://images.unsplash.com/photo-1593359673509-e6b7e52e8b8b?w=800&q=80',
  },
  {
    title: 'Хөргөгч',
    shortDescription: 'Хоёр хаалгатай том хөргөгч',
    description: 'Эрчим хүчний хэмнэлттэй, цэвэрхэн.',
    price: 420000,
    location: 'Сөүл, Йонсан',
    condition: 'used',
    badges: [],
    isFeatured: true,
    categoryKey: 'electronics',
    image:
      'https://images.unsplash.com/photo-1571175443880-fa4870e4d672?w=800&q=80',
  },
  {
    title: 'Зөөлөн суудал (үнэгүй)',
    shortDescription: 'Үнэгүй өгөх зөөлөн сандал',
    description: 'Нүүлгэлтийн улмаас үнэгүй өгөх.',
    price: 0,
    location: 'Сөүл, Каннам',
    condition: 'fair',
    badges: ['Үнэгүй'],
    isFree: true,
    isFeatured: true,
    categoryKey: 'furniture',
    image:
      'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=800&q=80',
  },
];

async function seed() {
  await connectDB();

  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
  ]);

  const password = await bcrypt.hash('demo1234', 10);

  const [buyer, seller, mover] = await User.create([
    {
      name: 'Баярцогт',
      email: 'buyer@newexit.mn',
      phone: '+97699112233',
      password,
      role: 'buyer',
      isVerified: true,
      points: 4580,
      location: 'Сөүл, Солонгос',
    },
    {
      name: 'Happy Store',
      email: 'seller@newexit.mn',
      phone: '+821012345678',
      password,
      role: 'seller',
      isVerified: true,
      location: 'Сөүл, Каннам',
    },
    {
      name: 'Баярцогт',
      email: 'mover@newexit.mn',
      phone: '+821098765432',
      password,
      role: 'mover',
      isVerified: true,
      badge: 'GOLD MOVER',
      location: 'Сөүл, Солонгос',
    },
  ]);

  const createdCategories = await Category.insertMany(categories);
  const categoryMap = Object.fromEntries(
    createdCategories.map((c) => [c.key, c._id])
  );

  await Product.insertMany(
    sampleProducts.map((p) => ({
      seller: seller._id,
      category: categoryMap[p.categoryKey],
      title: p.title,
      shortDescription: p.shortDescription,
      description: p.description,
      price: p.price,
      location: p.location,
      condition: p.condition,
      badges: p.badges,
      dimensions: p.dimensions,
      isFeatured: p.isFeatured,
      isFree: p.isFree || p.price === 0,
      images: [p.image],
      deliveryOption: 'delivery',
      hasWarranty: p.condition === 'new',
      viewCount: Math.floor(Math.random() * 300) + 50,
      favoriteCount: Math.floor(Math.random() * 30) + 5,
      status: 'active',
    }))
  );

  console.log('Seed complete!');
  console.log('Demo accounts (password: demo1234):');
  console.log('  Buyer:', buyer.email);
  console.log('  Seller:', seller.email);
  console.log('  Mover:', mover.email);

  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
