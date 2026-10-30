package br.com.ferforastieri.toph

import android.Manifest
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.enableEdgeToEdge
import androidx.annotation.Keep
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.google.firebase.messaging.FirebaseMessaging

class MainActivity : TauriActivity() {
  private data class SafeInsets(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int,
    val keyboard: Int,
  )

  @Volatile
  private var safeInsets = SafeInsets(0, 0, 0, 0, 0)

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    window.setBackgroundDrawable(ColorDrawable(Color.parseColor("#000000")))
    window.statusBarColor = Color.TRANSPARENT
    window.navigationBarColor = Color.TRANSPARENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isStatusBarContrastEnforced = false
      window.isNavigationBarContrastEnforced = false
    }
    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = false
      isAppearanceLightNavigationBars = false
    }
    requestNotificationPermission()
    consumePushIntent(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    consumePushIntent(intent)
  }

  private fun consumePushIntent(intent: Intent?) {
    val payload = intent?.getStringExtra("toph_push") ?: return
    intent.removeExtra("toph_push")
    TophPush.queue(payload)
  }

  override fun onResume() {
    super.onResume()
    TophPush.foreground = true
  }

  override fun onPause() {
    TophPush.foreground = false
    super.onPause()
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webView.addJavascriptInterface(SafeAreaBridge(), "TophInsets")
    webView.addJavascriptInterface(NotificationBridge(), "TophNotifications")
    TophPush.attach(webView)
    trackSafeArea(webView)
    try {
      FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
        if (!task.isSuccessful) return@addOnCompleteListener
        val token = task.result ?: return@addOnCompleteListener
        TophPush.token = token
        TophPush.deliverToken(token)
      }
    } catch (error: Exception) {
      // Push remains optional; downloads and safe areas must still work.
    }
    webView.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
      val looksLikeApk =
        url.substringBefore('?').endsWith(".apk", ignoreCase = true) ||
          mimeType?.contains("android.package-archive", ignoreCase = true) == true
      if (!looksLikeApk) return@setDownloadListener

      val name = fileName(contentDisposition, url)
      val request = DownloadManager.Request(Uri.parse(url))
        .setTitle(name)
        .setDescription("Toph update")
        .setMimeType("application/vnd.android.package-archive")
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
      if (!userAgent.isNullOrBlank()) {
        request.addRequestHeader("User-Agent", userAgent)
      }
      try {
        val manager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        manager.enqueue(request)
        Toast.makeText(this, "Baixando Toph...", Toast.LENGTH_SHORT).show()
      } catch (error: Exception) {
        Toast.makeText(this, "Não foi possível baixar o APK.", Toast.LENGTH_LONG).show()
      }
    }
  }

  private fun requestNotificationPermission() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
      return
    }
    ActivityCompat.requestPermissions(
      this,
      arrayOf(Manifest.permission.POST_NOTIFICATIONS),
      NOTIFICATION_PERMISSION_REQUEST,
    )
  }

  private fun trackSafeArea(webView: WebView) {
    ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
      )
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
      safeInsets = SafeInsets(bars.left, bars.top, bars.right, bars.bottom, keyboard)
      webView.evaluateJavascript(
        insetScript(bars.left, bars.top, bars.right, bars.bottom, keyboard),
        null,
      )
      insets
    }
    ViewCompat.requestApplyInsets(webView)
  }

  private fun insetScript(left: Int, top: Int, right: Int, bottom: Int, keyboard: Int): String {
    val script = """
      (function() {
        var root = document.documentElement;
        if (!root) return;
        root.style.setProperty('--native-safe-top', '${dp(top)}px');
        root.style.setProperty('--native-safe-bottom', '${dp(bottom)}px');
        root.style.setProperty('--native-safe-left', '${dp(left)}px');
        root.style.setProperty('--native-safe-right', '${dp(right)}px');
        root.style.setProperty('--native-keyboard-inset', '${dp(keyboard)}px');
        root.style.setProperty('--keyboard-inset', '${dp(keyboard)}px');
        root.classList.toggle('keyboard-open', ${dp(keyboard)} > 80);
      })();
    """.trimIndent()
    return script
  }

  private fun dp(px: Int): Int {
    val density = resources.displayMetrics.density.takeIf { it > 0f } ?: 1f
    return Math.round(px / density)
  }

  @Keep
  private inner class SafeAreaBridge {
    @JavascriptInterface
    fun insets(): String {
      val current = safeInsets
      return """{"top":${dp(current.top)},"bottom":${dp(current.bottom)},"left":${dp(current.left)},"right":${dp(current.right)},"keyboard":${dp(current.keyboard)}}"""
    }
  }

  @Keep
  private inner class NotificationBridge {
    @JavascriptInterface
    fun requestPermission() {
      runOnUiThread { requestNotificationPermission() }
    }

    @JavascriptInterface
    fun token(): String = TophPush.token
  }

  private fun fileName(contentDisposition: String?, url: String): String {
    val fromHeader = contentDisposition
      ?.substringAfter("filename=", "")
      ?.substringBefore(';')
      ?.trim()
      ?.trim('"')
      ?.takeIf { it.isNotBlank() }
    val fromUrl = url.substringBefore('?').substringAfterLast('/').takeIf { it.isNotBlank() }
    val candidate = (fromHeader ?: fromUrl ?: "toph-update.apk")
      .substringAfterLast('/')
      .substringAfterLast('\\')
    return if (candidate.endsWith(".apk", ignoreCase = true)) candidate else "toph-update.apk"
  }

  companion object {
    private const val NOTIFICATION_PERMISSION_REQUEST = 1001
  }
}
