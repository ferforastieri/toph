package com.ferforastieri.toph.ui

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color as AndroidColor
import android.net.Uri
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.composables.icons.lucide.ExternalLink
import com.composables.icons.lucide.Globe
import com.composables.icons.lucide.Lucide
import com.composables.icons.lucide.RefreshCw
import com.ferforastieri.toph.data.WorkTab

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebPanel(tab: WorkTab) {
    val context = LocalContext.current
    val url = tab.url.orEmpty()
    var webView by remember { mutableStateOf<WebView?>(null) }
    var reload by remember { mutableStateOf(0) }

    LaunchedEffect(reload) {
        if (reload > 0) webView?.reload()
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(TophBg)
                .padding(horizontal = 8.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Lucide.Globe, null, tint = TophInfo, modifier = Modifier.size(15.dp))
            Spacer(Modifier.width(6.dp))
            Text(
                url,
                color = TophMuted,
                fontSize = 10.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            IconButton(
                onClick = { reload++ },
                modifier = Modifier.size(32.dp),
            ) {
                Icon(Lucide.RefreshCw, "Reload", tint = TophMuted, modifier = Modifier.size(15.dp))
            }
            IconButton(
                onClick = {
                    if (url.isNotBlank()) {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    }
                },
                modifier = Modifier.size(32.dp),
            ) {
                Icon(Lucide.ExternalLink, "Open externally", tint = TophMuted, modifier = Modifier.size(15.dp))
            }
        }
        AndroidView(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            factory = { ctx ->
                WebView(ctx).apply {
                    setBackgroundColor(AndroidColor.WHITE)
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.loadsImagesAutomatically = true
                    settings.setSupportZoom(true)
                    settings.builtInZoomControls = true
                    settings.displayZoomControls = false
                    webViewClient = WebViewClient()
                    if (url.isNotBlank()) loadUrl(url)
                    webView = this
                }
            },
            onRelease = { view ->
                view.destroy()
                webView = null
            },
        )
    }
}
