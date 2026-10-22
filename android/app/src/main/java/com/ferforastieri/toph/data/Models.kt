package com.ferforastieri.toph.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class User(
    val id: Long,
    val username: String,
    val createdAt: String = "",
)

@Serializable
data class LoginRequest(
    val username: String,
    val password: String,
    val kind: String,
)

@Serializable
data class LoginResponse(
    val token: String,
    val csrfToken: String = "",
    val expiresAt: String = "",
    val user: User,
)

@Serializable
data class MeResponse(val user: User)

@Serializable
data class Project(
    val id: String,
    val name: String,
    val root: String,
    val color: String = "#A8C66C",
    val createdAt: String = "",
    val updatedAt: String = "",
)

@Serializable
data class CreateProjectRequest(
    val name: String,
    val root: String,
    val color: String = "#A8C66C",
)

@Serializable
data class SearchMatch(
    val path: String,
    val line: Int = 0,
    val column: Int = 0,
    val preview: String = "",
)

@Serializable
data class SearchRequest(
    val query: String,
    val limit: Int = 100,
)

@Serializable
data class GitStatusResponse(val status: String = "")

@Serializable
data class FileEntry(
    val name: String,
    val path: String,
    val dir: Boolean,
    val size: Long = 0,
    val modTime: String = "",
)

@Serializable
data class FileContent(
    val path: String,
    val content: String,
    val hash: String,
    val modTime: String = "",
    val size: Long = 0,
)

@Serializable
data class SaveFileRequest(
    val path: String,
    val content: String,
    val baseHash: String,
)

@Serializable
data class DBProfile(
    val id: String,
    val name: String,
    val driver: String,
    val readOnly: Boolean = true,
    val createdAt: String = "",
    val updatedAt: String = "",
)

@Serializable
data class CreateDBProfileRequest(
    val name: String,
    val driver: String,
    val dsn: String,
    val readOnly: Boolean = true,
)

@Serializable
data class RowChangeRequest(
    val schema: String,
    val table: String,
    val key: Map<String, JsonElement>? = null,
    val values: Map<String, JsonElement>? = null,
)

@Serializable
data class RowMutationResponse(val rowsAffected: Long = 0)

@Serializable
data class QueryColumn(
    val name: String,
    val type: String = "",
)

@Serializable
data class QueryResult(
    val columns: List<QueryColumn> = emptyList(),
    val rows: List<List<JsonElement>> = emptyList(),
    val rowCount: Int = 0,
    val truncated: Boolean = false,
    val durationMs: Long = 0,
)

@Serializable
data class QueryRequest(
    val sql: String,
    val maxRows: Int = 500,
)

@Serializable
data class SchemaColumn(
    val name: String,
    val type: String = "",
    val nullable: Boolean = true,
    val primary: Boolean = false,
)

@Serializable
data class SchemaTable(
    val schema: String,
    val name: String,
    val columns: List<SchemaColumn> = emptyList(),
)

@Serializable
data class WebTarget(
    val id: String,
    val name: String,
    val url: String,
    val icon: String = "",
    val createdAt: String = "",
)

@Serializable
data class CreateWebTargetRequest(
    val name: String,
    val url: String,
)

@Serializable
data class Health(
    val ok: Boolean,
    val name: String,
    val version: String,
)

@Serializable
data class OpenCodeSession(val id: String)

@Serializable
data class TerminalResponse(val id: String, val projectId: String = "")

@Serializable
data class AiMessage(
    val id: String,
    val role: String,
    val text: String,
    val permissionId: String? = null,
    val permissionAction: String? = null,
)

enum class TabKind {
    EDITOR,
    DATABASE,
    AI,
    WEB,
    TERMINAL,
}

data class WorkTab(
    val id: String,
    val kind: TabKind,
    val title: String,
    val path: String? = null,
    val url: String? = null,
    val content: String = "",
    val hash: String = "",
    val dirty: Boolean = false,
    val language: String = "plaintext",
    val loading: Boolean = false,
    val profileId: String? = null,
    val sql: String = "",
    val result: QueryResult? = null,
    val error: String? = null,
    val sessionId: String? = null,
    val terminalId: String? = null,
    val table: SchemaTable? = null,
    val messages: List<AiMessage> = emptyList(),
    val streaming: Boolean = false,
)

data class AppUpdate(
    val versionName: String,
    val apkUrl: String,
)

data class UiState(
    val booting: Boolean = true,
    val user: User? = null,
    val baseUrl: String = "",
    val projects: List<Project> = emptyList(),
    val activeProjectId: String? = null,
    val tabs: Map<String, List<WorkTab>> = emptyMap(),
    val activeTabIds: Map<String, String?> = emptyMap(),
    val files: List<FileEntry> = emptyList(),
    val path: String = "",
    val dbProfiles: List<DBProfile> = emptyList(),
    val dbSchemas: Map<String, List<SchemaTable>> = emptyMap(),
    val searchQuery: String = "",
    val searchResults: List<SearchMatch> = emptyList(),
    val searchLoading: Boolean = false,
    val gitStatus: String = "",
    val webTargets: List<WebTarget> = emptyList(),
    val busy: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val availableUpdate: AppUpdate? = null,
) {
    val activeProject: Project?
        get() = projects.firstOrNull { it.id == activeProjectId }

    val projectTabs: List<WorkTab>
        get() = tabs[activeProjectId].orEmpty()

    val activeTab: WorkTab?
        get() = projectTabs.firstOrNull { it.id == activeTabIds[activeProjectId] }
}
