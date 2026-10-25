package br.com.ferforastieri.toph

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class TophMessagingService : FirebaseMessagingService() {
  override fun onNewToken(token: String) {
    TophPush.token = token
    TophPush.deliverToken(token)
  }

  override fun onMessageReceived(message: RemoteMessage) {
    val data = message.data
    if (TophPush.foreground) {
      TophPush.deliver(data)
      return
    }
    showNotification(data)
  }

  private fun showNotification(data: Map<String, String>) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      return
    }

    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Toph",
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = "Respostas da IA e avisos do Toph"
      }
      manager.createNotificationChannel(channel)
    }

    val intent = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val pending = PendingIntent.getActivity(
      this,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_toph)
      .setContentTitle(data["title"] ?: "Resposta da IA")
      .setContentText(data["body"] ?: "A IA terminou de responder.")
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setContentIntent(pending)
      .build()
    manager.notify((System.currentTimeMillis() % 100000).toInt(), notification)
  }

  companion object {
    private const val CHANNEL_ID = "toph_ai"
  }
}
