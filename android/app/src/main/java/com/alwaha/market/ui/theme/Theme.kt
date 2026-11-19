package com.alwaha.market.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val OasisGreen = Color(0xFF15803D)
val OasisGreenDark = Color(0xFF166534)
val OasisGold = Color(0xFFB68A1E)
val OasisCanvas = Color(0xFFF8FAF8)
val OasisSurface = Color(0xFFFFFFFF)
val OasisSurfaceAlt = Color(0xFFEDF3EE)
val OasisBorder = Color(0xFFDCE6DE)
val OasisInk = Color(0xFF0F2417)
val OasisMuted = Color(0xFF4A6353)

private val AlWahaLightScheme = lightColorScheme(
    primary = OasisGreen,
    onPrimary = Color.White,
    secondary = OasisGold,
    onSecondary = Color.White,
    background = OasisCanvas,
    onBackground = OasisInk,
    surface = OasisSurface,
    onSurface = OasisInk,
    surfaceVariant = OasisSurfaceAlt,
    onSurfaceVariant = OasisMuted,
    outline = OasisBorder
)

@Composable
fun AlWahaTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = AlWahaLightScheme,
        content = content
    )
}
