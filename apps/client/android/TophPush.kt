package br.com.ferforastieri.toph

import android.webkit.WebView
import org.json.JSONObject
import java.lang.ref.WeakReference

object TophPush {
  @Volatile
  var token: String = ""

  @Volatile
  var foreground: Boolean = false

  @Volatile
  private var webView: WeakReference<WebView>? = null

  @Volatile
  private var pending: Map<String, String>? = null

  fun attach(view: WebView) {
    webView = WeakReference(view)
    pending?.let { payload ->
      pending = null
      deliver(payload)
    }
  }

  fun queue(raw: String) {
    try {
      val objectValue = JSONObject(raw)
      val payload = mutableMapOf<String, String>()
      objectValue.keys().forEach { key ->
        payload[key] = objectValue.optString(key, "")
      }
      pending = payload
      webView?.get()?.let {
        pending = null
        deliver(payload)
      }
    } catch (_: Exception) {
      // Ignore malformed notification payloads.
    }
  }

  fun deliver(payload: Map<String, String>) {
    val view = webView?.get() ?: return
    val json = JSONObject(payload as Map<*, *>).toString()
    val script = """
      (function() {
        var tries = 0;
        function send() {
          if (window.__tophPush) { window.__tophPush($json); return; }
          if (tries++ < 40) setTimeout(send, 250);
        }
        send();
      })();
    """.trimIndent()
    view.post {
      view.evaluateJavascript(script, null)
    }
  }

  fun deliverToken(value: String) {
    val view = webView?.get() ?: return
    val json = JSONObject.quote(value)
    view.post {
      view.evaluateJavascript("window.__tophPushToken && window.__tophPushToken($json)", null)
    }
  }
}
