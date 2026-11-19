package com.alwaha.market.data

import com.alwaha.market.model.Category
import com.alwaha.market.model.Product

object InitialCatalog {
    val categories = listOf(
        Category("vegetables", "الخضروات", "طازجة يوميًا"),
        Category("fruits", "الفواكه", "موسمية منتقاة"),
        Category("dairy", "الألبان والجبن", "حليب وأجبان"),
        Category("meat", "اللحوم والدواجن", "مذبوحة يوميًا"),
        Category("beverages", "المشروبات", "عصائر ومياه وقهوة"),
        Category("bakery", "المخبوزات", "مخبوزة طازجة"),
        Category("sweets", "الحلويات", "شرقية وغربية"),
        Category("grocery", "البقالة", "أساسيات المطبخ"),
        Category("cleaning", "المنظفات", "عناية بالمنزل"),
        Category("personal_care", "العناية الشخصية", "منتجات يومية"),
        Category("frozen", "المجمدات", "تجميد سريع آمن")
    )

    // Starts empty: only the supermarket manager adds live products and prices
    val products: List<Product> = emptyList()
}
