export type AppTab = 'home' | 'categories' | 'cart' | 'orders' | 'account' | 'admin';

export interface Category {
  id: string;
  name: string;
  subtitle: string;
  iconKey: string;
  isActive: boolean;
  sortOrder: number;
}

export interface Product {
  id: string;
  name: string;
  shortDescription: string;
  priceEgp: number;
  oldPriceEgp?: number;
  unit: string;
  categoryId: string;
  image: string;
  stockQuantity: number;
  isActive: boolean;
  isAvailable: boolean;
  isBestSeller?: boolean;
  isNewArrival?: boolean;
  isDailyDeal?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface DeliveryZone {
  id: string;
  name: string;
  deliveryFee: number;
  isActive: boolean;
  sortOrder: number;
}

export interface StoreSettings {
  storeName: string;
  supportPhone: string;
  defaultDeliveryFee: number;
  minOrderEgp: number;
  isOpen: boolean;
  announcement: string;
}

export interface DeliveryAddress {
  zoneId: string;
  area: string;
  streetDetails: string;
  buildingNumber: string;
  floor: string;
  apartment: string;
  lat: number | null;
  lng: number | null;
  gpsAccuracy: number | null;
}

export type OrderStatus = 'new' | 'preparing' | 'out_for_delivery' | 'completed' | 'cancelled';

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  unit: string;
  unitPriceEgp: number;
  quantity: number;
  lineTotalEgp: number;
  imageUrl: string;
}

export interface Order {
  id: string;
  orderNumber: number;
  customerName: string;
  customerPhone: string;
  zoneId: string;
  zoneName: string;
  streetAddress: string;
  buildingNumber: string;
  floor: string;
  apartment: string;
  notes: string;
  lat: number | null;
  lng: number | null;
  gpsAccuracy: number | null;
  subtotalEgp: number;
  deliveryFeeEgp: number;
  discountEgp: number;
  totalEgp: number;
  paymentMethod: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export interface CustomerProfile {
  id: string;
  name: string;
  phone: string;
  email: string;
}

export interface AdminProfile {
  id: string;
  email: string;
  name: string;
  role?: string;
}

export interface AdminStats {
  totalOrders: number;
  newOrders: number;
  preparingOrders: number;
  outForDeliveryOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalSalesEgp: number;
}

export interface AdminDashboardData {
  stats: AdminStats;
  categories: Category[];
  products: Product[];
  zones: DeliveryZone[];
  orders: Order[];
  settings: StoreSettings;
}

export interface ProductReview {
  id: string;
  productId: string;
  authorName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface ProductReviewSummary {
  averageRating: number;
  totalCount: number;
}

export interface ReorderNotice {
  orderNumber: number;
  addedCount: number;
  unavailableNames: string[];
  cappedNames: string[];
}
