package com.alwaha.market

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.alwaha.market.model.AppTab
import com.alwaha.market.ui.screens.CategoriesScreen
import com.alwaha.market.ui.screens.HomeScreen
import com.alwaha.market.ui.screens.SplashScreen
import com.alwaha.market.ui.theme.*

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                AlWahaTheme {
                    AlWahaPhase1App()
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AlWahaPhase1App() {
    var showSplash by remember { mutableStateOf(true) }
    var activeTab by remember { mutableStateOf(AppTab.HOME) }
    var selectedCategoryId by remember { mutableStateOf<String?>(null) }
    var searchQuery by remember { mutableStateOf("") }
    var quantities by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }

    val totalCount = quantities.values.sum()

    val increment: (String) -> Unit = { id ->
        quantities = quantities.toMutableMap().apply { put(id, (this[id] ?: 0) + 1) }
    }
    val decrement: (String) -> Unit = { id ->
        quantities = quantities.toMutableMap().apply {
            val cur = this[id] ?: 0
            if (cur <= 1) remove(id) else put(id, cur - 1)
        }
    }

    if (showSplash) {
        SplashScreen(onFinish = { showSplash = false })
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("أسواق الواحة", fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = OasisSurface,
                    titleContentColor = OasisInk
                ),
                actions = {
                    IconButton(onClick = { activeTab = AppTab.CART }) {
                        BadgedBox(
                            badge = {
                                if (totalCount > 0) {
                                    Badge { Text(totalCount.toString()) }
                                }
                            }
                        ) {
                            Icon(Icons.Filled.ShoppingBag, contentDescription = "سلة المشتريات", tint = OasisGreen)
                        }
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar(containerColor = OasisSurface) {
                val tabs = listOf(
                    AppTab.HOME to Icons.Filled.Home,
                    AppTab.CATEGORIES to Icons.Filled.GridView,
                    AppTab.CART to Icons.Filled.ShoppingBag,
                    AppTab.ORDERS to Icons.Filled.ReceiptLong,
                    AppTab.ACCOUNT to Icons.Filled.Person
                )
                tabs.forEach { (tab, icon) ->
                    NavigationBarItem(
                        selected = activeTab == tab,
                        onClick = { activeTab = tab },
                        icon = { Icon(icon, contentDescription = tab.label) },
                        label = { Text(tab.label, maxLines = 1) }
                    )
                }
            }
        }
    ) { innerPadding ->
        Box(modifier = Modifier.padding(innerPadding)) {
            when (activeTab) {
                AppTab.HOME -> HomeScreen(
                    searchQuery = searchQuery,
                    onSearchChange = { searchQuery = it },
                    deliveryArea = "المعادي — القاهرة",
                    quantities = quantities,
                    onIncrement = increment,
                    onDecrement = decrement,
                    onSelectCategory = { catId ->
                        selectedCategoryId = catId
                        activeTab = AppTab.CATEGORIES
                    }
                )
                AppTab.CATEGORIES -> CategoriesScreen(
                    selectedCategoryId = selectedCategoryId,
                    onSelectCategory = { selectedCategoryId = it },
                    quantities = quantities,
                    onIncrement = increment,
                    onDecrement = decrement
                )
                AppTab.CART, AppTab.ORDERS, AppTab.ACCOUNT -> {
                    Box(modifier = Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                        Text(
                            text = when (activeTab) {
                                AppTab.CART -> "السلة — يتم تفعيل الحسابات الكاملة وتأكيد الطلب في المرحلة الثانية"
                                AppTab.ORDERS -> "طلباتي — يتم تفعيلها مع نظام الطلبات في المرحلة الخامسة"
                                else -> "حسابي — يتم تفعيله مع Firebase في المرحلة الرابعة"
                            },
                            color = OasisMuted
                        )
                    }
                }
            }
        }
    }
}
