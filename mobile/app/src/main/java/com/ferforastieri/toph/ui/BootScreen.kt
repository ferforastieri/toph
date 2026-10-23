package com.ferforastieri.toph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun BootScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.radialGradient(
                    colors = listOf(Color(0xFF1A2115), TophBg),
                ),
            ),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Surface(
            color = TophElevated,
            shape = RoundedCornerShape(18.dp),
            modifier = Modifier.size(64.dp),
        ) {
            Column(
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = "T",
                    color = TophJade,
                    fontSize = 34.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
            }
        }
        Text(
            text = "Loading Toph...",
            color = TophMuted,
            modifier = Modifier.padding(top = 14.dp, bottom = 8.dp),
            fontSize = 12.sp,
        )
        CircularProgressIndicator(
            color = TophJade,
            strokeWidth = 2.dp,
            modifier = Modifier.size(18.dp),
        )
    }
}
