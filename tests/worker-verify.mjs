import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/index.ts';

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, 'dist');
const TMP_DB_PATH = '/tmp/oasis-worker-test.db';

function cleanupTmpDb() {
  for (const suffix of ['', '-wal', '-shm']) {
    const p = `${TMP_DB_PATH}${suffix}`;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

function createSqliteD1Adapter(sqliteDb) {
  function createStatement(sql, boundValues = []) {
    return {
      bind(...values) {
        return createStatement(sql, values);
      },
      async first(colName) {
        const stmt = sqliteDb.prepare(sql);
        const row = stmt.get(...boundValues);
        if (!row) return null;
        if (colName) return row[colName] ?? null;
        return { ...row };
      },
      async all() {
        const stmt = sqliteDb.prepare(sql);
        const rows = stmt.all(...boundValues).map((r) => ({ ...r }));
        return { results: rows, success: true, meta: {} };
      },
      async run() {
        const stmt = sqliteDb.prepare(sql);
        const info = stmt.run(...boundValues);
        return {
          results: [],
          success: true,
          meta: {
            changes: Number(info.changes ?? 0),
            last_row_id: Number(info.lastInsertRowid ?? 0),
          },
        };
      },
    };
  }

  return {
    prepare(sql) {
      return createStatement(sql);
    },
    async batch(statements) {
      const results = [];
      sqliteDb.exec('BEGIN');
      try {
        for (const st of statements) {
          results.push(await st.run());
        }
        sqliteDb.exec('COMMIT');
      } catch (err) {
        sqliteDb.exec('ROLLBACK');
        throw err;
      }
      return results;
    },
    async exec(sql) {
      sqliteDb.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
}

function getMimeType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function createDistAssetsFetcher(distRoot) {
  return {
    async fetch(input) {
      const url = typeof input === 'string' ? new URL(input) : new URL(input.url);
      let reqPath = decodeURIComponent(url.pathname);
      if (reqPath === '/') reqPath = '/index.html';

      const normalized = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
      let target = path.join(distRoot, normalized);

      if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
        // Cloudflare Workers "not_found_handling": "single-page-application"
        if (reqPath.startsWith('/assets/')) {
          return new Response('Not Found', { status: 404 });
        }
        target = path.join(distRoot, 'index.html');
      }

      const data = fs.readFileSync(target);
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': getMimeType(target) },
      });
    },
  };
}

class WorkerClient {
  constructor(env, { useCookies = true } = {}) {
    this.env = env;
    this.useCookies = useCookies;
    this.cookies = new Map();
    this.adminToken = null;
    this.customerToken = null;
    this.guestToken = null;
  }

  async req(urlPath, options = {}) {
    const headers = new Headers(options.headers || {});
    if (this.useCookies && this.cookies.size > 0) {
      headers.set(
        'cookie',
        Array.from(this.cookies.entries())
          .map(([k, v]) => `${k}=${v}`)
          .join('; '),
      );
    }
    if (!this.useCookies) {
      if (urlPath.startsWith('/api/admin') && this.adminToken) {
        headers.set('X-Admin-Token', this.adminToken);
      }
      if (!urlPath.startsWith('/api/admin')) {
        if (this.customerToken) headers.set('X-Customer-Token', this.customerToken);
        if (this.guestToken) headers.set('X-Guest-Token', this.guestToken);
      }
    }

    const request = new Request(`https://alwaha-market.example.workers.dev${urlPath}`, {
      ...options,
      headers,
    });
    const res = await worker.fetch(request, this.env);

    if (this.useCookies) {
      const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
      for (const raw of setCookies) {
        const pair = raw.split(';')[0];
        const eq = pair.indexOf('=');
        if (eq > 0) {
          const name = pair.slice(0, eq).trim();
          const val = pair.slice(eq + 1).trim();
          if (val === '' || raw.includes('Max-Age=0')) {
            this.cookies.delete(name);
          } else {
            this.cookies.set(name, val);
          }
        }
      }
    }

    const buf = await res.arrayBuffer();
    const text = new TextDecoder().decode(buf);
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // non-json response
    }
    return {
      status: res.status,
      ok: res.ok,
      headers: res.headers,
      json,
      text,
      bytes: new Uint8Array(buf),
    };
  }
}

async function run() {
  cleanupTmpDb();
  assert.ok(fs.existsSync(path.join(DIST_DIR, 'index.html')), 'dist/index.html must exist');

  const assets = createDistAssetsFetcher(DIST_DIR);

  console.log('1. Testing missing D1 binding graceful 503 JSON error & healthcheck...');
  const noDbClient = new WorkerClient({ ASSETS: assets });
  const healthNoDb = await noDbClient.req('/api/health');
  assert.equal(healthNoDb.status, 200);
  assert.equal(healthNoDb.json.ok, true);
  assert.equal(healthNoDb.json.runtime, 'cloudflare-workers');

  const bootNoDb = await noDbClient.req('/api/bootstrap');
  assert.equal(bootNoDb.status, 503);
  assert.ok(bootNoDb.json.error.includes('D1'), 'Missing DB should return helpful Arabic D1 error');

  const sqlite = new DatabaseSync(TMP_DB_PATH);
  const env = {
    DB: createSqliteD1Adapter(sqlite),
    ASSETS: assets,
    GOOGLE_MAPS_API_KEY: 'test-maps-key-for-worker',
  };

  try {
    const adminPhoneA = new WorkerClient(env, { useCookies: false });
    const customerPhoneB = new WorkerClient(env, { useCookies: false });
    const otherCustomerPhoneC = new WorkerClient(env, { useCookies: true });

    console.log('2. Testing production HTML, CSS, JS, bundled hero image & SPA fallback...');
    const rootRes = await customerPhoneB.req('/');
    assert.equal(rootRes.status, 200);
    assert.ok(rootRes.headers.get('content-type')?.includes('text/html'));
    assert.ok(
      !rootRes.text.includes('/src/main.tsx'),
      'Built HTML must NOT reference raw /src/main.tsx',
    );
    const assetMatches = [...rootRes.text.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(
      (m) => m[1],
    );
    assert.ok(assetMatches.length >= 2, 'Built HTML must reference bundled /assets/*.js and *.css');

    for (const assetPath of assetMatches) {
      const assetRes = await customerPhoneB.req(assetPath);
      assert.equal(assetRes.status, 200, `Asset ${assetPath} must return 200`);
    }

    // Also verify bundled jpg hero image exists in dist/assets
    const distAssets = fs.readdirSync(path.join(DIST_DIR, 'assets'));
    const heroAsset = distAssets.find((f) => f.includes('oasis_hero_banner') && f.endsWith('.jpg'));
    assert.ok(heroAsset, 'Bundled hero banner image must exist in dist/assets');
    const heroRes = await customerPhoneB.req(`/assets/${heroAsset}`);
    assert.equal(heroRes.status, 200);
    assert.ok(heroRes.headers.get('content-type')?.includes('image/jpeg'));

    // Unknown SPA path falls back to index.html, while unknown /api/* returns 404 JSON
    const spaFallback = await customerPhoneB.req('/store/category/dairy');
    assert.equal(spaFallback.status, 200);
    assert.ok(spaFallback.text.includes('أسواق الواحة'));
    const api404 = await customerPhoneB.req('/api/does-not-exist');
    assert.equal(api404.status, 404);
    assert.ok(api404.json.error);

    console.log('3. Testing D1 auto-schema bootstrap (0 mock products, 11 categories, 5 zones)...');
    const boot0 = await customerPhoneB.req('/api/bootstrap');
    assert.equal(boot0.status, 200);
    assert.equal(boot0.json.products.length, 0);
    assert.equal(boot0.json.categories.length, 11);
    assert.equal(boot0.json.zones.length, 5);
    assert.equal(boot0.json.settings.storeName, 'أسواق الواحة');
    assert.equal(boot0.json.mapsApiKey, 'test-maps-key-for-worker');

    const streamRes = await customerPhoneB.req('/api/stream');
    assert.equal(streamRes.status, 200);
    assert.ok(streamRes.text.includes('"mode":"serverless"'));

    console.log('4. Testing Worker RBAC, admin bootstrap, login, and customer 403 block...');
    const unauthDash = await customerPhoneB.req('/api/admin/dashboard');
    assert.equal(unauthDash.status, 401);

    const bootAdm = await adminPhoneA.req('/api/admin/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'صاحب السوبر ماركت',
        email: 'worker-admin@alwaha.local',
        password: 'StrongWorkerPassword123',
      }),
    });
    assert.equal(bootAdm.status, 201);
    assert.ok(bootAdm.json.adminToken);
    assert.equal(bootAdm.json.admin.role, 'super_admin');
    adminPhoneA.adminToken = bootAdm.json.adminToken;

    const dupBoot = await customerPhoneB.req('/api/admin/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Rogue',
        email: 'rogue@alwaha.local',
        password: 'StrongWorkerPassword123',
      }),
    });
    assert.equal(dupBoot.status, 403);

    await adminPhoneA.req('/api/admin/logout', { method: 'POST' });
    adminPhoneA.adminToken = null;

    const loginRes = await adminPhoneA.req('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'worker-admin@alwaha.local',
        password: 'StrongWorkerPassword123',
      }),
    });
    assert.equal(loginRes.status, 200);
    adminPhoneA.adminToken = loginRes.json.adminToken;

    const dashOk = await adminPhoneA.req('/api/admin/dashboard');
    assert.equal(dashOk.status, 200);

    const regCust = await otherCustomerPhoneC.req('/api/customer/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'عميل ووركر',
        phone: '01055443322',
        email: 'cust-worker@alwaha.local',
        password: 'CustomerPass123',
      }),
    });
    assert.equal(regCust.status, 201);
    const custAdmin403 = await otherCustomerPhoneC.req('/api/admin/dashboard');
    assert.equal(custAdmin403.status, 403);

    console.log('5. Testing D1 image upload (/api/admin/upload -> /uploads/:id) & product CRUD...');
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    const form = new FormData();
    form.append('image', new Blob([pngBytes], { type: 'image/png' }), 'cheese.png');

    const uploadRes = await adminPhoneA.req('/api/admin/upload', {
      method: 'POST',
      body: form,
    });
    assert.equal(uploadRes.status, 201);
    assert.ok(uploadRes.json.imageUrl.startsWith('/uploads/'));

    const imgGet = await customerPhoneB.req(uploadRes.json.imageUrl);
    assert.equal(imgGet.status, 200);
    assert.equal(imgGet.headers.get('content-type'), 'image/png');
    assert.equal(Buffer.compare(Buffer.from(imgGet.bytes), pngBytes), 0);

    const createProd = await adminPhoneA.req('/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'جبنة رومي قديمة',
        shortDescription: 'جبنة رومي فاخرة بالكيلو',
        priceEgp: 220,
        unit: 'كيلو',
        categoryId: 'dairy',
        image: uploadRes.json.imageUrl,
        stockQuantity: 12,
        isActive: true,
        isBestSeller: true,
        isNewArrival: false,
        isDailyDeal: true,
      }),
    });
    assert.equal(createProd.status, 201);
    const prodId = createProd.json.product.id;

    console.log('6. Testing multi-phone customer order with GPS + stock deduction & cancellation...');
    const boot1 = await customerPhoneB.req('/api/bootstrap');
    assert.equal(boot1.json.products.length, 1);
    assert.equal(boot1.json.products[0].priceEgp, 220);
    const zone = boot1.json.zones[0];

    const orderRes = await customerPhoneB.req('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'سارة محمد',
        customerPhone: '01122334455',
        zoneId: zone.id,
        streetAddress: 'شارع النصر - المعادي',
        buildingNumber: '8',
        floor: '2',
        apartment: '4',
        notes: 'توصيل سريع',
        lat: 29.9611,
        lng: 31.2622,
        gpsAccuracy: 12,
        items: [{ productId: prodId, quantity: 3 }],
      }),
    });
    assert.equal(orderRes.status, 201);
    assert.ok(orderRes.json.guestToken);
    customerPhoneB.guestToken = orderRes.json.guestToken;
    assert.equal(orderRes.json.order.subtotalEgp, 660);
    assert.equal(orderRes.json.order.totalEgp, 660 + zone.deliveryFee);
    assert.equal(orderRes.json.order.lat, 29.9611);
    assert.equal(orderRes.json.order.lng, 31.2622);
    const orderId = orderRes.json.order.id;

    const bootAfterOrder = await customerPhoneB.req('/api/bootstrap');
    assert.equal(bootAfterOrder.json.products[0].stockQuantity, 9);

    const otherOrders = await otherCustomerPhoneC.req('/api/orders/my');
    assert.equal(otherOrders.json.orders.length, 0);

    const myOrders = await customerPhoneB.req('/api/orders/my');
    assert.equal(myOrders.json.orders.length, 1);
    assert.equal(myOrders.json.orders[0].id, orderId);

    const dash2 = await adminPhoneA.req('/api/admin/dashboard');
    assert.equal(dash2.status, 200);
    assert.equal(dash2.json.stats.totalOrders, 1);
    assert.equal(dash2.json.orders[0].lat, 29.9611);

    const prepRes = await adminPhoneA.req(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'preparing' }),
    });
    assert.equal(prepRes.status, 200);
    assert.equal(prepRes.json.order.status, 'preparing');

    const cancelRes = await adminPhoneA.req(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.json.order.status, 'cancelled');

    const bootRestored = await customerPhoneB.req('/api/bootstrap');
    assert.equal(bootRestored.json.products[0].stockQuantity, 12);

    console.log('ALL CLOUDFLARE WORKER + D1 + ASSETS TESTS PASSED!');
  } finally {
    sqlite.close();
    cleanupTmpDb();
  }
}

run().catch((err) => {
  console.error('WORKER VERIFY FAILED:', err);
  cleanupTmpDb();
  process.exit(1);
});
