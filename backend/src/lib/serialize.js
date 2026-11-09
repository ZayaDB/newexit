// Turns Postgres rows (snake_case) into the same JSON shape the app got from
// the old MongoDB/Mongoose API: camelCase fields, `_id` (plus `id`), and
// related records nested as objects ("populated") where the old API did so.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

// Keep only `_id`/`id` plus the listed fields, like Mongoose .populate(path, 'a b c').
function pick(obj, fields) {
  if (!obj) return obj;
  const out = { _id: obj._id, id: obj.id };
  for (const f of fields) out[f] = obj[f];
  return out;
}

function user(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    name: row.name,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    role: row.role,
    isVerified: row.is_verified,
    avatar: row.avatar ?? undefined,
    location: row.location,
    points: row.points,
    badge: row.badge ?? undefined,
    language: row.language,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function category(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    key: row.key,
    nameMn: row.name_mn,
    nameEn: row.name_en ?? undefined,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// seller / category may be a joined row (object) or just an id.
function product(row, { seller, category: cat } = {}) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    seller: seller ?? row.seller_id,
    category: cat ?? row.category_id,
    title: row.title,
    shortDescription: row.short_description ?? undefined,
    description: row.description ?? undefined,
    price: row.price,
    currency: row.currency,
    quantity: row.quantity,
    images: row.images,
    location: row.location,
    condition: row.condition,
    badges: row.badges,
    dimensions: row.dimensions ?? undefined,
    deliveryOption: row.delivery_option,
    hasWarranty: row.has_warranty,
    isReturnable: row.is_returnable,
    isFeatured: row.is_featured,
    isFree: row.is_free,
    viewCount: row.view_count,
    favoriteCount: row.favorite_count,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function order(row, { product: prod, buyer, seller } = {}) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    orderNumber: row.order_number,
    buyer: buyer ?? row.buyer_id,
    seller: seller ?? row.seller_id,
    product: prod ?? row.product_id,
    itemPrice: row.item_price,
    deliveryFee: row.delivery_fee,
    assemblyFee: row.assembly_fee,
    pointsUsed: row.points_used,
    totalAmount: row.total_amount,
    currency: row.currency,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    status: row.status,
    deliveryAddress: row.delivery_address ?? undefined,
    includeAssembly: row.include_assembly,
    includeDelivery: row.include_delivery,
    statusHistory: row.status_history,
    paidAt: row.paid_at ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function delivery(row, { order: ord } = {}) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    order: ord ?? row.order_id,
    trackingNumber: row.tracking_number,
    route: row.route,
    origin: row.origin,
    destination: row.destination,
    company: row.company,
    departureDate: row.departure_date ?? undefined,
    estimatedArrival: row.estimated_arrival ?? undefined,
    currentStatus: row.current_status,
    timeline: row.timeline,
    driver: row.driver ?? undefined,
    eta: row.eta ?? undefined,
    liveTrackingEnabled: row.live_tracking_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = { isUuid, pick, user, category, product, order, delivery };
