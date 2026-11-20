// Cloudflare Workers Backend for Al-Waha Markets (أسواق الواحة)
// Pure Web Standards (no Node.js fs/express/node:sqlite) + Cloudflare D1 shared database.

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: {
    changes?: number;
    duration?: number;
    last_row_id?: number;
  };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<unknown>;
}

export interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

export interface WorkerEnv {
  DB?: D1Database;
  ASSETS?: Fetcher;
  SESSION_SECRET?: string;
  GOOGLE_MAPS_API_KEY?: string;
  VITE_GOOGLE_MAPS_API_KEY?: string;
}

const ADMIN_COOKIE = 'oasis_admin_session';
const CUSTOMER_COOKIE = 'oasis_customer_session';
const GUEST_COOKIE = 'oasis_guest_token';
const ALLOWED_STATUSES = ['new', 'preparing', 'out_for_delivery', 'completed', 'cancelled'] as const;

let schemaInitialized = false;
let cachedSessionSecret: string | null = null;

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Permissions-Policy': 'geolocation=(self)',
    ...extraHeaders,
  });
  return new Response(JSON.stringify(body), { status, headers });
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.trim();
  const len = Math.floor(clean.length / 2);
  const out = new Uint8Array(new ArrayBuffer(len));
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function base64UrlEncode(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array<ArrayBuffer> {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return `pbkdf2$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash.startsWith('pbkdf2$')) {
    return false;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;
  const salt = hexToBytes(parts[1]);
  const expected = hexToBytes(parts[2]);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return constantTimeEqual(new Uint8Array(bits), expected);
}

interface SessionPayload {
  sub: string;
  role: 'admin' | 'customer';
  exp: number;
}

async function getSessionSecret(db: D1Database, env: WorkerEnv): Promise<string> {
  if (env.SESSION_SECRET && env.SESSION_SECRET.length >= 32) {
    return env.SESSION_SECRET;
  }
  if (cachedSessionSecret) return cachedSessionSecret;

  const existing = await db
    .prepare("SELECT value FROM app_secrets WHERE key = 'session_secret'")
    .first<{ value: string }>();
  if (existing?.value && existing.value.length >= 32) {
    cachedSessionSecret = existing.value;
    return existing.value;
  }

  const fresh = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  await db
    .prepare("INSERT OR IGNORE INTO app_secrets (key, value, created_at) VALUES ('session_secret', ?, ?)")
    .bind(fresh, new Date().toISOString())
    .run();

  const row = await db
    .prepare("SELECT value FROM app_secrets WHERE key = 'session_secret'")
    .first<{ value: string }>();
  cachedSessionSecret = row?.value || fresh;
  return cachedSessionSecret;
}

async function signSessionToken(
  secret: string,
  payload: Omit<SessionPayload, 'exp'>,
  ttlSeconds = 60 * 60 * 24 * 7,
): Promise<string> {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = base64UrlEncode(new TextEncoder().encode(JSON.stringify(fullPayload)));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encoded));
  return `${encoded}.${base64UrlEncode(new Uint8Array(sigBuf))}`;
}

async function verifySessionToken(
  secret: string,
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;
  const encoded = token.slice(0, dotIdx);
  const sigStr = token.slice(dotIdx + 1);

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const expectedSig = new Uint8Array(
      await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encoded)),
    );
    const providedSig = base64UrlDecode(sigStr);
    if (!constantTimeEqual(expectedSig, providedSig)) return null;

    const parsed = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(encoded)),
    ) as SessionPayload;
    if (!parsed.sub || !parsed.role || typeof parsed.exp !== 'number') return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('cookie');
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    try {
      const key = decodeURIComponent(part.slice(0, eqIdx).trim());
      const val = decodeURIComponent(part.slice(eqIdx + 1).trim());
      result[key] = val;
    } catch {
      // ignore malformed cookie fragment
    }
  }
  return result;
}

function buildCookieHeader(
  request: Request,
  name: string,
  value: string,
  maxAgeSeconds: number,
): string {
  const url = new URL(request.url);
  const isHttps = url.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  const attrs = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isHttps) {
    attrs.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    attrs.push('SameSite=Lax');
  }
  return attrs.join('; ');
}

function getHeaderToken(request: Request, name: string): string | undefined {
  const val = request.headers.get(name);
  return val && val.trim().length > 0 ? val.trim() : undefined;
}

function getBearerToken(request: Request): string | undefined {
  const auth = request.headers.get('authorization');
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token.length > 0) return token;
  }
  return undefined;
}

async function ensureDatabaseReady(db: D1Database): Promise<void> {
  if (schemaInitialized) return;

  const statements = [
    db.prepare(`CREATE TABLE IF NOT EXISTS app_secrets (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'super_admin',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer',
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      icon_key TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      short_description TEXT NOT NULL,
      price_egp REAL NOT NULL,
      old_price_egp REAL,
      unit TEXT NOT NULL,
      category_id TEXT NOT NULL,
      image_url TEXT NOT NULL,
      stock_quantity INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_best_seller INTEGER NOT NULL DEFAULT 0,
      is_new_arrival INTEGER NOT NULL DEFAULT 0,
      is_daily_deal INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS delivery_zones (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      delivery_fee REAL NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS store_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      store_name TEXT NOT NULL,
      support_phone TEXT NOT NULL,
      default_delivery_fee REAL NOT NULL,
      min_order_egp REAL NOT NULL,
      is_open INTEGER NOT NULL DEFAULT 1,
      announcement TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number INTEGER NOT NULL,
      customer_token TEXT NOT NULL,
      customer_id TEXT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      zone_id TEXT NOT NULL,
      zone_name TEXT NOT NULL,
      street_address TEXT NOT NULL,
      building_number TEXT NOT NULL,
      floor TEXT NOT NULL,
      apartment TEXT NOT NULL,
      notes TEXT NOT NULL,
      lat REAL,
      lng REAL,
      gps_accuracy REAL,
      subtotal_egp REAL NOT NULL,
      delivery_fee_egp REAL NOT NULL,
      discount_egp REAL NOT NULL DEFAULT 0,
      total_egp REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash_on_delivery',
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      unit TEXT NOT NULL,
      unit_price_egp REAL NOT NULL,
      quantity INTEGER NOT NULL,
      line_total_egp REAL NOT NULL,
      image_url TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      mime_type TEXT NOT NULL,
      data_base64 TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS product_reviews (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      customer_id TEXT,
      author_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_product_reviews_product
      ON product_reviews(product_id, created_at DESC)`),
  ];

  await db.batch(statements);

  // Seed default 11 categories ONLY if empty (0 products are ever seeded)
  const catCount = await db
    .prepare('SELECT COUNT(*) as count FROM categories')
    .first<{ count: number }>();
  if (!catCount || Number(catCount.count) === 0) {
    const defaultCategories = [
      ['vegetables', 'الخضروات', 'طازجة يوميًا', 'leaf', 1],
      ['fruits', 'الفواكه', 'موسمية منتقاة', 'apple', 2],
      ['dairy', 'الألبان والجبن', 'حليب وأجبان', 'milk', 3],
      ['meat', 'اللحوم والدواجن', 'مذبوحة يوميًا', 'beef', 4],
      ['beverages', 'المشروبات', 'عصائر ومياه وقهوة', 'cup', 5],
      ['bakery', 'المخبوزات', 'مخبوزة طازجة', 'croissant', 6],
      ['sweets', 'الحلويات', 'شرقية وغربية', 'cake', 7],
      ['grocery', 'البقالة', 'أساسيات المطبخ', 'basket', 8],
      ['cleaning', 'المنظفات', 'عناية بالمنزل', 'sparkles', 9],
      ['personal_care', 'العناية الشخصية', 'منتجات يومية', 'heart', 10],
      ['frozen', 'المجمدات', 'تجميد سريع آمن', 'snowflake', 11],
    ] as const;
    await db.batch(
      defaultCategories.map(([id, name, subtitle, iconKey, sortOrder]) =>
        db
          .prepare(
            'INSERT OR IGNORE INTO categories (id, name, subtitle, icon_key, is_active, sort_order) VALUES (?, ?, ?, ?, 1, ?)',
          )
          .bind(id, name, subtitle, iconKey, sortOrder),
      ),
    );
  }

  const zoneCount = await db
    .prepare('SELECT COUNT(*) as count FROM delivery_zones')
    .first<{ count: number }>();
  if (!zoneCount || Number(zoneCount.count) === 0) {
    const defaultZones = [
      ['zone-maadi', 'المعادي', 20, 1],
      ['zone-nasr', 'مدينة نصر', 25, 2],
      ['zone-heliopolis', 'مصر الجديدة', 25, 3],
      ['zone-tagamoa', 'التجمع الخامس', 30, 4],
      ['zone-zayed', 'الشيخ زايد', 35, 5],
    ] as const;
    await db.batch(
      defaultZones.map(([id, name, fee, order]) =>
        db
          .prepare(
            'INSERT OR IGNORE INTO delivery_zones (id, name, delivery_fee, is_active, sort_order) VALUES (?, ?, ?, 1, ?)',
          )
          .bind(id, name, fee, order),
      ),
    );
  }

  const settingsRow = await db.prepare('SELECT id FROM store_settings WHERE id = 1').first();
  if (!settingsRow) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO store_settings (id, store_name, support_phone, default_delivery_fee, min_order_egp, is_open, announcement)
         VALUES (1, ?, ?, ?, ?, 1, ?)`,
      )
      .bind('أسواق الواحة', '', 20, 0, 'مرحبًا بكم في أسواق الواحة — التوصيل متاح حسب المنطقة')
      .run();
  }

  schemaInitialized = true;
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
    oldPriceEgp:
      row.old_price_egp !== null && row.old_price_egp !== undefined
        ? Number(row.old_price_egp)
        : undefined,
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

function mapSettings(row: Record<string, unknown> | null) {
  if (!row) {
    return {
      storeName: 'أسواق الواحة',
      supportPhone: '',
      defaultDeliveryFee: 20,
      minOrderEgp: 0,
      isOpen: true,
      announcement: '',
    };
  }
  return {
    storeName: String(row.store_name),
    supportPhone: String(row.support_phone),
    defaultDeliveryFee: Number(row.default_delivery_fee),
    minOrderEgp: Number(row.min_order_egp),
    isOpen: Number(row.is_open) === 1,
    announcement: String(row.announcement || ''),
  };
}

async function mapOrdersWithItems(db: D1Database, orderRows: Record<string, unknown>[]) {
  if (orderRows.length === 0) return [];
  const results = [];
  for (const row of orderRows) {
    const itemsRes = await db
      .prepare('SELECT * FROM order_items WHERE order_id = ?')
      .bind(String(row.id))
      .all<Record<string, unknown>>();
    const items = itemsRes.results || [];
    results.push({
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
      gpsAccuracy:
        row.gps_accuracy !== null && row.gps_accuracy !== undefined
          ? Number(row.gps_accuracy)
          : null,
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
    });
  }
  return results;
}

interface AdminRow {
  id: string;
  email: string;
  name: string;
  role: string;
}

async function getAuthenticatedAdmin(
  request: Request,
  db: D1Database,
  secret: string,
): Promise<AdminRow | null> {
  const cookies = parseCookies(request);
  const rawToken =
    getHeaderToken(request, 'x-admin-token') ||
    getBearerToken(request) ||
    cookies[ADMIN_COOKIE];
  const payload = await verifySessionToken(secret, rawToken);
  if (!payload || payload.role !== 'admin') return null;
  return await db
    .prepare(
      "SELECT id, email, name, role FROM admins WHERE id = ? AND is_active = 1 AND role = 'super_admin'",
    )
    .bind(payload.sub)
    .first<AdminRow>();
}

async function getAuthenticatedCustomerId(
  request: Request,
  db: D1Database,
  secret: string,
): Promise<string | null> {
  const cookies = parseCookies(request);
  const rawToken =
    getHeaderToken(request, 'x-customer-token') ||
    getBearerToken(request) ||
    cookies[CUSTOMER_COOKIE];
  const payload = await verifySessionToken(secret, rawToken);
  if (!payload || payload.role !== 'customer') return null;
  const row = await db
    .prepare('SELECT id FROM customers WHERE id = ?')
    .bind(payload.sub)
    .first<{ id: string }>();
  return row?.id ?? null;
}

function getExistingGuestToken(request: Request): string | null {
  const cookies = parseCookies(request);
  const candidate = getHeaderToken(request, 'x-guest-token') || cookies[GUEST_COOKIE];
  if (candidate && /^[a-f0-9]{32,64}$/.test(candidate)) {
    return candidate;
  }
  return null;
}

async function requireAdmin(
  request: Request,
  db: D1Database,
  secret: string,
): Promise<{ admin: AdminRow } | { errorResponse: Response }> {
  const admin = await getAuthenticatedAdmin(request, db, secret);
  if (admin) {
    return { admin };
  }
  const anyToken =
    getHeaderToken(request, 'x-admin-token') ||
    getBearerToken(request) ||
    getHeaderToken(request, 'x-customer-token');
  const parsed = await verifySessionToken(secret, anyToken);
  if (parsed?.role === 'customer' || (await getAuthenticatedCustomerId(request, db, secret))) {
    return {
      errorResponse: jsonResponse(
        { error: 'غير مصرح: هذا الحساب مخصص للعملاء ولا يملك صلاحيات المدير الرئيسي' },
        403,
      ),
    };
  }
  return {
    errorResponse: jsonResponse(
      { error: 'غير مصرح: يرجى تسجيل الدخول بحساب المدير الرئيسي أولًا' },
      401,
    ),
  };
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    // Serve static frontend assets for non-API routes
    if (!pathname.startsWith('/api/') && !pathname.startsWith('/uploads/')) {
      if (env.ASSETS) {
        const assetRes = await env.ASSETS.fetch(request);
        const contentType = assetRes.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          const nextHeaders = new Headers(assetRes.headers);
          nextHeaders.set('Permissions-Policy', 'geolocation=(self)');
          return new Response(assetRes.body, {
            status: assetRes.status,
            statusText: assetRes.statusText,
            headers: nextHeaders,
          });
        }
        return assetRes;
      }
      return new Response('Static assets binding (ASSETS) not configured', { status: 404 });
    }

    if (pathname === '/api/health' && method === 'GET') {
      return jsonResponse({
        ok: true,
        runtime: 'cloudflare-workers',
        dbBound: Boolean(env.DB),
        assetsBound: Boolean(env.ASSETS),
        timestamp: Date.now(),
      });
    }

    if (pathname === '/api/stream' && method === 'GET') {
      // Immediate serverless handshake so frontend switches smoothly to smart polling sync
      const body = `data: ${JSON.stringify({ type: 'connected', mode: 'serverless', timestamp: Date.now() })}\n\n`;
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      });
    }

    if (!env.DB) {
      return jsonResponse(
        {
          error:
            'قاعدة بيانات Cloudflare D1 غير مربوطة بعد بالاسم البرمجي DB. يرجى ربط D1 Database في إعدادات Worker ثم إعادة النشر.',
        },
        503,
      );
    }

    try {
      await ensureDatabaseReady(env.DB);
      const db = env.DB;
      const secret = await getSessionSecret(db, env);

      // Serve uploaded images stored in D1 media_assets
      if (pathname.startsWith('/uploads/') && method === 'GET') {
        const assetId = decodeURIComponent(pathname.slice('/uploads/'.length));
        const media = await db
          .prepare('SELECT mime_type, data_base64 FROM media_assets WHERE id = ?')
          .bind(assetId)
          .first<{ mime_type: string; data_base64: string }>();
        if (!media) {
          return new Response('Not Found', { status: 404 });
        }
        const bytes = base64ToUint8Array(media.data_base64);
        return new Response(bytes.buffer as ArrayBuffer, {
          status: 200,
          headers: {
            'Content-Type': media.mime_type,
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      }

      // Public Storefront Bootstrap
      if (pathname === '/api/bootstrap' && method === 'GET') {
        const [catsRes, prodsRes, zonesRes, settingsRow] = await Promise.all([
          db
            .prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, name ASC')
            .all<Record<string, unknown>>(),
          db
            .prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY created_at DESC')
            .all<Record<string, unknown>>(),
          db
            .prepare(
              'SELECT * FROM delivery_zones WHERE is_active = 1 ORDER BY sort_order ASC, name ASC',
            )
            .all<Record<string, unknown>>(),
          db.prepare('SELECT * FROM store_settings WHERE id = 1').first<Record<string, unknown>>(),
        ]);

        const mapsApiKey = env.VITE_GOOGLE_MAPS_API_KEY || env.GOOGLE_MAPS_API_KEY || undefined;
        return jsonResponse({
          categories: (catsRes.results || []).map(mapCategory),
          products: (prodsRes.results || []).map(mapProduct),
          zones: (zonesRes.results || []).map(mapZone),
          settings: mapSettings(settingsRow),
          ...(mapsApiKey ? { mapsApiKey } : {}),
        });
      }

      // Product Star Ratings & Customer Reviews
      if (pathname.startsWith('/api/products/') && pathname.endsWith('/reviews')) {
        const productId = decodeURIComponent(
          pathname.slice('/api/products/'.length, -'/reviews'.length),
        ).trim();
        const product = await db
          .prepare('SELECT id FROM products WHERE id = ?')
          .bind(productId)
          .first();
        if (!product) {
          return jsonResponse({ error: 'المنتج غير موجود' }, 404);
        }

        const mapReview = (row: Record<string, unknown>) => ({
          id: String(row.id),
          productId: String(row.product_id),
          authorName: String(row.author_name),
          rating: Number(row.rating),
          comment: String(row.comment || ''),
          createdAt: String(row.created_at),
        });

        const loadSummary = async () => {
          const agg = await db
            .prepare(
              'SELECT COUNT(*) as totalCount, COALESCE(AVG(rating), 0) as avgRating FROM product_reviews WHERE product_id = ?',
            )
            .bind(productId)
            .first<{ totalCount: number; avgRating: number }>();
          const totalCount = Number(agg?.totalCount ?? 0);
          const averageRating =
            totalCount > 0 ? Math.round(Number(agg?.avgRating ?? 0) * 10) / 10 : 0;
          return { averageRating, totalCount };
        };

        if (method === 'GET') {
          const rowsRes = await db
            .prepare(
              'SELECT id, product_id, author_name, rating, comment, created_at FROM product_reviews WHERE product_id = ? ORDER BY created_at DESC LIMIT 50',
            )
            .bind(productId)
            .all<Record<string, unknown>>();
          return jsonResponse({
            reviews: (rowsRes.results || []).map(mapReview),
            summary: await loadSummary(),
          });
        }

        if (method === 'POST') {
          const customerId = await getAuthenticatedCustomerId(request, db, secret);
          let fallbackName = '';
          if (customerId) {
            const cust = await db
              .prepare('SELECT name FROM customers WHERE id = ?')
              .bind(customerId)
              .first<{ name: string }>();
            if (cust?.name) fallbackName = String(cust.name);
          }

          const body = await readJsonBody(request);
          const authorName = String(body.authorName ?? fallbackName).trim();
          const rating = Number(body.rating);
          const comment = String(body.comment || '').trim();

          if (authorName.length < 2 || authorName.length > 60) {
            return jsonResponse({ error: 'يرجى كتابة اسمك (من حرفين إلى 60 حرفًا)' }, 400);
          }
          if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return jsonResponse({ error: 'يرجى اختيار تقييم بالنجوم من 1 إلى 5' }, 400);
          }
          if (comment.length > 500) {
            return jsonResponse({ error: 'التعليق طويل جدًا (الحد الأقصى 500 حرف)' }, 400);
          }

          const id = `rev_${crypto.randomUUID()}`;
          const now = new Date().toISOString();
          await db
            .prepare(
              'INSERT INTO product_reviews (id, product_id, customer_id, author_name, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            )
            .bind(id, productId, customerId, authorName, rating, comment, now)
            .run();

          const inserted = await db
            .prepare(
              'SELECT id, product_id, author_name, rating, comment, created_at FROM product_reviews WHERE id = ?',
            )
            .bind(id)
            .first<Record<string, unknown>>();

          return jsonResponse(
            {
              review: inserted ? mapReview(inserted) : null,
              summary: await loadSummary(),
            },
            201,
          );
        }
      }

      // Customer Authentication
      if (pathname === '/api/customer/me' && method === 'GET') {
        const customerId = await getAuthenticatedCustomerId(request, db, secret);
        if (!customerId) return jsonResponse({ customer: null });
        const customer = await db
          .prepare('SELECT id, name, phone, email, created_at FROM customers WHERE id = ?')
          .bind(customerId)
          .first<Record<string, unknown>>();
        return jsonResponse({ customer: customer ?? null });
      }

      if (pathname === '/api/customer/register' && method === 'POST') {
        const body = await readJsonBody(request);
        const cleanEmail = String(body.email || '').trim().toLowerCase();
        const cleanName = String(body.name || '').trim();
        const cleanPhone = String(body.phone || '').trim();
        const cleanPass = String(body.password || '');

        if (
          cleanName.length < 2 ||
          cleanPhone.length < 8 ||
          !cleanEmail.includes('@') ||
          cleanPass.length < 6
        ) {
          return jsonResponse(
            {
              error:
                'يرجى إدخال الاسم ورقم الهاتف وبريد إلكتروني صحيح وكلمة مرور لا تقل عن 6 أحرف',
            },
            400,
          );
        }

        const existing = await db
          .prepare('SELECT id FROM customers WHERE email = ?')
          .bind(cleanEmail)
          .first();
        if (existing) {
          return jsonResponse({ error: 'البريد الإلكتروني مسجل بالفعل' }, 409);
        }

        const id = `cust_${crypto.randomUUID()}`;
        const now = new Date().toISOString();
        const passHash = await hashPassword(cleanPass);
        await db
          .prepare(
            "INSERT INTO customers (id, name, phone, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, 'customer', ?)",
          )
          .bind(id, cleanName, cleanPhone, cleanEmail, passHash, now)
          .run();

        const guestToken = getExistingGuestToken(request);
        if (guestToken) {
          await db
            .prepare(
              'UPDATE orders SET customer_id = ? WHERE customer_token = ? AND customer_id IS NULL',
            )
            .bind(id, guestToken)
            .run();
        }

        const token = await signSessionToken(secret, { sub: id, role: 'customer' });
        return jsonResponse(
          {
            customer: { id, name: cleanName, phone: cleanPhone, email: cleanEmail },
            customerToken: token,
          },
          201,
          { 'Set-Cookie': buildCookieHeader(request, CUSTOMER_COOKIE, token, 60 * 60 * 24 * 7) },
        );
      }

      if (pathname === '/api/customer/login' && method === 'POST') {
        const body = await readJsonBody(request);
        const cleanEmail = String(body.email || '').trim().toLowerCase();
        const cleanPass = String(body.password || '');

        const row = await db
          .prepare('SELECT id, name, phone, email, password_hash FROM customers WHERE email = ?')
          .bind(cleanEmail)
          .first<Record<string, unknown>>();

        if (!row || !(await verifyPassword(cleanPass, String(row.password_hash)))) {
          return jsonResponse({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' }, 401);
        }

        const guestToken = getExistingGuestToken(request);
        if (guestToken) {
          await db
            .prepare(
              'UPDATE orders SET customer_id = ? WHERE customer_token = ? AND customer_id IS NULL',
            )
            .bind(String(row.id), guestToken)
            .run();
        }

        const token = await signSessionToken(secret, { sub: String(row.id), role: 'customer' });
        return jsonResponse(
          {
            customer: {
              id: String(row.id),
              name: String(row.name),
              phone: String(row.phone),
              email: String(row.email),
            },
            customerToken: token,
          },
          200,
          { 'Set-Cookie': buildCookieHeader(request, CUSTOMER_COOKIE, token, 60 * 60 * 24 * 7) },
        );
      }

      if (pathname === '/api/customer/logout' && method === 'POST') {
        return jsonResponse({ ok: true }, 200, {
          'Set-Cookie': buildCookieHeader(request, CUSTOMER_COOKIE, '', 0),
        });
      }

      // Customer Orders
      if (pathname === '/api/orders/my' && method === 'GET') {
        const customerId = await getAuthenticatedCustomerId(request, db, secret);
        const guestToken = getExistingGuestToken(request);

        if (!customerId && !guestToken) {
          return jsonResponse({ orders: [] });
        }

        let rows: Record<string, unknown>[] = [];
        if (customerId && guestToken) {
          const res = await db
            .prepare(
              'SELECT * FROM orders WHERE customer_id = ? OR customer_token = ? ORDER BY created_at DESC',
            )
            .bind(customerId, guestToken)
            .all<Record<string, unknown>>();
          rows = res.results || [];
        } else if (customerId) {
          const res = await db
            .prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC')
            .bind(customerId)
            .all<Record<string, unknown>>();
          rows = res.results || [];
        } else if (guestToken) {
          const res = await db
            .prepare('SELECT * FROM orders WHERE customer_token = ? ORDER BY created_at DESC')
            .bind(guestToken)
            .all<Record<string, unknown>>();
          rows = res.results || [];
        }

        return jsonResponse({ orders: await mapOrdersWithItems(db, rows) });
      }

      if (pathname === '/api/orders' && method === 'POST') {
        const body = await readJsonBody(request);
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
          return jsonResponse({ error: 'يرجى إدخال اسم العميل بالكامل' }, 400);
        }
        if (customerPhone.length < 8) {
          return jsonResponse({ error: 'يرجى إدخال رقم هاتف صحيح للتواصل' }, 400);
        }
        if (!zoneId) {
          return jsonResponse({ error: 'يرجى اختيار منطقة التوصيل' }, 400);
        }
        if (streetAddress.length < 3) {
          return jsonResponse({ error: 'يرجى إدخال تفاصيل العنوان والشارع' }, 400);
        }
        if (items.length === 0) {
          return jsonResponse({ error: 'سلة المشتريات فارغة' }, 400);
        }

        const existingGuest = getExistingGuestToken(request);
        const guestToken = existingGuest || bytesToHex(crypto.getRandomValues(new Uint8Array(24)));
        const customerId = await getAuthenticatedCustomerId(request, db, secret);

        const settingsRow = await db
          .prepare('SELECT * FROM store_settings WHERE id = 1')
          .first<Record<string, unknown>>();
        if (settingsRow && Number(settingsRow.is_open) !== 1) {
          return jsonResponse(
            { error: 'المتجر مغلق مؤقتًا ولا يستقبل طلبات في الوقت الحالي' },
            400,
          );
        }

        const zoneRow = await db
          .prepare('SELECT * FROM delivery_zones WHERE id = ? AND is_active = 1')
          .bind(zoneId)
          .first<Record<string, unknown>>();
        if (!zoneRow) {
          return jsonResponse({ error: 'منطقة التوصيل المختارة غير متاحة حاليًا' }, 400);
        }

        const now = new Date().toISOString();
        const deductedItems: { productId: string; quantity: number }[] = [];
        const rollbackDeductions = async () => {
          for (const d of deductedItems) {
            await db
              .prepare(
                'UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?',
              )
              .bind(d.quantity, now, d.productId)
              .run();
          }
        };

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

        for (const rawItem of items) {
          const itemObj = (rawItem || {}) as Record<string, unknown>;
          const productId = String(itemObj.productId || '');
          const quantity = Number(itemObj.quantity || 0);
          if (!productId || !Number.isInteger(quantity) || quantity <= 0 || quantity > 999) {
            await rollbackDeductions();
            return jsonResponse({ error: 'كمية غير صالحة لأحد المنتجات' }, 400);
          }

          const prod = await db
            .prepare('SELECT * FROM products WHERE id = ?')
            .bind(productId)
            .first<Record<string, unknown>>();
          if (!prod || Number(prod.is_active) !== 1) {
            await rollbackDeductions();
            return jsonResponse({ error: 'أحد المنتجات في السلة لم يعد متاحًا للبيع حاليًا' }, 400);
          }

          const availableStock = Number(prod.stock_quantity);
          if (availableStock < quantity) {
            await rollbackDeductions();
            return jsonResponse(
              { error: `الكمية المتوفرة من "${String(prod.name)}" هي ${availableStock} فقط` },
              400,
            );
          }

          const deductRes = await db
            .prepare(
              'UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ? AND is_active = 1 AND stock_quantity >= ?',
            )
            .bind(quantity, now, productId, quantity)
            .run();
          if (!deductRes.meta.changes) {
            await rollbackDeductions();
            return jsonResponse(
              { error: `تعذر حجز الكمية المطلوبة من "${String(prod.name)}"` },
              400,
            );
          }
          deductedItems.push({ productId, quantity });

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
        const minOrderEgp = settingsRow ? Number(settingsRow.min_order_egp) : 0;
        if (subtotalEgp < minOrderEgp) {
          await rollbackDeductions();
          return jsonResponse(
            {
              error: `الحد الأدنى للطلب هو ${minOrderEgp} جنيه مصري (الإجمالي الحالي ${subtotalEgp} ج.م)`,
            },
            400,
          );
        }

        const deliveryFeeEgp = Number(zoneRow.delivery_fee);
        const totalEgp = Math.round((subtotalEgp + deliveryFeeEgp) * 100) / 100;
        const maxNumRow = await db
          .prepare('SELECT COALESCE(MAX(order_number), 1000) as maxNum FROM orders')
          .first<{ maxNum: number }>();
        const orderNumber = Number(maxNumRow?.maxNum ?? 1000) + 1;
        const orderId = `ord_${crypto.randomUUID()}`;

        const orderBatch = [
          db
            .prepare(
              `INSERT INTO orders (
                id, order_number, customer_token, customer_id, customer_name, customer_phone,
                zone_id, zone_name, street_address, building_number, floor, apartment, notes,
                lat, lng, gps_accuracy, subtotal_egp, delivery_fee_egp, discount_egp, total_egp,
                payment_method, status, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'cash_on_delivery', 'new', ?, ?)`,
            )
            .bind(
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
            ),
          ...verifiedItems.map((it) =>
            db
              .prepare(
                `INSERT INTO order_items (
                  id, order_id, product_id, product_name, unit, unit_price_egp, quantity, line_total_egp, image_url
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              )
              .bind(
                `oi_${crypto.randomUUID()}`,
                orderId,
                it.productId,
                it.productName,
                it.unit,
                it.unitPriceEgp,
                it.quantity,
                it.lineTotalEgp,
                it.imageUrl,
              ),
          ),
        ];

        await db.batch(orderBatch);
        const createdRow = await db
          .prepare('SELECT * FROM orders WHERE id = ?')
          .bind(orderId)
          .first<Record<string, unknown>>();
        const mapped = createdRow ? (await mapOrdersWithItems(db, [createdRow]))[0] : null;
        return jsonResponse({ order: mapped, guestToken }, 201, {
          'Set-Cookie': buildCookieHeader(request, GUEST_COOKIE, guestToken, 60 * 60 * 24 * 90),
        });
      }

      // Admin Authentication
      if (pathname === '/api/admin/status' && method === 'GET') {
        const countRow = await db
          .prepare("SELECT COUNT(*) as count FROM admins WHERE is_active = 1 AND role = 'super_admin'")
          .first<{ count: number }>();
        const admin = await getAuthenticatedAdmin(request, db, secret);
        return jsonResponse({
          hasAdmin: Number(countRow?.count ?? 0) > 0,
          admin,
        });
      }

      if (pathname === '/api/admin/bootstrap' && method === 'POST') {
        const countRow = await db
          .prepare('SELECT COUNT(*) as count FROM admins')
          .first<{ count: number }>();
        if (Number(countRow?.count ?? 0) > 0) {
          return jsonResponse(
            { error: 'حساب المدير الرئيسي مُفعّل بالفعل ولا يمكن إنشاء حساب إداري من هذه الصفحة' },
            403,
          );
        }

        const body = await readJsonBody(request);
        const cleanName = String(body.name || '').trim() || 'مدير أسواق الواحة';
        const cleanEmail = String(body.email || '').trim().toLowerCase();
        const cleanPass = String(body.password || '');
        if (!cleanEmail.includes('@') || cleanPass.length < 8) {
          return jsonResponse(
            { error: 'يرجى إدخال بريد إلكتروني صحيح وكلمة مرور لا تقل عن 8 أحرف' },
            400,
          );
        }

        const adminId = `adm_${crypto.randomUUID()}`;
        const now = new Date().toISOString();
        const passHash = await hashPassword(cleanPass);
        await db
          .prepare(
            "INSERT INTO admins (id, email, name, password_hash, role, is_active, created_at) VALUES (?, ?, ?, ?, 'super_admin', 1, ?)",
          )
          .bind(adminId, cleanEmail, cleanName, passHash, now)
          .run();

        const token = await signSessionToken(secret, { sub: adminId, role: 'admin' });
        return jsonResponse(
          {
            admin: { id: adminId, email: cleanEmail, name: cleanName, role: 'super_admin' },
            adminToken: token,
          },
          201,
          { 'Set-Cookie': buildCookieHeader(request, ADMIN_COOKIE, token, 60 * 60 * 24 * 7) },
        );
      }

      if (pathname === '/api/admin/login' && method === 'POST') {
        const body = await readJsonBody(request);
        const cleanEmail = String(body.email || '').trim().toLowerCase();
        const cleanPass = String(body.password || '');

        const row = await db
          .prepare('SELECT id, email, name, role, is_active, password_hash FROM admins WHERE email = ?')
          .bind(cleanEmail)
          .first<Record<string, unknown>>();

        if (!row || !(await verifyPassword(cleanPass, String(row.password_hash)))) {
          return jsonResponse({ error: 'بيانات دخول المدير غير صحيحة' }, 401);
        }
        if (Number(row.is_active) !== 1 || String(row.role) !== 'super_admin') {
          return jsonResponse(
            { error: 'هذا الحساب غير مفعّل أو لا يملك صلاحيات المدير الرئيسي' },
            403,
          );
        }

        const token = await signSessionToken(secret, { sub: String(row.id), role: 'admin' });
        return jsonResponse(
          {
            admin: {
              id: String(row.id),
              email: String(row.email),
              name: String(row.name),
              role: String(row.role),
            },
            adminToken: token,
          },
          200,
          { 'Set-Cookie': buildCookieHeader(request, ADMIN_COOKIE, token, 60 * 60 * 24 * 7) },
        );
      }

      if (pathname === '/api/admin/logout' && method === 'POST') {
        return jsonResponse({ ok: true }, 200, {
          'Set-Cookie': buildCookieHeader(request, ADMIN_COOKIE, '', 0),
        });
      }

      // Protected Admin Routes
      if (pathname.startsWith('/api/admin/')) {
        const authCheck = await requireAdmin(request, db, secret);
        if ('errorResponse' in authCheck) {
          return authCheck.errorResponse;
        }

        if (pathname === '/api/admin/dashboard' && method === 'GET') {
          const [catsRes, prodsRes, zonesRes, ordersRes, settingsRow] = await Promise.all([
            db
              .prepare('SELECT * FROM categories ORDER BY sort_order ASC, name ASC')
              .all<Record<string, unknown>>(),
            db
              .prepare('SELECT * FROM products ORDER BY created_at DESC')
              .all<Record<string, unknown>>(),
            db
              .prepare('SELECT * FROM delivery_zones ORDER BY sort_order ASC, name ASC')
              .all<Record<string, unknown>>(),
            db
              .prepare('SELECT * FROM orders ORDER BY created_at DESC')
              .all<Record<string, unknown>>(),
            db.prepare('SELECT * FROM store_settings WHERE id = 1').first<Record<string, unknown>>(),
          ]);

          const orders = await mapOrdersWithItems(db, ordersRes.results || []);
          const stats = {
            totalOrders: orders.length,
            newOrders: orders.filter((o) => o.status === 'new').length,
            preparingOrders: orders.filter((o) => o.status === 'preparing').length,
            outForDeliveryOrders: orders.filter((o) => o.status === 'out_for_delivery').length,
            completedOrders: orders.filter((o) => o.status === 'completed').length,
            cancelledOrders: orders.filter((o) => o.status === 'cancelled').length,
            totalSalesEgp:
              Math.round(
                orders
                  .filter((o) => o.status !== 'cancelled')
                  .reduce((sum, o) => sum + o.totalEgp, 0) * 100,
              ) / 100,
          };

          return jsonResponse({
            stats,
            categories: (catsRes.results || []).map(mapCategory),
            products: (prodsRes.results || []).map(mapProduct),
            zones: (zonesRes.results || []).map(mapZone),
            orders,
            settings: mapSettings(settingsRow),
          });
        }

        if (pathname === '/api/admin/upload' && method === 'POST') {
          const formData = await request.formData();
          const fileEntry = formData.get('image');
          if (!fileEntry || typeof fileEntry === 'string') {
            return jsonResponse({ error: 'لم يتم إرفاق صورة' }, 400);
          }
          const mimeType = fileEntry.type || 'image/jpeg';
          if (!mimeType.startsWith('image/')) {
            return jsonResponse({ error: 'يرجى اختيار ملف صورة صالح فقط (JPG / PNG / WebP)' }, 400);
          }
          const buf = await fileEntry.arrayBuffer();
          if (buf.byteLength > 950 * 1024) {
            return jsonResponse(
              { error: 'حجم الصورة كبير جدًا، يرجى اختيار صورة أصغر (أقل من 950 كيلوبايت)' },
              400,
            );
          }
          const ext = mimeType.includes('png')
            ? 'png'
            : mimeType.includes('webp')
              ? 'webp'
              : 'jpg';
          const assetId = `prod_${Date.now()}_${bytesToHex(crypto.getRandomValues(new Uint8Array(6)))}.${ext}`;
          await db
            .prepare(
              'INSERT INTO media_assets (id, mime_type, data_base64, created_at) VALUES (?, ?, ?, ?)',
            )
            .bind(assetId, mimeType, arrayBufferToBase64(buf), new Date().toISOString())
            .run();

          return jsonResponse({ imageUrl: `/uploads/${assetId}` }, 201);
        }

        if (pathname === '/api/admin/products' && method === 'POST') {
          const b = await readJsonBody(request);
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

          if (name.length < 2) return jsonResponse({ error: 'يرجى إدخال اسم المنتج' }, 400);
          if (!Number.isFinite(priceEgp) || priceEgp <= 0) {
            return jsonResponse({ error: 'يرجى إدخال سعر صحيح أكبر من صفر' }, 400);
          }
          if (!categoryId) return jsonResponse({ error: 'يرجى اختيار القسم' }, 400);

          const catExists = await db
            .prepare('SELECT id FROM categories WHERE id = ?')
            .bind(categoryId)
            .first();
          if (!catExists) return jsonResponse({ error: 'القسم المختار غير موجود' }, 400);

          const id = `prod_${crypto.randomUUID()}`;
          const now = new Date().toISOString();
          await db
            .prepare(
              `INSERT INTO products (
                id, name, short_description, price_egp, old_price_egp, unit, category_id,
                image_url, stock_quantity, is_active, is_best_seller, is_new_arrival, is_daily_deal,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              id,
              name,
              shortDescription,
              priceEgp,
              oldPriceEgp && Number.isFinite(oldPriceEgp) && oldPriceEgp > priceEgp
                ? oldPriceEgp
                : null,
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
            )
            .run();

          const row = await db
            .prepare('SELECT * FROM products WHERE id = ?')
            .bind(id)
            .first<Record<string, unknown>>();
          return jsonResponse({ product: row ? mapProduct(row) : null }, 201);
        }

        if (pathname.startsWith('/api/admin/products/')) {
          const rest = pathname.slice('/api/admin/products/'.length);
          if (rest.endsWith('/toggle') && method === 'PATCH') {
            const id = decodeURIComponent(rest.slice(0, -'/toggle'.length));
            const existing = await db
              .prepare('SELECT is_active FROM products WHERE id = ?')
              .bind(id)
              .first<{ is_active: number }>();
            if (!existing) return jsonResponse({ error: 'المنتج غير موجود' }, 404);
            const nextActive = Number(existing.is_active) === 1 ? 0 : 1;
            await db
              .prepare('UPDATE products SET is_active = ?, updated_at = ? WHERE id = ?')
              .bind(nextActive, new Date().toISOString(), id)
              .run();
            const row = await db
              .prepare('SELECT * FROM products WHERE id = ?')
              .bind(id)
              .first<Record<string, unknown>>();
            return jsonResponse({ product: row ? mapProduct(row) : null });
          }

          const id = decodeURIComponent(rest);
          if (method === 'PUT') {
            const existing = await db
              .prepare('SELECT * FROM products WHERE id = ?')
              .bind(id)
              .first<Record<string, unknown>>();
            if (!existing) return jsonResponse({ error: 'المنتج غير موجود' }, 404);

            const b = await readJsonBody(request);
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
            const stockQuantity = Math.max(
              0,
              Math.floor(Number(b.stockQuantity ?? existing.stock_quantity)),
            );
            const isActive =
              b.isActive !== undefined ? (b.isActive ? 1 : 0) : Number(existing.is_active);
            const isBestSeller =
              b.isBestSeller !== undefined
                ? b.isBestSeller
                  ? 1
                  : 0
                : Number(existing.is_best_seller);
            const isNewArrival =
              b.isNewArrival !== undefined
                ? b.isNewArrival
                  ? 1
                  : 0
                : Number(existing.is_new_arrival);
            const isDailyDeal =
              b.isDailyDeal !== undefined
                ? b.isDailyDeal
                  ? 1
                  : 0
                : Number(existing.is_daily_deal);

            if (name.length < 2 || !Number.isFinite(priceEgp) || priceEgp <= 0) {
              return jsonResponse({ error: 'بيانات المنتج أو السعر غير صالحة' }, 400);
            }

            const now = new Date().toISOString();
            await db
              .prepare(
                `UPDATE products SET
                  name = ?, short_description = ?, price_egp = ?, old_price_egp = ?, unit = ?,
                  category_id = ?, image_url = ?, stock_quantity = ?, is_active = ?,
                  is_best_seller = ?, is_new_arrival = ?, is_daily_deal = ?, updated_at = ?
                 WHERE id = ?`,
              )
              .bind(
                name,
                shortDescription,
                priceEgp,
                oldPriceEgp && Number.isFinite(oldPriceEgp) && oldPriceEgp > priceEgp
                  ? oldPriceEgp
                  : null,
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
              )
              .run();

            const row = await db
              .prepare('SELECT * FROM products WHERE id = ?')
              .bind(id)
              .first<Record<string, unknown>>();
            return jsonResponse({ product: row ? mapProduct(row) : null });
          }

          if (method === 'DELETE') {
            const result = await db.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
            if (!result.meta.changes) return jsonResponse({ error: 'المنتج غير موجود' }, 404);
            return jsonResponse({ ok: true });
          }
        }

        if (pathname === '/api/admin/categories' && method === 'POST') {
          const b = await readJsonBody(request);
          const name = String(b.name || '').trim();
          const subtitle = String(b.subtitle || '').trim() || 'منتجات مختارة';
          const iconKey = String(b.iconKey || 'basket');
          if (name.length < 2) return jsonResponse({ error: 'يرجى إدخال اسم القسم' }, 400);
          const id = `cat_${bytesToHex(crypto.getRandomValues(new Uint8Array(4)))}`;
          const maxOrder = await db
            .prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM categories')
            .first<{ m: number }>();
          await db
            .prepare(
              'INSERT INTO categories (id, name, subtitle, icon_key, is_active, sort_order) VALUES (?, ?, ?, ?, 1, ?)',
            )
            .bind(id, name, subtitle, iconKey, Number(maxOrder?.m ?? 0) + 1)
            .run();
          const row = await db
            .prepare('SELECT * FROM categories WHERE id = ?')
            .bind(id)
            .first<Record<string, unknown>>();
          return jsonResponse({ category: row ? mapCategory(row) : null }, 201);
        }

        if (pathname.startsWith('/api/admin/categories/')) {
          const id = decodeURIComponent(pathname.slice('/api/admin/categories/'.length));
          if (method === 'PUT') {
            const existing = await db
              .prepare('SELECT * FROM categories WHERE id = ?')
              .bind(id)
              .first<Record<string, unknown>>();
            if (!existing) return jsonResponse({ error: 'القسم غير موجود' }, 404);
            const b = await readJsonBody(request);
            const name = String(b.name ?? existing.name).trim();
            const subtitle = String(b.subtitle ?? existing.subtitle).trim();
            const isActive =
              b.isActive !== undefined ? (b.isActive ? 1 : 0) : Number(existing.is_active);
            await db
              .prepare('UPDATE categories SET name = ?, subtitle = ?, is_active = ? WHERE id = ?')
              .bind(name, subtitle, isActive, id)
              .run();
            const row = await db
              .prepare('SELECT * FROM categories WHERE id = ?')
              .bind(id)
              .first<Record<string, unknown>>();
            return jsonResponse({ category: row ? mapCategory(row) : null });
          }

          if (method === 'DELETE') {
            const prodCount = await db
              .prepare('SELECT COUNT(*) as count FROM products WHERE category_id = ?')
              .bind(id)
              .first<{ count: number }>();
            if (Number(prodCount?.count ?? 0) > 0) {
              return jsonResponse(
                { error: 'لا يمكن حذف قسم يحتوي على منتجات، انقل المنتجات أو احذفها أولًا' },
                400,
              );
            }
            await db.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
            return jsonResponse({ ok: true });
          }
        }

        if (pathname === '/api/admin/zones' && method === 'POST') {
          const b = await readJsonBody(request);
          const name = String(b.name || '').trim();
          const deliveryFee = Number(b.deliveryFee);
          if (name.length < 2 || !Number.isFinite(deliveryFee) || deliveryFee < 0) {
            return jsonResponse({ error: 'يرجى إدخال اسم المنطقة ورسوم توصيل صالحة' }, 400);
          }
          const id = `zone_${bytesToHex(crypto.getRandomValues(new Uint8Array(4)))}`;
          const maxOrder = await db
            .prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM delivery_zones')
            .first<{ m: number }>();
          await db
            .prepare(
              'INSERT INTO delivery_zones (id, name, delivery_fee, is_active, sort_order) VALUES (?, ?, ?, 1, ?)',
            )
            .bind(id, name, deliveryFee, Number(maxOrder?.m ?? 0) + 1)
            .run();
          const row = await db
            .prepare('SELECT * FROM delivery_zones WHERE id = ?')
            .bind(id)
            .first<Record<string, unknown>>();
          return jsonResponse({ zone: row ? mapZone(row) : null }, 201);
        }

        if (pathname.startsWith('/api/admin/zones/')) {
          const id = decodeURIComponent(pathname.slice('/api/admin/zones/'.length));
          if (method === 'PUT') {
            const existing = await db
              .prepare('SELECT * FROM delivery_zones WHERE id = ?')
              .bind(id)
              .first<Record<string, unknown>>();
            if (!existing) return jsonResponse({ error: 'منطقة التوصيل غير موجودة' }, 404);
            const b = await readJsonBody(request);
            const name = String(b.name ?? existing.name).trim();
            const deliveryFee = Number(b.deliveryFee ?? existing.delivery_fee);
            const isActive =
              b.isActive !== undefined ? (b.isActive ? 1 : 0) : Number(existing.is_active);
            if (name.length < 2 || !Number.isFinite(deliveryFee) || deliveryFee < 0) {
              return jsonResponse({ error: 'بيانات المنطقة غير صالحة' }, 400);
            }
            await db
              .prepare(
                'UPDATE delivery_zones SET name = ?, delivery_fee = ?, is_active = ? WHERE id = ?',
              )
              .bind(name, deliveryFee, isActive, id)
              .run();
            const row = await db
              .prepare('SELECT * FROM delivery_zones WHERE id = ?')
              .bind(id)
              .first<Record<string, unknown>>();
            return jsonResponse({ zone: row ? mapZone(row) : null });
          }

          if (method === 'DELETE') {
            await db.prepare('DELETE FROM delivery_zones WHERE id = ?').bind(id).run();
            return jsonResponse({ ok: true });
          }
        }

        if (pathname === '/api/admin/settings' && method === 'PUT') {
          const b = await readJsonBody(request);
          const storeName = String(b.storeName || 'أسواق الواحة').trim();
          const supportPhone = String(b.supportPhone || '').trim();
          const defaultDeliveryFee = Math.max(0, Number(b.defaultDeliveryFee ?? 20));
          const minOrderEgp = Math.max(0, Number(b.minOrderEgp ?? 0));
          const isOpen = b.isOpen === false ? 0 : 1;
          const announcement = String(b.announcement || '').trim();

          await db
            .prepare(
              `UPDATE store_settings SET
                store_name = ?, support_phone = ?, default_delivery_fee = ?,
                min_order_egp = ?, is_open = ?, announcement = ?
               WHERE id = 1`,
            )
            .bind(storeName, supportPhone, defaultDeliveryFee, minOrderEgp, isOpen, announcement)
            .run();

          const row = await db
            .prepare('SELECT * FROM store_settings WHERE id = 1')
            .first<Record<string, unknown>>();
          return jsonResponse({ settings: mapSettings(row) });
        }

        if (pathname.startsWith('/api/admin/orders/') && pathname.endsWith('/status') && method === 'PATCH') {
          const id = decodeURIComponent(
            pathname.slice('/api/admin/orders/'.length, -'/status'.length),
          );
          const body = await readJsonBody(request);
          const nextStatus = String(body.status || '');
          if (!ALLOWED_STATUSES.includes(nextStatus as (typeof ALLOWED_STATUSES)[number])) {
            return jsonResponse({ error: 'حالة الطلب غير صالحة' }, 400);
          }

          const existing = await db
            .prepare('SELECT * FROM orders WHERE id = ?')
            .bind(id)
            .first<Record<string, unknown>>();
          if (!existing) return jsonResponse({ error: 'الطلب غير موجود' }, 404);

          const prevStatus = String(existing.status);
          const now = new Date().toISOString();

          if (nextStatus === 'cancelled' && prevStatus !== 'cancelled') {
            const itemsRes = await db
              .prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?')
              .bind(id)
              .all<{ product_id: string; quantity: number }>();
            for (const it of itemsRes.results || []) {
              await db
                .prepare(
                  'UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?',
                )
                .bind(Number(it.quantity), now, String(it.product_id))
                .run();
            }
          }

          await db
            .prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?')
            .bind(nextStatus, now, id)
            .run();
          const updated = await db
            .prepare('SELECT * FROM orders WHERE id = ?')
            .bind(id)
            .first<Record<string, unknown>>();
          const mapped = updated ? (await mapOrdersWithItems(db, [updated]))[0] : null;
          return jsonResponse({ order: mapped });
        }
      }

      return jsonResponse({ error: 'المسار المطلوب غير موجود' }, 404);
    } catch (err) {
      console.error('Worker API error:', err);
      return jsonResponse({ error: 'حدث خطأ داخلي في الخادم، يرجى المحاولة مرة أخرى' }, 500);
    }
  },
};
