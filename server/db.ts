import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = path.resolve(process.cwd(), process.env.OASIS_DATA_DIR || 'data');
export const UPLOADS_DIR = path.resolve(process.cwd(), process.env.OASIS_UPLOADS_DIR || 'uploads');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'oasis.db'));

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function ensureColumn(table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'super_admin',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      icon_key TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
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
      updated_at TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON UPDATE CASCADE
    );

    CREATE TABLE IF NOT EXISTS delivery_zones (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      delivery_fee REAL NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS store_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      store_name TEXT NOT NULL,
      support_phone TEXT NOT NULL,
      default_delivery_fee REAL NOT NULL,
      min_order_egp REAL NOT NULL,
      is_open INTEGER NOT NULL DEFAULT 1,
      announcement TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS orders (
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
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      unit TEXT NOT NULL,
      unit_price_egp REAL NOT NULL,
      quantity INTEGER NOT NULL,
      line_total_egp REAL NOT NULL,
      image_url TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS product_reviews (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      customer_id TEXT,
      author_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_product_reviews_product
      ON product_reviews(product_id, created_at DESC);
  `);

  // Safe migrations for existing databases (preserves registered admin & data)
  ensureColumn('admins', 'role', "TEXT NOT NULL DEFAULT 'super_admin'");
  ensureColumn('admins', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('customers', 'role', "TEXT NOT NULL DEFAULT 'customer'");

  // Seed default 11 categories ONLY if categories table is empty (NO products are ever seeded!)
  const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number };
  if (catCount.count === 0) {
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

    const insertCat = db.prepare(
      'INSERT INTO categories (id, name, subtitle, icon_key, is_active, sort_order) VALUES (?, ?, ?, ?, 1, ?)',
    );
    for (const [id, name, subtitle, iconKey, sortOrder] of defaultCategories) {
      insertCat.run(id, name, subtitle, iconKey, sortOrder);
    }
  }

  // Seed default delivery zones ONLY if table is empty (admin can edit/delete/add anytime)
  const zoneCount = db.prepare('SELECT COUNT(*) as count FROM delivery_zones').get() as {
    count: number;
  };
  if (zoneCount.count === 0) {
    const defaultZones = [
      ['zone-maadi', 'المعادي', 20, 1],
      ['zone-nasr', 'مدينة نصر', 25, 2],
      ['zone-heliopolis', 'مصر الجديدة', 25, 3],
      ['zone-tagamoa', 'التجمع الخامس', 30, 4],
      ['zone-zayed', 'الشيخ زايد', 35, 5],
    ] as const;
    const insertZone = db.prepare(
      'INSERT INTO delivery_zones (id, name, delivery_fee, is_active, sort_order) VALUES (?, ?, ?, 1, ?)',
    );
    for (const [id, name, fee, order] of defaultZones) {
      insertZone.run(id, name, fee, order);
    }
  }

  // Seed store settings row if missing
  const settingsRow = db.prepare('SELECT id FROM store_settings WHERE id = 1').get();
  if (!settingsRow) {
    db.prepare(
      `INSERT INTO store_settings (id, store_name, support_phone, default_delivery_fee, min_order_egp, is_open, announcement)
       VALUES (1, ?, ?, ?, ?, 1, ?)`,
    ).run('أسواق الواحة', '', 20, 0, 'مرحبًا بكم في أسواق الواحة — التوصيل متاح حسب المنطقة');
  }
}
