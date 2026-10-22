package com.ferforastieri.toph.ui

import android.annotation.SuppressLint
import android.graphics.Color as AndroidColor
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.composables.icons.lucide.Lucide
import com.composables.icons.lucide.Terminal
import com.composables.icons.lucide.X
import com.ferforastieri.toph.data.WorkTab
import org.json.JSONObject

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun TerminalPanel(
    tab: WorkTab,
    wsUrl: String?,
    onClose: () -> Unit,
) {
    var ready by remember { mutableStateOf(false) }
    var webView by remember { mutableStateOf<WebView?>(null) }
    var connectedUrl by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(ready, wsUrl) {
        if (!ready || wsUrl.isNullOrBlank() || connectedUrl == wsUrl) return@LaunchedEffect
        connectedUrl = wsUrl
        webView?.evaluateJavascript(
            "window.TophTerminal && window.TophTerminal.connect(${JSONObject.quote(wsUrl)})",
            null,
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(TophBg)
                .padding(horizontal = 8.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Lucide.Terminal, null, tint = TophMuted2, modifier = Modifier.size(15.dp))
            Spacer(Modifier.width(6.dp))
            Text("Terminal", color = TophText, fontSize = 12.sp)
            Spacer(Modifier.weight(1f))
            Text(
                if (tab.loading) "starting..." else if (tab.terminalId != null) "connected" else "offline",
                color = TophMuted2,
                fontFamily = FontFamily.Monospace,
                fontSize = 9.sp,
            )
            IconButton(onClick = onClose, modifier = Modifier.size(32.dp)) {
                Icon(Lucide.X, "Close", tint = TophMuted, modifier = Modifier.size(15.dp))
            }
        }
        if (tab.error != null) {
            Text(
                tab.error,
                color = TophError,
                fontSize = 11.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(TophSurface)
                    .padding(10.dp),
            )
        }
        if (tab.loading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = TophJade, strokeWidth = 2.dp, modifier = Modifier.size(22.dp))
            }
        } else {
            AndroidView(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                factory = { context ->
                    WebView(context).apply {
                        setBackgroundColor(AndroidColor.parseColor("#0F120D"))
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.allowFileAccess = true
                        settings.setSupportZoom(false)
                        settings.builtInZoomControls = false
                        @Suppress("DEPRECATION")
                        settings.allowFileAccessFromFileURLs = true
                        @Suppress("DEPRECATION")
                        settings.allowUniversalAccessFromFileURLs = true
                        isVerticalScrollBarEnabled = false
                        webViewClient = object : WebViewClient() {
                            override fun onPageFinished(view: WebView, url: String) {
                                ready = true
                            }
                        }
                        loadUrl("file:///android_asset/terminal/terminal.html")
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
}
