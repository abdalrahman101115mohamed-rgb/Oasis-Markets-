import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import {
  clearAuthCookie,
  extractBearerToken,
  extractHeaderToken,
  hashPassword,
  parseCookies,
  setAuthCookie,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from './server/auth.ts';
import { db, initDatabase, UPLOADS_DIR } from './server/db.ts';

dotenv.config();
initDatabase();

const ADMIN_COOKIE = 'oasis_admin_session';
const CUSTOMER_COOKIE = 'oasis_customer_session';
const GUEST_COOKIE = 'oasis_guest_token';

const app = express();
app.set('trust proxy', 1);
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'geolocation=(self)');
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

// Real-time SSE clients
const sseClients = new Set<Response>();

function broadcastEvent(type: 'catalog_updated' | 'orders_updated' | 'settings_updated') {
  const payload = `data: ${JSON.stringify({ type, timestamp: Date.now() })}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

// Multer storage for real image uploads from phone gallery or camera
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    cb(null, `prod_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('يرجى اختيار ملف صورة صالح فقط (JPG / PNG / WebP)'));
    }
  },
});

interface AdminRow {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthenticatedRequest extends Request {
  admin?: AdminRow;
  customerId?: string | null;
}

function getAuthenticatedAdmin(req: Request): AdminRow | null {
  const cookies = parseCookies(req);
  const rawToken =
    extractHeaderToken(req, 'x-admin-token') ||
    extractBearerToken(req) ||
    cookies[ADMIN_COOKIE];
  const payload = verifySessionToken(rawToken);
  if (!payload || payload.role !== 'admin') return null;
  const admin = db
    .prepare(
      "SELECT id, email, name, role FROM admins WHERE id = ? AND is_active = 1 AND role = 'super_admin'",
    )
    .get(payload.sub) as AdminRow | undefined;
  return admin ?? null;
}

function getAuthenticatedCustomerId(req: Request): string | null {
  const cookies = parseCookies(req);
  const rawToken =
    extractHeaderToken(req, 'x-customer-token') ||
    extractBearerToken(req) ||
    cookies[CUSTOMER_COOKIE];
  const payload = verifySessionToken(rawToken);
  if (!payload || payload.role !== 'customer') return null;
  const row = db.prepare('SELECT id FROM customers WHERE id = ?').get(payload.sub) as
    | { id: string }
    | undefined;
  return row?.id ?? null;
}

function getExistingGuestToken(req: Request): string | null {
  const cookies = parseCookies(req);
  const candidate = extractHeaderToken(req, 'x-guest-token') || cookies[GUEST_COOKIE];
  if (candidate && /^[a-f0-9]{32,64}$/.test(candidate)) {
    return candidate;
  }
  return null;
}

function getOrCreateGuestToken(req: Request, res: Response): string {
  const existing = getExistingGuestToken(req);
  if (existing) {
    return existing;
  }
  const fresh = crypto.randomBytes(24).toString('hex');
  setAuthCookie(req, res, GUEST_COOKIE, fresh, 60 * 60 * 24 * 90);
  return fresh;
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const admin = getAuthenticatedAdmin(req);
  if (!admin) {
    // Explicitly distinguish an authenticated customer/non-admin from unauthenticated user
    const rawAnyToken =
      extractHeaderToken(req, 'x-admin-token') ||
      extractBearerToken(req) ||
      extractHeaderToken(req, 'x-customer-token');
    const tokenPayload = verifySessionToken(rawAnyToken);
    if (tokenPayload?.role === 'customer' || getAuthenticatedCustomerId(req)) {
      res.status(403).json({
        error: 'غير مصرح: هذا الحساب مخصص للعملاء ولا يملك صلاحيات المدير الرئيسي',
      });
      return;
    }
    res.status(401).json({ error: 'غير مصرح: يرجى تسجيل الدخول بحساب المدير الرئيسي أولًا' });
    return;
  }
  req.admin = admin;
  next();
}

function mapCategory(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name),
    subtitle: String(row.subtitle),
    iconKey: String(row.icon_key),
    isActive: Number(row.is_active) === 1,
    sortOrder: Number(row.sort_order),
  };
}

function mapProduct(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name),
    shortDescription: String(row.short_description),
    priceEgp: Number(row.price_egp),
    oldPriceEgp: row.old_price_egp !== null && row.old_price_egp !== undefined ? Number(row.old_price_egp) : undefined,
    unit: String(row.unit),
    categoryId: String(row.category_id),
    image: String(row.image_url),
    stockQuantity: Number(row.stock_quantity),
    isActive: Number(row.is_active) === 1,
    isAvailable: Number(row.is_active) === 1 && Number(row.stock_quantity) > 0,
    isBestSeller: Number(row.is_best_seller) === 1,
    isNewArrival: Number(row.is_new_arrival) === 1,
    isDailyDeal: Number(row.is_daily_deal) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapZone(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name),
    deliveryFee: Number(row.delivery_fee),
    isActive: Number(row.is_active) === 1,
    sortOrder: Number(row.sort_order),
  };
}

function mapSettings(row: Record<string, unknown>) {
  return {
    storeName: String(row.store_name),
    supportPhone: String(row.support_phone),
    defaultDeliveryFee: Number(row.default_delivery_fee),
    minOrderEgp: Number(row.min_order_egp),
    isOpen: Number(row.is_open) === 1,
    announcement: String(row.announcement || ''),
  };
}

function mapOrdersWithItems(orderRows: Record<string, unknown>[]) {
  const itemStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  return orderRows.map((row) => {
    const items = itemStmt.all(String(row.id)) as Record<string, unknown>[];
    return {
      id: String(row.id),
      orderNumber: Number(row.order_number),
      customerName: String(row.customer_name),
      customerPhone: String(row.customer_phone),
      zoneId: String(row.zone_id),
      zoneName: String(row.zone_name),
      streetAddress: String(row.street_address),
      buildingNumber: String(row.building_number),
      floor: String(row.floor),
      apartment: String(row.apartment),
      notes: String(row.notes),
      lat: row.lat !== null && row.lat !== undefined ? Number(row.lat) : null,
      lng: row.lng !== null && row.lng !== undefined ? Number(row.lng) : null,
      gpsAccuracy: row.gps_accuracy !== null && row.gps_accuracy !== undefined ? Number(row.gps_accuracy) : null,
      subtotalEgp: Number(row.subtotal_egp),
      deliveryFeeEgp: Number(row.delivery_fee_egp),
      discountEgp: Number(row.discount_egp),
      totalEgp: Number(row.total_egp),
      paymentMethod: String(row.payment_method),
      status: String(row.status),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      items: items.map((it) => ({
        id: String(it.id),
        productId: String(it.product_id),
        productName: String(it.product_name),
        unit: String(it.unit),
        unitPriceEgp: Number(it.unit_price_egp),
        quantity: Number(it.quantity),
        lineTotalEgp: Number(it.line_total_egp),
        imageUrl: String(it.image_url),
      })),
    };
  });
}

// ==========================================
// Real-time SSE stream
// ==========================================
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);
  sseClients.add(res);
  req.on('close', () => {
    sseClients.delete(res);
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

// ==========================================
// Public Storefront Bootstrap
// ==========================================
app.get('/api/bootstrap', (_req, res) => {
  const categories = (
    db
      .prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, name ASC')
      .all() as Record<string, unknown>[]
  ).map(mapCategory);

  const products = (
    db
      .prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY created_at DESC')
      .all() as Record<string, unknown>[]
  ).map(mapProduct);

  const zones = (
    db
      .prepare('SELECT * FROM delivery_zones WHERE is_active = 1 ORDER BY sort_order ASC, name ASC')
      .all() as Record<string, unknown>[]
  ).map(mapZone);

  const settingsRow = db.prepare('SELECT * FROM store_settings WHERE id = 1').get() as Record<
    string,
    unknown
  >;

  const mapsApiKey =
    process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || undefined;

  res.json({
    categories,
    products,
    zones,
    settings: mapSettings(settingsRow),
    ...(mapsApiKey ? { mapsApiKey } : {}),
  });
});

function mapProductReview(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    authorName: String(row.author_name),
    rating: Number(row.rating),
    comment: String(row.comment || ''),
    createdAt: String(row.created_at),
  };
}

function getReviewSummary(productId: string) {
  const agg = db
    .prepare(
      'SELECT COUNT(*) as totalCount, COALESCE(AVG(rating), 0) as avgRating FROM product_reviews WHERE product_id = ?',
    )
    .get(productId) as { totalCount: number; avgRating: number };
  const totalCount = Number(agg?.totalCount ?? 0);
  const averageRating = totalCount > 0 ? Math.round(Number(agg.avgRating) * 10) / 10 : 0;
  return { averageRating, totalCount };
}

app.get('/api/products/:id/reviews', (req, res) => {
  const productId = String(req.params.id || '').trim();
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!product) {
    res.status(404).json({ error: 'المنتج غير موجود' });
    return;
  }

  const rows = db
    .prepare(
      'SELECT id, product_id, author_name, rating, comment, created_at FROM product_reviews WHERE product_id = ? ORDER BY created_at DESC LIMIT 50',
    )
    .all(productId) as Record<string, unknown>[];

  res.json({
    reviews: rows.map(mapProductReview),
    summary: getReviewSummary(productId),
  });
});

app.post('/api/products/:id/reviews', (req, res) => {
  const productId = String(req.params.id || '').trim();
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!product) {
    res.status(404).json({ error: 'المنتج غير موجود' });
    return;
  }

  const customerId = getAuthenticatedCustomerId(req);
  let fallbackName = '';
  if (customerId) {
    const cust = db
      .prepare('SELECT name FROM customers WHERE id = ?')
      .get(customerId) as { name: string } | undefined;
    if (cust?.name) fallbackName = cust.name;
  }

  const body = req.body ?? {};
  const authorName = String(body.authorName ?? fallbackName).trim();
  const rating = Number(body.rating);
  const comment = String(body.comment || '').trim();

  if (authorName.length < 2 || authorName.length > 60) {
    res.status(400).json({ error: 'يرجى كتابة اسمك (من حرفين إلى 60 حرفًا)' });
    return;
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: 'يرجى اختيار تقييم بالنجوم من 1 إلى 5' });
    return;
  }
  if (comment.length > 500) {
    res.status(400).json({ error: 'التعليق طويل جدًا (الحد الأقصى 500 حرف)' });
    return;
  }

  const id = `rev_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO product_reviews (id, product_id, customer_id, author_name, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, productId, customerId, authorName, rating, comment, now);

  const inserted = db
    .prepare(
      'SELECT id, product_id, author_name, rating, comment, created_at FROM product_reviews WHERE id = ?',
    )
    .get(id) as Record<string, unknown>;

  res.status(201).json({
    review: mapProductReview(inserted),
    summary: getReviewSummary(productId),
  });
});

// ==========================================
// Customer Authentication & Scoped Orders
// ==========================================
app.get('/api/customer/me', (req, res) => {
  const customerId = getAuthenticatedCustomerId(req);
  if (!customerId) {
    res.json({ customer: null });
    return;
  }
  const customer = db
    .prepare('SELECT id, name, phone, email, created_at FROM customers WHERE id = ?')
    .get(customerId) as Record<string, unknown> | undefined;
  res.json({ customer: customer ?? null });
});

app.post('/api/customer/register', (req, res) => {
  const { name, phone, email, password } = req.body ?? {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();
  const cleanPhone = String(phone || '').trim();
  const cleanPass = String(password || '');

  if (cleanName.length < 2 || cleanPhone.length < 8 || !cleanEmail.includes('@') || cleanPass.length < 6) {
    res.status(400).json({ error: 'يرجى إدخال الاسم ورقم الهاتف وبريد إلكتروني صحيح وكلمة مرور لا تقل عن 6 أحرف' });
    return;
  }

  const existing = db.prepare('SELECT id FROM customers WHERE email = ?').get(cleanEmail);
  if (existing) {
    res.status(409).json({ error: 'البريد الإلكتروني مسجل بالفعل' });
    return;
  }

  const id = `cust_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO customers (id, name, phone, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, cleanName, cleanPhone, cleanEmail, hashPassword(cleanPass), now);

  // Link any existing guest orders placed from this browser to the customer account
  const guestToken = getExistingGuestToken(req);
  if (guestToken) {
    db.prepare('UPDATE orders SET customer_id = ? WHERE customer_token = ? AND customer_id IS NULL').run(
      id,
      guestToken,
    );
  }

  const token = signSessionToken({ sub: id, role: 'customer' });
  setAuthCookie(req, res, CUSTOMER_COOKIE, token);
  res.status(201).json({
    customer: { id, name: cleanName, phone: cleanPhone, email: cleanEmail },
    customerToken: token,
  });
});

app.post('/api/customer/login', (req, res) => {
  const { email, password } = req.body ?? {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPass = String(password || '');

  const row = db
    .prepare('SELECT id, name, phone, email, password_hash FROM customers WHERE email = ?')
    .get(cleanEmail) as Record<string, unknown> | undefined;

  if (!row || !verifyPassword(cleanPass, String(row.password_hash))) {
    res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    return;
  }

  const guestToken = getExistingGuestToken(req);
  if (guestToken) {
    db.prepare('UPDATE orders SET customer_id = ? WHERE customer_token = ? AND customer_id IS NULL').run(
      String(row.id),
      guestToken,
    );
  }

  const token = signSessionToken({ sub: String(row.id), role: 'customer' });
  setAuthCookie(req, res, CUSTOMER_COOKIE, token);
  res.json({
    customer: {
      id: String(row.id),
      name: String(row.name),
      phone: String(row.phone),
      email: String(row.email),
    },
    customerToken: token,
  });
});

app.post('/api/customer/logout', (req, res) => {
  clearAuthCookie(req, res, CUSTOMER_COOKIE);
  res.json({ ok: true });
});

app.get('/api/orders/my', (req, res) => {
  const customerId = getAuthenticatedCustomerId(req);
  const guestToken = getExistingGuestToken(req);

  if (!customerId && !guestToken) {
    res.json({ orders: [] });
    return;
  }

  let rows: Record<string, unknown>[] = [];
  if (customerId && guestToken) {
    rows = db
      .prepare('SELECT * FROM orders WHERE customer_id = ? OR customer_token = ? ORDER BY created_at DESC')
      .all(customerId, guestToken) as Record<string, unknown>[];
  } else if (customerId) {
    rows = db
      .prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC')
      .all(customerId) as Record<string, unknown>[];
  } else if (guestToken) {
    rows = db
      .prepare('SELECT * FROM orders WHERE customer_token = ? ORDER BY created_at DESC')
      .all(guestToken) as Record<string, unknown>[];
  }

  res.json({ orders: mapOrdersWithItems(rows) });
});

// ==========================================
// Server-Authoritative Order Placement
// ==========================================
app.post('/api/orders', (req, res) => {
  const body = req.body ?? {};
  const customerName = String(body.customerName || '').trim();
  const customerPhone = String(body.customerPhone || '').trim();
  const zoneId = String(body.zoneId || '').trim();
  const streetAddress = String(body.streetAddress || '').trim();
  const buildingNumber = String(body.buildingNumber || '').trim();
  const floor = String(body.floor || '').trim();
  const apartment = String(body.apartment || '').trim();
  const notes = String(body.notes || '').trim();
  const lat = typeof body.lat === 'number' && Number.isFinite(body.lat) ? body.lat : null;
  const lng = typeof body.lng === 'number' && Number.isFinite(body.lng) ? body.lng : null;
  const gpsAccuracy =
    typeof body.gpsAccuracy === 'number' && Number.isFinite(body.gpsAccuracy)
      ? body.gpsAccuracy
      : null;
  const items = Array.isArray(body.items) ? body.items : [];

  if (customerName.length < 2) {
    res.status(400).json({ error: 'يرجى إدخال اسم العميل بالكامل' });
    return;
  }
  if (customerPhone.length < 8) {
    res.status(400).json({ error: 'يرجى إدخال رقم هاتف صحيح للتواصل' });
    return;
  }
  if (!zoneId) {
    res.status(400).json({ error: 'يرجى اختيار منطقة التوصيل' });
    return;
  }
  if (streetAddress.length < 3) {
    res.status(400).json({ error: 'يرجى إدخال تفاصيل العنوان والشارع' });
    return;
  }
  if (items.length === 0) {
    res.status(400).json({ error: 'سلة المشتريات فارغة' });
    return;
  }

  const guestToken = getOrCreateGuestToken(req, res);
  const customerId = getAuthenticatedCustomerId(req);

  try {
    db.exec('BEGIN IMMEDIATE');

    const settingsRow = db.prepare('SELECT * FROM store_settings WHERE id = 1').get() as Record<
      string,
      unknown
    >;
    if (Number(settingsRow.is_open) !== 1) {
      db.exec('ROLLBACK');
      res.status(400).json({ error: 'المتجر مغلق مؤقتًا ولا يستقبل طلبات في الوقت الحالي' });
      return;
    }

    const zoneRow = db
      .prepare('SELECT * FROM delivery_zones WHERE id = ? AND is_active = 1')
      .get(zoneId) as Record<string, unknown> | undefined;
    if (!zoneRow) {
      db.exec('ROLLBACK');
      res.status(400).json({ error: 'منطقة التوصيل المختارة غير متاحة حاليًا' });
      return;
    }

    let subtotalEgp = 0;
    const verifiedItems: {
      productId: string;
      productName: string;
      unit: string;
      unitPriceEgp: number;
      quantity: number;
      lineTotalEgp: number;
      imageUrl: string;
    }[] = [];

    const productStmt = db.prepare('SELECT * FROM products WHERE id = ?');
    const deductStmt = db.prepare(
      'UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ? AND stock_quantity >= ?',
    );

    const now = new Date().toISOString();

    for (const rawItem of items) {
      const productId = String(rawItem?.productId || '');
      const quantity = Number(rawItem?.quantity || 0);
      if (!productId || !Number.isInteger(quantity) || quantity <= 0 || quantity > 999) {
        db.exec('ROLLBACK');
        res.status(400).json({ error: 'كمية غير صالحة لأحد المنتجات' });
        return;
      }

      const prod = productStmt.get(productId) as Record<string, unknown> | undefined;
      if (!prod || Number(prod.is_active) !== 1) {
        db.exec('ROLLBACK');
        res.status(400).json({ error: 'أحد المنتجات في السلة لم يعد متاحًا للبيع حاليًا' });
        return;
      }

      const availableStock = Number(prod.stock_quantity);
      if (availableStock < quantity) {
        db.exec('ROLLBACK');
        res.status(400).json({
          error: `الكمية المتوفرة من "${String(prod.name)}" هي ${availableStock} فقط`,
        });
        return;
      }

      const deducted = deductStmt.run(quantity, now, productId, quantity);
      if (deducted.changes === 0) {
        db.exec('ROLLBACK');
        res.status(400).json({ error: `تعذر حجز الكمية المطلوبة من "${String(prod.name)}"` });
        return;
      }

      const unitPrice = Number(prod.price_egp);
      const lineTotal = Math.round(unitPrice * quantity * 100) / 100;
      subtotalEgp += lineTotal;

      verifiedItems.push({
        productId,
        productName: String(prod.name),
        unit: String(prod.unit),
        unitPriceEgp: unitPrice,
        quantity,
        lineTotalEgp: lineTotal,
        imageUrl: String(prod.image_url),
      });
    }

    subtotalEgp = Math.round(subtotalEgp * 100) / 100;
    const minOrderEgp = Number(settingsRow.min_order_egp);
    if (subtotalEgp < minOrderEgp) {
      db.exec('ROLLBACK');
      res.status(400).json({
        error: `الحد الأدنى للطلب هو ${minOrderEgp} جنيه مصري (الإجمالي الحالي ${subtotalEgp} ج.م)`,
      });
      return;
    }

    const deliveryFeeEgp = Number(zoneRow.delivery_fee);
    const totalEgp = Math.round((subtotalEgp + deliveryFeeEgp) * 100) / 100;

    const maxNumRow = db.prepare('SELECT COALESCE(MAX(order_number), 1000) as maxNum FROM orders').get() as {
      maxNum: number;
    };
    const orderNumber = Number(maxNumRow.maxNum) + 1;
    const orderId = `ord_${crypto.randomUUID()}`;

    db.prepare(
      `INSERT INTO orders (
        id, order_number, customer_token, customer_id, customer_name, customer_phone,
        zone_id, zone_name, street_address, building_number, floor, apartment, notes,
        lat, lng, gps_accuracy, subtotal_egp, delivery_fee_egp, discount_egp, total_egp,
        payment_method, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'cash_on_delivery', 'new', ?, ?)`,
    ).run(
      orderId,
      orderNumber,
      guestToken,
      customerId,
      customerName,
      customerPhone,
      zoneId,
      String(zoneRow.name),
      streetAddress,
      buildingNumber,
      floor,
      apartment,
      notes,
      lat,
      lng,
      gpsAccuracy,
      subtotalEgp,
      deliveryFeeEgp,
      totalEgp,
      now,
      now,
    );

    const insertItem = db.prepare(
      `INSERT INTO order_items (
        id, order_id, product_id, product_name, unit, unit_price_egp, quantity, line_total_egp, image_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const item of verifiedItems) {
      insertItem.run(
        `oi_${crypto.randomUUID()}`,
        orderId,
        item.productId,
        item.productName,
        item.unit,
        item.unitPriceEgp,
        item.quantity,
        item.lineTotalEgp,
        item.imageUrl,
      );
    }

    db.exec('COMMIT');

    const createdRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Record<
      string,
      unknown
    >;
    broadcastEvent('orders_updated');
    broadcastEvent('catalog_updated');
    res.status(201).json({ order: mapOrdersWithItems([createdRow])[0], guestToken });
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore
    }
    console.error('Order placement error:', err);
    res.status(500).json({ error: 'حدث خطأ أثناء تأكيد الطلب، يرجى المحاولة مرة أخرى' });
  }
});

// ==========================================
// Admin Authentication (Database-Backed, Zero Hardcoded Credentials)
// ==========================================
app.get('/api/admin/status', (req, res) => {
  const countRow = db
    .prepare("SELECT COUNT(*) as count FROM admins WHERE is_active = 1 AND role = 'super_admin'")
    .get() as { count: number };
  const admin = getAuthenticatedAdmin(req);
  res.json({
    hasAdmin: countRow.count > 0,
    admin,
  });
});

app.post('/api/admin/bootstrap', (req, res) => {
  const countRow = db.prepare('SELECT COUNT(*) as count FROM admins').get() as { count: number };
  if (countRow.count > 0) {
    res.status(403).json({ error: 'حساب المدير الرئيسي مُفعّل بالفعل ولا يمكن إنشاء حساب إداري من هذه الصفحة' });
    return;
  }

  const { name, email, password } = req.body ?? {};
  const cleanName = String(name || '').trim() || 'مدير أسواق الواحة';
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPass = String(password || '');

  if (!cleanEmail.includes('@') || cleanPass.length < 8) {
    res.status(400).json({ error: 'يرجى إدخال بريد إلكتروني صحيح وكلمة مرور لا تقل عن 8 أحرف' });
    return;
  }

  const adminId = `adm_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO admins (id, email, name, password_hash, role, is_active, created_at) VALUES (?, ?, ?, ?, 'super_admin', 1, ?)",
  ).run(adminId, cleanEmail, cleanName, hashPassword(cleanPass), now);

  const token = signSessionToken({ sub: adminId, role: 'admin' });
  setAuthCookie(req, res, ADMIN_COOKIE, token);
  res.status(201).json({
    admin: { id: adminId, email: cleanEmail, name: cleanName, role: 'super_admin' },
    adminToken: token,
  });
});

app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body ?? {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPass = String(password || '');

  const row = db
    .prepare('SELECT id, email, name, role, is_active, password_hash FROM admins WHERE email = ?')
    .get(cleanEmail) as Record<string, unknown> | undefined;

  if (!row || !verifyPassword(cleanPass, String(row.password_hash))) {
    res.status(401).json({ error: 'بيانات دخول المدير غير صحيحة' });
    return;
  }

  if (Number(row.is_active) !== 1 || String(row.role) !== 'super_admin') {
    res.status(403).json({ error: 'هذا الحساب غير مفعّل أو لا يملك صلاحيات المدير الرئيسي' });
    return;
  }

  const token = signSessionToken({ sub: String(row.id), role: 'admin' });
  setAuthCookie(req, res, ADMIN_COOKIE, token);
  res.json({
    admin: {
      id: String(row.id),
      email: String(row.email),
      name: String(row.name),
      role: String(row.role),
    },
    adminToken: token,
  });
});

app.post('/api/admin/logout', (req, res) => {
  clearAuthCookie(req, res, ADMIN_COOKIE);
  res.json({ ok: true });
});

// ==========================================
// Protected Admin Dashboard APIs
// ==========================================
app.get('/api/admin/dashboard', requireAdmin, (_req, res) => {
  const categories = (
    db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, name ASC').all() as Record<
      string,
      unknown
    >[]
  ).map(mapCategory);

  const products = (
    db.prepare('SELECT * FROM products ORDER BY created_at DESC').all() as Record<string, unknown>[]
  ).map(mapProduct);

  const zones = (
    db.prepare('SELECT * FROM delivery_zones ORDER BY sort_order ASC, name ASC').all() as Record<
      string,
      unknown
    >[]
  ).map(mapZone);

  const orderRows = db
    .prepare('SELECT * FROM orders ORDER BY created_at DESC')
    .all() as Record<string, unknown>[];
  const orders = mapOrdersWithItems(orderRows);

  const settingsRow = db.prepare('SELECT * FROM store_settings WHERE id = 1').get() as Record<
    string,
    unknown
  >;

  const stats = {
    totalOrders: orders.length,
    newOrders: orders.filter((o) => o.status === 'new').length,
    preparingOrders: orders.filter((o) => o.status === 'preparing').length,
    outForDeliveryOrders: orders.filter((o) => o.status === 'out_for_delivery').length,
    completedOrders: orders.filter((o) => o.status === 'completed').length,
    cancelledOrders: orders.filter((o) => o.status === 'cancelled').length,
    totalSalesEgp: Math.round(
      orders
        .filter((o) => o.status !== 'cancelled')
        .reduce((sum, o) => sum + o.totalEgp, 0) * 100,
    ) / 100,
  };

  res.json({
    stats,
    categories,
    products,
    zones,
    orders,
    settings: mapSettings(settingsRow),
  });
});

app.post('/api/admin/upload', requireAdmin, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'تعذر رفع الصورة' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'لم يتم إرفاق صورة' });
      return;
    }
    res.status(201).json({ imageUrl: `/uploads/${req.file.filename}` });
  });
});

app.post('/api/admin/products', requireAdmin, (req, res) => {
  const b = req.body ?? {};
  const name = String(b.name || '').trim();
  const shortDescription = String(b.shortDescription || '').trim();
  const priceEgp = Number(b.priceEgp);
  const oldPriceEgp =
    b.oldPriceEgp !== undefined && b.oldPriceEgp !== null && b.oldPriceEgp !== ''
      ? Number(b.oldPriceEgp)
      : null;
  const unit = String(b.unit || '').trim() || 'قطعة';
  const categoryId = String(b.categoryId || '').trim();
  const imageUrl = String(b.image || '').trim();
  const stockQuantity = Math.max(0, Math.floor(Number(b.stockQuantity ?? 0)));
  const isActive = b.isActive === false ? 0 : 1;
  const isBestSeller = b.isBestSeller ? 1 : 0;
  const isNewArrival = b.isNewArrival ? 1 : 0;
  const isDailyDeal = b.isDailyDeal ? 1 : 0;

  if (name.length < 2) {
    res.status(400).json({ error: 'يرجى إدخال اسم المنتج' });
    return;
  }
  if (!Number.isFinite(priceEgp) || priceEgp <= 0) {
    res.status(400).json({ error: 'يرجى إدخال سعر صحيح أكبر من صفر' });
    return;
  }
  if (!categoryId) {
    res.status(400).json({ error: 'يرجى اختيار القسم' });
    return;
  }
  const catExists = db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId);
  if (!catExists) {
    res.status(400).json({ error: 'القسم المختار غير موجود' });
    return;
  }

  const id = `prod_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO products (
      id, name, short_description, price_egp, old_price_egp, unit, category_id,
      image_url, stock_quantity, is_active, is_best_seller, is_new_arrival, is_daily_deal,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    name,
    shortDescription,
    priceEgp,
    oldPriceEgp && Number.isFinite(oldPriceEgp) && oldPriceEgp > priceEgp ? oldPriceEgp : null,
    unit,
    categoryId,
    imageUrl,
    stockQuantity,
    isActive,
    isBestSeller,
    isNewArrival,
    isDailyDeal,
    now,
    now,
  );

  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Record<string, unknown>;
  broadcastEvent('catalog_updated');
  res.status(201).json({ product: mapProduct(row) });
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'المنتج غير موجود' });
    return;
  }

  const b = req.body ?? {};
  const name = String(b.name ?? existing.name).trim();
  const shortDescription = String(b.shortDescription ?? existing.short_description).trim();
  const priceEgp = Number(b.priceEgp ?? existing.price_egp);
  const oldPriceEgp =
    b.oldPriceEgp !== undefined && b.oldPriceEgp !== null && b.oldPriceEgp !== ''
      ? Number(b.oldPriceEgp)
      : null;
  const unit = String(b.unit ?? existing.unit).trim();
  const categoryId = String(b.categoryId ?? existing.category_id).trim();
  const imageUrl = String(b.image ?? existing.image_url).trim();
  const stockQuantity = Math.max(0, Math.floor(Number(b.stockQuantity ?? existing.stock_quantity)));
  const isActive =
    b.isActive !== undefined ? (b.isActive ? 1 : 0) : Number(existing.is_active);
  const isBestSeller =
    b.isBestSeller !== undefined ? (b.isBestSeller ? 1 : 0) : Number(existing.is_best_seller);
  const isNewArrival =
    b.isNewArrival !== undefined ? (b.isNewArrival ? 1 : 0) : Number(existing.is_new_arrival);
  const isDailyDeal =
    b.isDailyDeal !== undefined ? (b.isDailyDeal ? 1 : 0) : Number(existing.is_daily_deal);

  if (name.length < 2 || !Number.isFinite(priceEgp) || priceEgp <= 0) {
    res.status(400).json({ error: 'بيانات المنتج أو السعر غير صالحة' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE products SET
      name = ?, short_description = ?, price_egp = ?, old_price_egp = ?, unit = ?,
      category_id = ?, image_url = ?, stock_quantity = ?, is_active = ?,
      is_best_seller = ?, is_new_arrival = ?, is_daily_deal = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    name,
    shortDescription,
    priceEgp,
    oldPriceEgp && Number.isFinite(oldPriceEgp) && oldPriceEgp > priceEgp ? oldPriceEgp : null,
    unit,
    categoryId,
    imageUrl,
    stockQuantity,
    isActive,
    isBestSeller,
    isNewArrival,
    isDailyDeal,
    now,
    id,
  );

  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Record<string, unknown>;
  broadcastEvent('catalog_updated');
  res.json({ product: mapProduct(row) });
});

app.patch('/api/admin/products/:id/toggle', requireAdmin, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT is_active FROM products WHERE id = ?').get(id) as
    | { is_active: number }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'المنتج غير موجود' });
    return;
  }
  const nextActive = existing.is_active === 1 ? 0 : 1;
  db.prepare('UPDATE products SET is_active = ?, updated_at = ? WHERE id = ?').run(
    nextActive,
    new Date().toISOString(),
    id,
  );
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Record<string, unknown>;
  broadcastEvent('catalog_updated');
  res.json({ product: mapProduct(row) });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM products WHERE id = ?').run(id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'المنتج غير موجود' });
    return;
  }
  broadcastEvent('catalog_updated');
  res.json({ ok: true });
});

// Categories management
app.post('/api/admin/categories', requireAdmin, (req, res) => {
  const b = req.body ?? {};
  const name = String(b.name || '').trim();
  const subtitle = String(b.subtitle || '').trim() || 'منتجات مختارة';
  const iconKey = String(b.iconKey || 'basket');
  if (name.length < 2) {
    res.status(400).json({ error: 'يرجى إدخال اسم القسم' });
    return;
  }
  const id = `cat_${crypto.randomBytes(4).toString('hex')}`;
  const maxOrder = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM categories')
    .get() as { m: number };
  db.prepare(
    'INSERT INTO categories (id, name, subtitle, icon_key, is_active, sort_order) VALUES (?, ?, ?, ?, 1, ?)',
  ).run(id, name, subtitle, iconKey, maxOrder.m + 1);
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as Record<string, unknown>;
  broadcastEvent('catalog_updated');
  res.status(201).json({ category: mapCategory(row) });
});

app.put('/api/admin/categories/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'القسم غير موجود' });
    return;
  }
  const b = req.body ?? {};
  const name = String(b.name ?? existing.name).trim();
  const subtitle = String(b.subtitle ?? existing.subtitle).trim();
  const isActive = b.isActive !== undefined ? (b.isActive ? 1 : 0) : Number(existing.is_active);
  db.prepare('UPDATE categories SET name = ?, subtitle = ?, is_active = ? WHERE id = ?').run(
    name,
    subtitle,
    isActive,
    id,
  );
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as Record<string, unknown>;
  broadcastEvent('catalog_updated');
  res.json({ category: mapCategory(row) });
});

app.delete('/api/admin/categories/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const prodCount = db
    .prepare('SELECT COUNT(*) as count FROM products WHERE category_id = ?')
    .get(id) as { count: number };
  if (prodCount.count > 0) {
    res.status(400).json({ error: 'لا يمكن حذف قسم يحتوي على منتجات، انقل المنتجات أو احذفها أولًا' });
    return;
  }
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  broadcastEvent('catalog_updated');
  res.json({ ok: true });
});

// Delivery Zones management
app.post('/api/admin/zones', requireAdmin, (req, res) => {
  const b = req.body ?? {};
  const name = String(b.name || '').trim();
  const deliveryFee = Number(b.deliveryFee);
  if (name.length < 2 || !Number.isFinite(deliveryFee) || deliveryFee < 0) {
    res.status(400).json({ error: 'يرجى إدخال اسم المنطقة ورسوم توصيل صالحة' });
    return;
  }
  const id = `zone_${crypto.randomBytes(4).toString('hex')}`;
  const maxOrder = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM delivery_zones')
    .get() as { m: number };
  db.prepare(
    'INSERT INTO delivery_zones (id, name, delivery_fee, is_active, sort_order) VALUES (?, ?, ?, 1, ?)',
  ).run(id, name, deliveryFee, maxOrder.m + 1);
  const row = db.prepare('SELECT * FROM delivery_zones WHERE id = ?').get(id) as Record<
    string,
    unknown
  >;
  broadcastEvent('settings_updated');
  res.status(201).json({ zone: mapZone(row) });
});

app.put('/api/admin/zones/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM delivery_zones WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'منطقة التوصيل غير موجودة' });
    return;
  }
  const b = req.body ?? {};
  const name = String(b.name ?? existing.name).trim();
  const deliveryFee = Number(b.deliveryFee ?? existing.delivery_fee);
  const isActive = b.isActive !== undefined ? (b.isActive ? 1 : 0) : Number(existing.is_active);
  if (name.length < 2 || !Number.isFinite(deliveryFee) || deliveryFee < 0) {
    res.status(400).json({ error: 'بيانات المنطقة غير صالحة' });
    return;
  }
  db.prepare('UPDATE delivery_zones SET name = ?, delivery_fee = ?, is_active = ? WHERE id = ?').run(
    name,
    deliveryFee,
    isActive,
    id,
  );
  const row = db.prepare('SELECT * FROM delivery_zones WHERE id = ?').get(id) as Record<
    string,
    unknown
  >;
  broadcastEvent('settings_updated');
  res.json({ zone: mapZone(row) });
});

app.delete('/api/admin/zones/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM delivery_zones WHERE id = ?').run(id);
  broadcastEvent('settings_updated');
  res.json({ ok: true });
});

// Store Settings
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const b = req.body ?? {};
  const storeName = String(b.storeName || 'أسواق الواحة').trim();
  const supportPhone = String(b.supportPhone || '').trim();
  const defaultDeliveryFee = Math.max(0, Number(b.defaultDeliveryFee ?? 20));
  const minOrderEgp = Math.max(0, Number(b.minOrderEgp ?? 0));
  const isOpen = b.isOpen === false ? 0 : 1;
  const announcement = String(b.announcement || '').trim();

  db.prepare(
    `UPDATE store_settings SET
      store_name = ?, support_phone = ?, default_delivery_fee = ?,
      min_order_egp = ?, is_open = ?, announcement = ?
     WHERE id = 1`,
  ).run(storeName, supportPhone, defaultDeliveryFee, minOrderEgp, isOpen, announcement);

  const row = db.prepare('SELECT * FROM store_settings WHERE id = 1').get() as Record<
    string,
    unknown
  >;
  broadcastEvent('settings_updated');
  res.json({ settings: mapSettings(row) });
});

// Order Status Management
const ALLOWED_STATUSES = ['new', 'preparing', 'out_for_delivery', 'completed', 'cancelled'] as const;

app.patch('/api/admin/orders/:id/status', requireAdmin, (req, res) => {
  const { id } = req.params;
  const nextStatus = String(req.body?.status || '');
  if (!ALLOWED_STATUSES.includes(nextStatus as (typeof ALLOWED_STATUSES)[number])) {
    res.status(400).json({ error: 'حالة الطلب غير صالحة' });
    return;
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) {
      db.exec('ROLLBACK');
      res.status(404).json({ error: 'الطلب غير موجود' });
      return;
    }

    const prevStatus = String(existing.status);
    const now = new Date().toISOString();

    // Restore stock if cancelling a non-cancelled order
    if (nextStatus === 'cancelled' && prevStatus !== 'cancelled') {
      const items = db
        .prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?')
        .all(id) as { product_id: string; quantity: number }[];
      const restoreStmt = db.prepare(
        'UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?',
      );
      for (const it of items) {
        restoreStmt.run(it.quantity, now, it.product_id);
      }
      broadcastEvent('catalog_updated');
    }

    db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(
      nextStatus,
      now,
      id,
    );
    db.exec('COMMIT');

    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Record<
      string,
      unknown
    >;
    broadcastEvent('orders_updated');
    res.json({ order: mapOrdersWithItems([updated])[0] });
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore
    }
    console.error('Order status update error:', err);
    res.status(500).json({ error: 'تعذر تحديث حالة الطلب' });
  }
});

// ==========================================
// Start Vite (dev) or Serve Built Assets (prod)
// ==========================================
async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*splat', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT) || 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Al-Waha Market server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
