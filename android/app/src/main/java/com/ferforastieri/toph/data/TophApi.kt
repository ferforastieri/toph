package com.ferforastieri.toph.data

import java.net.URLEncoder
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources

class ApiException(val status: Int, message: String) : Exception(message)

class TophApi(val baseUrl: String, private val token: String?) {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .callTimeout(90, TimeUnit.SECONDS)
        .build()

    private val sseClient = client.newBuilder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .callTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    suspend fun health(): Health = request("GET", "/api/health", authenticated = false)

    suspend fun me(): User = request<MeResponse>("GET", "/api/auth/me").user

    suspend fun projects(): List<Project> = request("GET", "/api/projects")

    suspend fun createProject(name: String, root: String): Project {
        val body = json.encodeToString(CreateProjectRequest(name = name, root = root))
        return request("POST", "/api/projects", body)
    }

    suspend fun tree(projectId: String, path: String = ""): List<FileEntry> {
        val encoded = URLEncoder.encode(path, "UTF-8")
        return request("GET", "/api/projects/$projectId/tree?path=$encoded")
    }

    suspend fun search(projectId: String, query: String): List<SearchMatch> {
        val body = json.encodeToString(SearchRequest(query = query))
        return request("POST", "/api/projects/$projectId/search", body)
    }

    suspend fun gitStatus(projectId: String): String {
        return request<GitStatusResponse>("GET", "/api/projects/$projectId/git/status").status
    }

    suspend fun file(projectId: String, path: String): FileContent {
        val encoded = URLEncoder.encode(path, "UTF-8")
        return request("GET", "/api/projects/$projectId/file?path=$encoded")
    }

    suspend fun saveFile(
        projectId: String,
        path: String,
        content: String,
        baseHash: String,
    ): FileContent {
        val body = json.encodeToString(
            SaveFileRequest(path = path, content = content, baseHash = baseHash),
        )
        return request("PUT", "/api/projects/$projectId/file", body)
    }

    suspend fun dbProfiles(): List<DBProfile> = request("GET", "/api/db/profiles")

    suspend fun createDBProfile(
        name: String,
        driver: String,
        dsn: String,
        readOnly: Boolean,
    ): DBProfile {
        val body = json.encodeToString(
            CreateDBProfileRequest(name = name, driver = driver, dsn = dsn, readOnly = readOnly),
        )
        return request("POST", "/api/db/profiles", body)
    }

    suspend fun queryDB(profileId: String, sql: String): QueryResult {
        val body = json.encodeToString(QueryRequest(sql = sql))
        return request("POST", "/api/db/profiles/$profileId/query", body)
    }

    suspend fun dbSchema(profileId: String): List<SchemaTable> =
        request("GET", "/api/db/profiles/$profileId/schema")

    suspend fun updateRow(profileId: String, change: RowChangeRequest): Long {
        val body = json.encodeToString(change)
        return request<RowMutationResponse>("PUT", "/api/db/profiles/$profileId/row", body)
            .rowsAffected
    }

    suspend fun deleteRow(profileId: String, change: RowChangeRequest): Long {
        val body = json.encodeToString(change)
        return request<RowMutationResponse>("DELETE", "/api/db/profiles/$profileId/row", body)
            .rowsAffected
    }

    suspend fun webTargets(): List<WebTarget> = request("GET", "/api/web-targets")

    suspend fun createWebTarget(name: String, url: String): WebTarget {
        val body = json.encodeToString(CreateWebTargetRequest(name = name, url = url))
        return request("POST", "/api/web-targets", body)
    }

    suspend fun createTerminal(projectId: String): String {
        return request<TerminalResponse>(
            "POST",
            "/api/projects/$projectId/terminals",
            "{}",
        ).id
    }

    fun terminalWebSocketUrl(terminalId: String): String {
        val wsBase = when {
            baseUrl.startsWith("https://") -> "wss://" + baseUrl.removePrefix("https://")
            baseUrl.startsWith("http://") -> "ws://" + baseUrl.removePrefix("http://")
            else -> baseUrl
        }
        val suffix = if (token.isNullOrBlank()) "" else "?token=" + URLEncoder.encode(token, "UTF-8")
        return "$wsBase/api/terminals/$terminalId/ws$suffix"
    }

    suspend fun openCodeSessions(root: String): List<OpenCodeSessionInfo> {
        val encoded = URLEncoder.encode(root, "UTF-8")
        return request<OpenCodeSessionsResponse>(
            "GET",
            "/api/opencode/api/session?directory=$encoded&limit=20&order=desc",
        ).data
    }

    suspend fun openCodeContext(sessionId: String): List<kotlinx.serialization.json.JsonObject> {
        return request("GET", "/api/opencode/api/session/$sessionId/context")
    }

    suspend fun createOpenCodeSession(root: String): String {
        val body = buildJsonObject {
            putJsonObject("location") {
                put("directory", root)
            }
        }.toString()
        return request<OpenCodeSession>("POST", "/api/opencode/api/session", body).id
    }

    suspend fun promptOpenCode(sessionId: String, text: String) {
        val body = buildJsonObject { put("text", text) }.toString()
        request<Unit>("POST", "/api/opencode/api/session/$sessionId/prompt", body)
    }

    suspend fun replyOpenCodePermission(
        sessionId: String,
        requestId: String,
        decision: String,
    ) {
        val body = buildJsonObject { put("decision", decision) }.toString()
        request<Unit>(
            "POST",
            "/api/opencode/api/session/$sessionId/permission/$requestId/reply",
            body,
        )
    }

    suspend fun interruptOpenCode(sessionId: String) {
        request<Unit>(
            "POST",
            "/api/opencode/api/session/$sessionId/interrupt",
            "{}",
        )
    }

    fun subscribeOpenCode(listener: EventSourceListener): EventSource {
        val builder = Request.Builder()
            .url("$baseUrl/api/opencode/api/event")
            .header("Accept", "text/event-stream")
        if (!token.isNullOrBlank()) {
            builder.header("Authorization", "Bearer $token")
        }
        return EventSources.createFactory(sseClient).newEventSource(builder.build(), listener)
    }

    fun close() {
        client.dispatcher.executorService.shutdown()
        client.connectionPool.evictAll()
    }

    private suspend inline fun <reified T> request(
        method: String,
        path: String,
        body: String? = null,
        authenticated: Boolean = true,
    ): T = withContext(Dispatchers.IO) {
        val builder = Request.Builder()
            .url("$baseUrl$path")
            .method(method, body?.toRequestBody(jsonMedia))
        if (authenticated && !token.isNullOrBlank()) {
            builder.header("Authorization", "Bearer $token")
        }
        client.newCall(builder.build()).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw ApiException(response.code, errorMessage(text, response.message))
            }
            if (text.isBlank()) {
                @Suppress("UNCHECKED_CAST")
                Unit as T
            } else {
                json.decodeFromString<T>(text)
            }
        }
    }

    private fun errorMessage(body: String, fallback: String): String {
        return runCatching {
            json.parseToJsonElement(body)
                .let { it as? kotlinx.serialization.json.JsonObject }
                ?.get("error")
                ?.let { it as? kotlinx.serialization.json.JsonPrimitive }
                ?.content
        }.getOrNull() ?: fallback
    }

    companion object {
        suspend fun login(baseUrl: String, username: String, password: String): LoginResponse {
            val api = TophApi(normalizeBaseUrl(baseUrl), null)
            return try {
                val body = Json.encodeToString(
                    LoginRequest(username = username, password = password, kind = "mobile"),
                )
                api.request("POST", "/api/auth/login", body, authenticated = false)
            } finally {
                api.close()
            }
        }

        fun normalizeBaseUrl(raw: String): String {
            var value = raw.trim().trimEnd('/')
            if (value.isBlank()) return value
            if (!value.startsWith("http://") && !value.startsWith("https://")) {
                value = "http://$value"
            }
            return value
        }
    }
}
