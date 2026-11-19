package com.alwaha.market.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.alwaha.market.data.InitialCatalog
import com.alwaha.market.model.Product
import com.alwaha.market.ui.theme.*

@Composable
fun HomeScreen(
    searchQuery: String,
    onSearchChange: (String) -> Unit,
    deliveryArea: String,
    quantities: Map<String, Int>,
    onIncrement: (String) -> Unit,
    onDecrement: (String) -> Unit,
    onSelectCategory: (String) -> Unit
) {
    val filteredProducts = if (searchQuery.isBlank()) {
        InitialCatalog.products
    } else {
        InitialCatalog.products.filter {
            it.name.contains(searchQuery, ignoreCase = true) ||
                it.shortDescription.contains(searchQuery, ignoreCase = true)
        }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(OasisCanvas),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        // Delivery Location Row
        item {
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = OasisSurface,
                border = BorderStroke(1.dp, OasisBorder)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Filled.LocationOn,
                            contentDescription = null,
                            tint = OasisGreen
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Column {
                            Text("التوصيل إلى", fontSize = 11.sp, color = OasisMuted)
                            Text(deliveryArea, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = OasisInk)
                        }
                    }
                    Text("تغيير", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = OasisGreen)
                }
            }
        }

        // Product Search Bar
        item {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = onSearchChange,
                placeholder = { Text("ابحث عن الخضروات، الفواكه، الألبان...") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            )
        }

        // Offers & Discounts Banner
        if (searchQuery.isBlank()) {
            item {
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = OasisGreen
                ) {
                    Column(modifier = Modifier.padding(20.dp)) {
                        Text(
                            text = "عروض أسواق الواحة اليومية",
                            color = OasisGold,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "طازج من المزرعة إلى بيتك كل يوم",
                            color = Color.White,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "وفّر حتى ٢٥٪ على احتياجات منزلك اليومية.",
                            color = Color.White.copy(alpha = 0.9f),
                            fontSize = 14.sp
                        )
                    }
                }
            }

            // Main 11 Categories
            item {
                Text("الأقسام الرئيسية", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = OasisInk)
                Spacer(modifier = Modifier.height(10.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(InitialCatalog.categories) { cat ->
                        Surface(
                            shape = RoundedCornerShape(16.dp),
                            color = OasisSurface,
                            border = BorderStroke(1.dp, OasisBorder),
                            modifier = Modifier
                                .width(132.dp)
                                .clickable { onSelectCategory(cat.id) }
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text(cat.name, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = OasisInk, maxLines = 1)
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(cat.subtitle, fontSize = 11.sp, color = OasisMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
            }

            // Products sections (loaded dynamically from manager catalog)
            if (InitialCatalog.products.isEmpty()) {
                item {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = OasisSurface,
                        border = BorderStroke(1.dp, OasisBorder)
                    ) {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text("لم تُضف منتجات إلى المتجر بعد", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = OasisInk)
                            Spacer(modifier = Modifier.height(6.dp))
                            Text("يضيف مدير السوبر ماركت المنتجات والأسعار من لوحة التحكم لتظهر هنا فورًا.", fontSize = 13.sp, color = OasisMuted)
                        }
                    }
                }
            } else {
                val bestSellers = InitialCatalog.products.filter { it.isBestSeller }
                if (bestSellers.isNotEmpty()) {
                    item { ProductSection("المنتجات الأكثر مبيعًا", bestSellers, quantities, onIncrement, onDecrement) }
                }
                val newArrivals = InitialCatalog.products.filter { it.isNewArrival }
                if (newArrivals.isNotEmpty()) {
                    item { ProductSection("المنتجات الجديدة", newArrivals, quantities, onIncrement, onDecrement) }
                }
                val dailyDeals = InitialCatalog.products.filter { it.isDailyDeal }
                if (dailyDeals.isNotEmpty()) {
                    item { ProductSection("العروض اليومية", dailyDeals, quantities, onIncrement, onDecrement) }
                }
            }
        } else {
            items(filteredProducts) { product ->
                ProductRowCard(product, quantities[product.id] ?: 0, onIncrement, onDecrement)
            }
        }
    }
}

@Composable
private fun ProductSection(
    title: String,
    itemsList: List<Product>,
    quantities: Map<String, Int>,
    onIncrement: (String) -> Unit,
    onDecrement: (String) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(title, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = OasisInk)
        itemsList.forEach { product ->
            ProductRowCard(product, quantities[product.id] ?: 0, onIncrement, onDecrement)
        }
    }
}

@Composable
fun ProductRowCard(
    product: Product,
    qty: Int,
    onIncrement: (String) -> Unit,
    onDecrement: (String) -> Unit
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = OasisSurface,
        border = BorderStroke(1.dp, OasisBorder)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "${product.unit} · ${if (product.isAvailable) "متوفر" else "غير متوفر"}",
                    fontSize = 11.sp,
                    color = if (product.isAvailable) OasisGreen else Color(0xFF9A3412)
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(product.name, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = OasisInk)
                Text(product.shortDescription, fontSize = 12.sp, color = OasisMuted, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Spacer(modifier = Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${product.priceEgp.toInt()} ج.م", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = OasisInk)
                    product.oldPriceEgp?.let {
                        Text(
                            text = "${it.toInt()} ج.م",
                            fontSize = 12.sp,
                            color = OasisMuted,
                            textDecoration = TextDecoration.LineThrough
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            if (!product.isAvailable) {
                Text("غير متوفر", fontSize = 12.sp, color = OasisMuted)
            } else if (qty == 0) {
                Button(
                    onClick = { onIncrement(product.id) },
                    colors = ButtonDefaults.buttonColors(containerColor = OasisGreen),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.height(44.dp)
                ) {
                    Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("أضف")
                }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { onIncrement(product.id) }) {
                        Icon(Icons.Filled.Add, contentDescription = "زيادة", tint = OasisGreen)
                    }
                    Text(qty.toString(), fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    IconButton(onClick = { onDecrement(product.id) }) {
                        Icon(Icons.Filled.Remove, contentDescription = "تقليل", tint = OasisInk)
                    }
                }
            }
        }
    }
}
