package com.ferforastieri.toph.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class SessionStore(context: Context) {
    private val appContext = context.applicationContext
    private val fallback: SharedPreferences by lazy {
        appContext.getSharedPreferences("toph_session_fallback", Context.MODE_PRIVATE)
    }
    private var prefs: SharedPreferences = createPrefs(appContext)

    var baseUrl: String?
        get() = read(KEY_BASE_URL)
        private set(value) = write(KEY_BASE_URL, value)

    var token: String?
        get() = read(KEY_TOKEN)
        private set(value) = write(KEY_TOKEN, value)

    var username: String?
        get() = read(KEY_USERNAME)
        private set(value) = write(KEY_USERNAME, value)

    fun saveBaseUrl(baseUrl: String) {
        write(KEY_BASE_URL, baseUrl)
    }

    fun clearToken() {
        remove(KEY_TOKEN, KEY_USERNAME)
    }

    fun save(baseUrl: String, token: String, username: String) {
        write(
            KEY_BASE_URL to baseUrl,
            KEY_TOKEN to token,
            KEY_USERNAME to username,
        )
    }

    fun clear() {
        runCatching { prefs.edit().clear().apply() }
        runCatching { fallback.edit().clear().apply() }
    }

    private fun read(key: String): String? {
        runCatching { prefs.getString(key, null) }.getOrNull()?.let { return it }
        return runCatching { fallback.getString(key, null) }.getOrNull()
    }

    private fun write(vararg values: Pair<String, String?>) {
        runCatching { writeTo(prefs, values) }
            .onFailure {
                prefs = fallback
                runCatching { writeTo(fallback, values) }
            }
    }

    private fun write(key: String, value: String?) {
        write(key to value)
    }

    private fun writeTo(target: SharedPreferences, values: Array<out Pair<String, String?>>) {
        val editor = target.edit()
        values.forEach { (key, value) ->
            if (value == null) editor.remove(key) else editor.putString(key, value)
        }
        editor.apply()
    }

    private fun remove(vararg keys: String) {
        runCatching {
            val editor = prefs.edit()
            keys.forEach(editor::remove)
            editor.apply()
        }.onFailure {
            prefs = fallback
            runCatching {
                val editor = fallback.edit()
                keys.forEach(editor::remove)
                editor.apply()
            }
        }
    }

    private fun createPrefs(context: Context): SharedPreferences {
        return runCatching {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                context,
                "toph_session",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        }.getOrElse {
            context.getSharedPreferences("toph_session_fallback", Context.MODE_PRIVATE)
        }
    }

    private companion object {
        const val KEY_BASE_URL = "base_url"
        const val KEY_TOKEN = "token"
        const val KEY_USERNAME = "username"
    }
}
