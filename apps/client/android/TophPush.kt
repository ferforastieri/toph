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

  fun attach(view: WebView) {
    webView = WeakReference(view)
  }

  fun deliver(payload: Map<String, String>) {
    val view = webView?.get() ?: return
    val json = JSONObject(payload as Map<*, *>).toString()
    view.post {
      view.evaluateJavascript("window.__tophPush && window.__tophPush($json)", null)
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
