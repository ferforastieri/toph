package com.ferforastieri.toph.ui

import android.annotation.SuppressLint
import android.graphics.Color as AndroidColor
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.composables.icons.lucide.FileCode
import com.composables.icons.lucide.Lucide
import com.composables.icons.lucide.Save
import com.ferforastieri.toph.data.WorkTab
import org.json.JSONObject

@Composable
fun EditorPanel(
    tab: WorkTab,
    onContentChange: (String) -> Unit,
    onSave: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(TophBg)
                .padding(horizontal = 8.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Lucide.FileCode, null, tint = TophMuted2, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(6.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    tab.path ?: tab.title,
                    color = TophText,
                    fontSize = 11.5.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (tab.dirty) {
                    Text("modified", color = TophBrass, fontSize = 9.sp)
                }
            }
            if (tab.loading) {
                CircularProgressIndicator(
                    color = TophJade,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(16.dp),
                )
            } else {
                IconButton(onClick = onSave, modifier = Modifier.size(32.dp)) {
                    Icon(Lucide.Save, "Save", tint = TophMuted, modifier = Modifier.size(17.dp))
                }
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
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            )
        }
        if (tab.loading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = TophJade, strokeWidth = 2.dp)
            }
        } else {
            EditorWebView(
                content = tab.content,
                language = tab.language,
                onContentChange = onContentChange,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun EditorWebView(
    content: String,
    language: String,
    onContentChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var ready by remember { mutableStateOf(false) }
    var lastApplied by remember { mutableStateOf<String?>(null) }
    var webView by remember { mutableStateOf<WebView?>(null) }

    LaunchedEffect(ready, content, language) {
        if (!ready) return@LaunchedEffect
        if (lastApplied == content) return@LaunchedEffect
        lastApplied = content
        val script = "window.TophEditor && window.TophEditor.setValue(" +
            "${JSONObject.quote(content)}, ${JSONObject.quote(language)})"
        webView?.evaluateJavascript(script, null)
    }

    AndroidView(
        modifier = modifier.fillMaxWidth(),
        factory = { context ->
            WebView(context).apply {
                setBackgroundColor(AndroidColor.parseColor("#0F120D"))
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.allowFileAccess = true
                settings.allowContentAccess = true
                settings.setSupportZoom(false)
                settings.builtInZoomControls = false
                @Suppress("DEPRECATION")
                settings.allowFileAccessFromFileURLs = true
                @Suppress("DEPRECATION")
                settings.allowUniversalAccessFromFileURLs = true
                isVerticalScrollBarEnabled = false
                addJavascriptInterface(
                    EditorBridge { value ->
                        lastApplied = value
                        onContentChange(value)
                    },
                    "TophAndroid",
                )
                webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView, url: String) {
                        ready = true
                    }
                }
                loadUrl("file:///android_asset/editor/index.html")
                webView = this
            }
        },
        onRelease = { view ->
            view.removeJavascriptInterface("TophAndroid")
            view.destroy()
            webView = null
        },
    )
}

private class EditorBridge(private val onChange: (String) -> Unit) {
    @JavascriptInterface
    fun onChange(value: String) {
        onChange(value)
    }
}
