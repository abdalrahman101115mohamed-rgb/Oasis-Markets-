import {
  AdminDashboardData,
  AdminProfile,
  Category,
  CustomerProfile,
  DeliveryZone,
  Order,
  OrderStatus,
  Product,
  StoreSettings,
} from '../types/catalog';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const ADMIN_TOKEN_KEY = 'oasis_admin_token_v1';
const CUSTOMER_TOKEN_KEY = 'oasis_customer_token_v1';
const GUEST_TOKEN_KEY = 'oasis_guest_token_v1';

let memAdminToken: string | null = null;
let memCustomerToken: string | null = null;
let memGuestToken: string | null = null;

function readStorage(store: 'session' | 'local', key: string): string | null {
  try {
    const target = store === 'session' ? window.sessionStorage : window.localStorage;
    return target.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(store: 'session' | 'local', key: string, value: string | null): void {
  try {
    const target = store === 'session' ? window.sessionStorage : window.localStorage;
    if (value) {
      target.setItem(key, value);
    } else {
      target.removeItem(key);
    }
  } catch {
    // ignore storage quota / privacy mode restrictions
  }
}

export function getAdminToken(): string | null {
  return memAdminToken ?? readStorage('session', ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string | null): void {
  memAdminToken = token;
  writeStorage('session', ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  setAdminToken(null);
}

function getCustomerToken(): string | null {
  return memCustomerToken ?? readStorage('session', CUSTOMER_TOKEN_KEY);
}

function setCustomerToken(token: string | null): void {
  memCustomerToken = token;
  writeStorage('session', CUSTOMER_TOKEN_KEY, token);
}

function getGuestToken(): string | null {
  return memGuestToken ?? readStorage('local', GUEST_TOKEN_KEY);
}

function setGuestToken(token: string | null): void {
  memGuestToken = token;
  writeStorage('local', GUEST_TOKEN_KEY, token);
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const isAdminRoute = url.startsWith('/api/admin');
  const authHeaders: Record<string, string> = {};

  if (isAdminRoute) {
    const admToken = getAdminToken();
    if (admToken) {
      authHeaders['X-Admin-Token'] = admToken;
    }
  } else {
    const custToken = getCustomerToken();
    const gstToken = getGuestToken();
    if (custToken) authHeaders['X-Customer-Token'] = custToken;
    if (gstToken) authHeaders['X-Guest-Token'] = gstToken;
  }

  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...authHeaders,
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (
      isAdminRoute &&
      (res.status === 401 || res.status === 403) &&
      url !== '/api/admin/login' &&
      url !== '/api/admin/bootstrap'
    ) {
      clearAdminToken();
    }
    if (!isAdminRoute && url === '/api/customer/me' && res.status === 401) {
      setCustomerToken(null);
    }
    throw new ApiError(data.error || 'حدث خطأ في الاتصال بالخادم', res.status);
  }
  return data as T;
}

export interface BootstrapResponse {
  categories: Category[];
  products: Product[];
  zones: DeliveryZone[];
  settings: StoreSettings;
}

export function fetchBootstrap(): Promise<BootstrapResponse> {
  return apiFetch<BootstrapResponse>('/api/bootstrap');
}

export function fetchMyOrders(): Promise<{ orders: Order[] }> {
  return apiFetch<{ orders: Order[] }>('/api/orders/my');
}

export async function createOrder(payload: {
  customerName: string;
  customerPhone: string;
  zoneId: string;
  streetAddress: string;
  buildingNumber: string;
  floor: string;
  apartment: string;
  notes: string;
  lat: number | null;
  lng: number | null;
  gpsAccuracy: number | null;
  items: { productId: string; quantity: number }[];
}): Promise<{ order: Order }> {
  const res = await apiFetch<{ order: Order; guestToken?: string }>('/api/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (res.guestToken) {
    setGuestToken(res.guestToken);
  }
  return { order: res.order };
}

// Customer Auth
export function fetchCustomerMe(): Promise<{ customer: CustomerProfile | null }> {
  return apiFetch<{ customer: CustomerProfile | null }>('/api/customer/me');
}

export async function registerCustomer(payload: {
  name: string;
  phone: string;
  email: string;
  password: string;
}): Promise<{ customer: CustomerProfile }> {
  const res = await apiFetch<{ customer: CustomerProfile; customerToken?: string }>(
    '/api/customer/register',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
  if (res.customerToken) {
    setCustomerToken(res.customerToken);
  }
  return { customer: res.customer };
}

export async function loginCustomer(payload: {
  email: string;
  password: string;
}): Promise<{ customer: CustomerProfile }> {
  const res = await apiFetch<{ customer: CustomerProfile; customerToken?: string }>(
    '/api/customer/login',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
  if (res.customerToken) {
    setCustomerToken(res.customerToken);
  }
  return { customer: res.customer };
}

export async function logoutCustomer(): Promise<{ ok: boolean }> {
  try {
    return await apiFetch<{ ok: boolean }>('/api/customer/logout', { method: 'POST' });
  } finally {
    setCustomerToken(null);
  }
}

// Admin Auth & Dashboard
export function fetchAdminStatus(): Promise<{ hasAdmin: boolean; admin: AdminProfile | null }> {
  return apiFetch<{ hasAdmin: boolean; admin: AdminProfile | null }>('/api/admin/status');
}

export async function bootstrapAdmin(payload: {
  name: string;
  email: string;
  password: string;
}): Promise<{ admin: AdminProfile }> {
  const res = await apiFetch<{ admin: AdminProfile; adminToken?: string }>('/api/admin/bootstrap', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (res.adminToken) {
    setAdminToken(res.adminToken);
  }
  return { admin: res.admin };
}

export async function loginAdmin(payload: {
  email: string;
  password: string;
}): Promise<{ admin: AdminProfile }> {
  const res = await apiFetch<{ admin: AdminProfile; adminToken?: string }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (res.adminToken) {
    setAdminToken(res.adminToken);
  }
  return { admin: res.admin };
}

export async function logoutAdmin(): Promise<{ ok: boolean }> {
  try {
    return await apiFetch<{ ok: boolean }>('/api/admin/logout', { method: 'POST' });
  } finally {
    clearAdminToken();
  }
}

export function fetchAdminDashboard(): Promise<AdminDashboardData> {
  return apiFetch<AdminDashboardData>('/api/admin/dashboard');
}

export function uploadProductImage(file: File): Promise<{ imageUrl: string }> {
  const formData = new FormData();
  formData.append('image', file);
  return apiFetch<{ imageUrl: string }>('/api/admin/upload', {
    method: 'POST',
    body: formData,
  });
}

export function createAdminProduct(payload: {
  name: string;
  shortDescription: string;
  priceEgp: number;
  oldPriceEgp?: number | null;
  unit: string;
  categoryId: string;
  image: string;
  stockQuantity: number;
  isActive: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  isDailyDeal: boolean;
}): Promise<{ product: Product }> {
  return apiFetch<{ product: Product }>('/api/admin/products', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateAdminProduct(
  id: string,
  payload: Partial<{
    name: string;
    shortDescription: string;
    priceEgp: number;
    oldPriceEgp: number | null;
    unit: string;
    categoryId: string;
    image: string;
    stockQuantity: number;
    isActive: boolean;
    isBestSeller: boolean;
    isNewArrival: boolean;
    isDailyDeal: boolean;
  }>,
): Promise<{ product: Product }> {
  return apiFetch<{ product: Product }>(`/api/admin/products/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function toggleAdminProduct(id: string): Promise<{ product: Product }> {
  return apiFetch<{ product: Product }>(`/api/admin/products/${encodeURIComponent(id)}/toggle`, {
    method: 'PATCH',
  });
}

export function deleteAdminProduct(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/admin/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function createAdminCategory(payload: {
  name: string;
  subtitle: string;
  iconKey: string;
}): Promise<{ category: Category }> {
  return apiFetch<{ category: Category }>('/api/admin/categories', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateAdminCategory(
  id: string,
  payload: { name: string; subtitle: string; isActive: boolean },
): Promise<{ category: Category }> {
  return apiFetch<{ category: Category }>(`/api/admin/categories/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteAdminCategory(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/admin/categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function createAdminZone(payload: {
  name: string;
  deliveryFee: number;
}): Promise<{ zone: DeliveryZone }> {
  return apiFetch<{ zone: DeliveryZone }>('/api/admin/zones', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateAdminZone(
  id: string,
  payload: { name: string; deliveryFee: number; isActive: boolean },
): Promise<{ zone: DeliveryZone }> {
  return apiFetch<{ zone: DeliveryZone }>(`/api/admin/zones/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteAdminZone(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/admin/zones/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function updateAdminSettings(payload: StoreSettings): Promise<{ settings: StoreSettings }> {
  return apiFetch<{ settings: StoreSettings }>('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function updateAdminOrderStatus(
  id: string,
  status: OrderStatus,
): Promise<{ order: Order }> {
  return apiFetch<{ order: Order }>(`/api/admin/orders/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
