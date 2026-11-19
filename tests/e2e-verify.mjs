import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

class ApiClient {
  constructor({ useCookies = true } = {}) {
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

    const res = await fetch(`${BASE}${urlPath}`, { ...options, headers });
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

    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // non-json
    }
    return { status: res.status, ok: res.ok, json, text };
  }
}

async function run() {
  // Simulate Phone A (Admin with cookies blocked in mobile iframe -> uses X-Admin-Token)
  const adminPhoneA = new ApiClient({ useCookies: false });
  // Simulate Phone B (Customer with cookies blocked in mobile iframe -> uses X-Guest-Token / X-Customer-Token)
  const customerPhoneB = new ApiClient({ useCookies: false });
  // Simulate Phone C (Standard cookie browser, another customer)
  const otherCustomerPhoneC = new ApiClient({ useCookies: true });

  console.log('1. Checking initial empty catalog (0 pre-seeded products)...');
  const boot0 = await customerPhoneB.req('/api/bootstrap');
  assert.equal(boot0.status, 200);
  assert.equal(boot0.json.products.length, 0, 'Store must start with 0 mock products');
  assert.equal(boot0.json.categories.length, 11, 'Store starts with 11 categories');
  assert.ok(boot0.json.zones.length >= 1, 'Delivery zones available');

  console.log('2. Testing Admin bootstrap, cookieless token auth & strict role protection...');
  const unauthDash = await customerPhoneB.req('/api/admin/dashboard');
  assert.equal(unauthDash.status, 401, 'Unauthenticated user must be blocked from Admin dashboard');

  const forgedAdmin = await customerPhoneB.req('/api/admin/dashboard', {
    headers: { 'X-Admin-Token': 'forged.token.value' },
  });
  assert.equal(forgedAdmin.status, 401, 'Forged admin token must be rejected');

  const status0 = await adminPhoneA.req('/api/admin/status');
  assert.equal(status0.json.hasAdmin, false);

  const bootAdm = await adminPhoneA.req('/api/admin/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'اختبار المدير',
      email: 'owner-test@alwaha.local',
      password: 'StrongPassword123',
    }),
  });
  assert.equal(bootAdm.status, 201);
  assert.ok(bootAdm.json.adminToken, 'Server must return signed adminToken');
  assert.equal(bootAdm.json.admin.role, 'super_admin');
  adminPhoneA.adminToken = bootAdm.json.adminToken;

  // Verify cookieless dashboard access immediately works after bootstrap
  const dashAfterBootstrap = await adminPhoneA.req('/api/admin/dashboard');
  assert.equal(
    dashAfterBootstrap.status,
    200,
    'Cookieless mobile/iframe admin must access dashboard right after bootstrap',
  );

  // Ensure second bootstrap is strictly blocked (403)
  const bootDup = await customerPhoneB.req('/api/admin/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Attacker',
      email: 'attacker@alwaha.local',
      password: 'StrongPassword123',
    }),
  });
  assert.equal(bootDup.status, 403, 'Duplicate admin bootstrap must be rejected');

  // Test logout & real login
  await adminPhoneA.req('/api/admin/logout', { method: 'POST' });
  adminPhoneA.adminToken = null;

  const badLogin = await adminPhoneA.req('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner-test@alwaha.local', password: 'WrongPassword' }),
  });
  assert.equal(badLogin.status, 401);

  const goodLogin = await adminPhoneA.req('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner-test@alwaha.local', password: 'StrongPassword123' }),
  });
  assert.equal(goodLogin.status, 200);
  adminPhoneA.adminToken = goodLogin.json.adminToken;

  // Register a real customer on Phone C & verify customer CANNOT access admin endpoints (403)
  const regCustC = await otherCustomerPhoneC.req('/api/customer/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'عميل عادي',
      phone: '01099887766',
      email: 'cust-c@alwaha.local',
      password: 'CustomerPass123',
    }),
  });
  assert.equal(regCustC.status, 201);
  assert.ok(regCustC.json.customerToken);

  const custTryingAdmin = await otherCustomerPhoneC.req('/api/admin/dashboard');
  assert.equal(custTryingAdmin.status, 403, 'Authenticated customer must receive 403 on admin routes');

  const custTokenInAdminHeader = await customerPhoneB.req('/api/admin/dashboard', {
    headers: { 'X-Admin-Token': regCustC.json.customerToken },
  });
  assert.equal(
    custTokenInAdminHeader.status,
    403,
    'Customer token passed in X-Admin-Token must be rejected with 403',
  );

  console.log('3. Admin Phone A uploads real product image & creates product...');
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  const form = new FormData();
  form.append('image', new Blob([pngBytes], { type: 'image/png' }), 'milk.png');

  const uploadRes = await adminPhoneA.req('/api/admin/upload', {
    method: 'POST',
    body: form,
  });
  assert.equal(uploadRes.status, 201);
  assert.ok(uploadRes.json.imageUrl.startsWith('/uploads/'));

  const imgFetch = await fetch(`${BASE}${uploadRes.json.imageUrl}`);
  assert.equal(imgFetch.status, 200, 'Uploaded image must be served statically');

  const createProd = await adminPhoneA.req('/api/admin/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'حليب طبيعي طازج',
      shortDescription: 'حليب كامل الدسم عبوة لتر',
      priceEgp: 45,
      unit: 'عبوة 1 لتر',
      categoryId: 'dairy',
      image: uploadRes.json.imageUrl,
      stockQuantity: 10,
      isActive: true,
      isBestSeller: false,
      isNewArrival: true,
      isDailyDeal: false,
    }),
  });
  assert.equal(createProd.status, 201);
  const prodId = createProd.json.product.id;

  console.log('4. Customer Phone B sees live product & submits order with GPS coordinates...');
  const boot1 = await customerPhoneB.req('/api/bootstrap');
  assert.equal(boot1.json.products.length, 1);
  assert.equal(boot1.json.products[0].priceEgp, 45);
  const zone = boot1.json.zones[0];

  const orderRes = await customerPhoneB.req('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: 'أحمد علي',
      customerPhone: '01012345678',
      zoneId: zone.id,
      streetAddress: 'شارع 9 المعادي',
      buildingNumber: '12',
      floor: '3',
      apartment: '5',
      notes: 'الاتصال عند الوصول',
      lat: 29.960212,
      lng: 31.256913,
      gpsAccuracy: 14,
      subtotalEgp: 1,
      totalEgp: 1,
      items: [{ productId: prodId, quantity: 2 }],
    }),
  });
  assert.equal(orderRes.status, 201);
  assert.ok(orderRes.json.guestToken, 'Server returns guestToken for cookieless order tracking');
  customerPhoneB.guestToken = orderRes.json.guestToken;
  assert.equal(orderRes.json.order.subtotalEgp, 90);
  assert.equal(orderRes.json.order.deliveryFeeEgp, zone.deliveryFee);
  assert.equal(orderRes.json.order.totalEgp, 90 + zone.deliveryFee);
  assert.equal(orderRes.json.order.lat, 29.960212);
  assert.equal(orderRes.json.order.lng, 31.256913);
  const orderId = orderRes.json.order.id;

  // Verify stock was deducted atomically (10 -> 8)
  const bootAfterOrder = await customerPhoneB.req('/api/bootstrap');
  assert.equal(bootAfterOrder.json.products[0].stockQuantity, 8);

  // Verify Phone C CANNOT see Phone B's order
  const otherOrders = await otherCustomerPhoneC.req('/api/orders/my');
  assert.equal(otherOrders.json.orders.length, 0, 'Other customer must not see someone else orders');

  // Verify Phone B sees their own order via X-Guest-Token
  const myOrders = await customerPhoneB.req('/api/orders/my');
  assert.equal(myOrders.json.orders.length, 1);
  assert.equal(myOrders.json.orders[0].id, orderId);

  console.log('5. Admin Phone A sees order with GPS + items and updates order status...');
  const dashRes = await adminPhoneA.req('/api/admin/dashboard');
  assert.equal(dashRes.status, 200);
  assert.equal(dashRes.json.stats.totalOrders, 1);
  assert.equal(dashRes.json.stats.newOrders, 1);
  assert.equal(dashRes.json.orders[0].lat, 29.960212);
  assert.equal(dashRes.json.orders[0].customerName, 'أحمد علي');

  const acceptRes = await adminPhoneA.req(`/api/admin/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'preparing' }),
  });
  assert.equal(acceptRes.status, 200);
  assert.equal(acceptRes.json.order.status, 'preparing');

  // Verify customer Phone B sees updated order status
  const myOrdersUpdated = await customerPhoneB.req('/api/orders/my');
  assert.equal(myOrdersUpdated.json.orders[0].status, 'preparing');

  console.log('6. Admin modifies price, cancels order (stock restored)...');
  const priceEdit = await adminPhoneA.req(`/api/admin/products/${prodId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priceEgp: 50 }),
  });
  assert.equal(priceEdit.status, 200);
  assert.equal(priceEdit.json.product.priceEgp, 50);

  const cancelRes = await adminPhoneA.req(`/api/admin/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled' }),
  });
  assert.equal(cancelRes.status, 200);

  const bootRestored = await customerPhoneB.req('/api/bootstrap');
  assert.equal(bootRestored.json.products[0].stockQuantity, 10, 'Stock must be restored on cancel');
  assert.equal(bootRestored.json.products[0].priceEgp, 50, 'Customer sees updated price');

  console.log('ALL E2E MULTI-DEVICE & RBAC SECURITY TESTS PASSED!');
}

run().catch((err) => {
  console.error('E2E TEST FAILED:', err);
  process.exit(1);
});
