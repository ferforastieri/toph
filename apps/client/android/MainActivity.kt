package br.com.ferforastieri.toph

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
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
}
