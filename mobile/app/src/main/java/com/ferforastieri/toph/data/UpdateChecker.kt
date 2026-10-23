package com.ferforastieri.toph.data

import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request

object UpdateChecker {
    private const val LATEST_RELEASE =
        "https://api.github.com/repos/ferforastieri/toph/releases/latest"

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    suspend fun latest(currentVersion: String): AppUpdate? = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(LATEST_RELEASE)
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "Toph-Android")
            .build()
        runCatching {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use null
                val body = response.body?.string() ?: return@use null
                val root = Json.parseToJsonElement(body).jsonObject
                val tag = root["tag_name"]?.jsonPrimitive?.contentOrNull ?: return@use null
                val version = tag.removePrefix("v")
                if (!isNewer(version, currentVersion)) return@use null
                val apk = root["assets"]?.jsonArray
                    ?.mapNotNull { it.jsonObject }
                    ?.firstOrNull {
                        it["name"]?.jsonPrimitive?.contentOrNull?.endsWith(".apk") == true
                    }
                    ?.get("browser_download_url")
                    ?.jsonPrimitive
                    ?.contentOrNull
                    ?: return@use null
                AppUpdate(versionName = version, apkUrl = apk)
            }
        }.getOrNull()
    }

    fun isNewer(candidate: String, current: String): Boolean {
        val a = candidate.split(".", "-").mapNotNull { it.toIntOrNull() }
        val b = current.split(".", "-").mapNotNull { it.toIntOrNull() }
        for (i in 0 until maxOf(a.size, b.size)) {
            val left = a.getOrElse(i) { 0 }
            val right = b.getOrElse(i) { 0 }
            if (left != right) return left > right
        }
        return false
    }
}
