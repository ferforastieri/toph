package com.ferforastieri.toph.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.ferforastieri.toph.R

@Composable
fun BrandMark(size: Dp) {
    val shape = RoundedCornerShape(size * 0.28f)
    Image(
        painter = painterResource(R.drawable.toph_mark),
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = Modifier
            .size(size)
            .clip(shape)
            .border(1.dp, TophBorder, shape),
    )
}
