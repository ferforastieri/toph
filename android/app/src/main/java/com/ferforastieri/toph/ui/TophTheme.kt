package com.ferforastieri.toph.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val TophBg = Color(0xFF0F120D)
val TophSurface = Color(0xFF171B14)
val TophElevated = Color(0xFF20261C)
val TophBorder = Color(0xFF31392B)
val TophText = Color(0xFFEEF1E8)
val TophMuted = Color(0xFFA3AA99)
val TophMuted2 = Color(0xFF77806F)
val TophJade = Color(0xFFA8C66C)
val TophJadeHover = Color(0xFFB9D77E)
val TophBrass = Color(0xFFD4A24C)
val TophClay = Color(0xFF8C6A43)
val TophSuccess = Color(0xFF5E9E6B)
val TophWarning = Color(0xFFE0A33A)
val TophError = Color(0xFFD96C5F)
val TophInfo = Color(0xFF7FA7A0)

private val colors = darkColorScheme(
    primary = TophJade,
    onPrimary = Color(0xFF10140B),
    primaryContainer = Color(0xFF2B3520),
    onPrimaryContainer = TophJadeHover,
    secondary = TophBrass,
    onSecondary = Color(0xFF1A1307),
    secondaryContainer = Color(0xFF3B2E17),
    onSecondaryContainer = Color(0xFFE3B662),
    tertiary = TophInfo,
    onTertiary = Color(0xFF061412),
    background = TophBg,
    onBackground = TophText,
    surface = TophSurface,
    onSurface = TophText,
    surfaceVariant = TophElevated,
    onSurfaceVariant = TophMuted,
    outline = TophBorder,
    outlineVariant = Color(0xFF252C20),
    error = TophError,
    onError = Color(0xFF1A0907),
    errorContainer = Color(0xFF3A1713),
    onErrorContainer = Color(0xFFF08A7D),
    scrim = Color(0xCC050704),
)

private val typography = Typography(
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontSize = 15.sp,
        lineHeight = 21.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontSize = 13.sp,
        lineHeight = 18.sp,
    ),
    bodySmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontSize = 11.sp,
        lineHeight = 16.sp,
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontSize = 20.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = (-0.3).sp,
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontSize = 15.sp,
        fontWeight = FontWeight.SemiBold,
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontSize = 10.sp,
        fontWeight = FontWeight.Medium,
        letterSpacing = 0.5.sp,
    ),
)

@Composable
fun TophTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = colors,
        typography = typography,
        content = content,
    )
}
