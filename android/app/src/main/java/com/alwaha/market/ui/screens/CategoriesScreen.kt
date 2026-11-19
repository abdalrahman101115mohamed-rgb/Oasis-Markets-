package com.alwaha.market.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.alwaha.market.data.InitialCatalog
import com.alwaha.market.ui.theme.OasisCanvas
import com.alwaha.market.ui.theme.OasisInk

@Composable
fun CategoriesScreen(
    selectedCategoryId: String?,
    onSelectCategory: (String?) -> Unit,
    quantities: Map<String, Int>,
    onIncrement: (String) -> Unit,
    onDecrement: (String) -> Unit
) {
    val visibleProducts = if (selectedCategoryId == null) {
        InitialCatalog.products
    } else {
        InitialCatalog.products.filter { it.categoryId == selectedCategoryId }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(OasisCanvas)
            .padding(16.dp)
    ) {
        Text("أقسام أسواق الواحة", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = OasisInk)
        Spacer(modifier = Modifier.height(12.dp))

        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                FilterChip(
                    selected = selectedCategoryId == null,
                    onClick = { onSelectCategory(null) },
                    label = { Text("جميع الأقسام") }
                )
            }
            items(InitialCatalog.categories) { cat ->
                FilterChip(
                    selected = selectedCategoryId == cat.id,
                    onClick = { onSelectCategory(cat.id) },
                    label = { Text(cat.name) }
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items(visibleProducts) { product ->
                ProductRowCard(product, quantities[product.id] ?: 0, onIncrement, onDecrement)
            }
        }
    }
}
