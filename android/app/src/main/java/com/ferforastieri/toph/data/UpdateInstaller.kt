package com.ferforastieri.toph.data

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Environment
import android.widget.Toast
import androidx.core.content.ContextCompat

object UpdateInstaller {
    fun install(context: Context, url: String) {
        val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val request = DownloadManager.Request(Uri.parse(url))
            .setTitle("Toph update")
            .setDescription("Downloading the latest Toph APK")
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(
                context,
                Environment.DIRECTORY_DOWNLOADS,
                "toph-update.apk",
            )

        val id = manager.enqueue(request)
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(receiverContext: Context, intent: Intent) {
                val downloadId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
                if (downloadId != id) return
                runCatching { receiverContext.unregisterReceiver(this) }
                val uri = manager.getUriForDownloadedFile(id)
                if (uri == null) {
                    Toast.makeText(receiverContext, "Toph update download failed.", Toast.LENGTH_LONG).show()
                    return
                }
                val installer = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                runCatching { receiverContext.startActivity(installer) }
                    .onFailure {
                        Toast.makeText(
                            receiverContext,
                            "Allow Toph to install unknown apps in Android settings.",
                            Toast.LENGTH_LONG,
                        ).show()
                    }
            }
        }
        ContextCompat.registerReceiver(
            context,
            receiver,
            IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
            ContextCompat.RECEIVER_EXPORTED,
        )
        Toast.makeText(context, "Downloading Toph update...", Toast.LENGTH_SHORT).show()
    }
}
