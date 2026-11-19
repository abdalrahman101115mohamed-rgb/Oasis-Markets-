package com.alwaha.market.model

data class Category(
    val id: String,
    val name: String,
    val subtitle: String
)

data class Product(
    val id: String,
    val name: String,
    val shortDescription: String,
    val priceEgp: Double,
    val oldPriceEgp: Double? = null,
    val unit: String,
    val isAvailable: Boolean,
    val categoryId: String,
    val isBestSeller: Boolean = false,
    val isNewArrival: Boolean = false,
    val isDailyDeal: Boolean = false
)

enum class AppTab(val label: String) {
    HOME("الرئيسية"),
    CATEGORIES("الأقسام"),
    CART("السلة"),
    ORDERS("طلباتي"),
    ACCOUNT("حسابي")
}
