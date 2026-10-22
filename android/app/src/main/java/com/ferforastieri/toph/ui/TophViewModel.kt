package com.ferforastieri.toph.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ferforastieri.toph.BuildConfig
import com.ferforastieri.toph.data.AiMessage
import com.ferforastieri.toph.data.ApiException
import com.ferforastieri.toph.data.DBProfile
import com.ferforastieri.toph.data.FileEntry
import com.ferforastieri.toph.data.Project
import com.ferforastieri.toph.data.SearchMatch
import com.ferforastieri.toph.data.SessionStore
import com.ferforastieri.toph.data.TabKind
import com.ferforastieri.toph.data.TophApi
import com.ferforastieri.toph.data.UiState
import com.ferforastieri.toph.data.UpdateChecker
import com.ferforastieri.toph.data.languageFor
import com.ferforastieri.toph.data.WebTarget
import com.ferforastieri.toph.data.WorkTab
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener

class TophViewModel(application: Application) : AndroidViewModel(application) {
    private val session = SessionStore(application)
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private var api: TophApi? = null
    private var token: String? = null
    private val eventSources = mutableMapOf<String, EventSource>()

    init {
        val baseUrl = session.baseUrl
        val savedToken = session.token
        if (baseUrl.isNullOrBlank() || savedToken.isNullOrBlank()) {
            _state.update { it.copy(booting = false) }
        } else {
            api = TophApi(baseUrl, savedToken)
            token = savedToken
            _state.update { it.copy(baseUrl = baseUrl) }
            checkForUpdates()
            viewModelScope.launch {
                runCatching { requireApi().me() }
                    .onSuccess { user ->
                        _state.update { it.copy(user = user) }
                        loadProjects()
                    }
                    .onFailure { clearSession() }
                _state.update { it.copy(booting = false) }
            }
        }
    }

    fun login(rawBaseUrl: String, username: String, password: String) {
        if (_state.value.busy) return
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            try {
                val baseUrl = TophApi.normalizeBaseUrl(rawBaseUrl)
                val result = TophApi.login(baseUrl, username, password)
                session.save(baseUrl, result.token, result.user.username)
                token = result.token
                api = TophApi(baseUrl, result.token)
                _state.update {
                    it.copy(user = result.user, baseUrl = baseUrl, busy = false, error = null)
                }
                loadProjects()
                checkForUpdates()
            } catch (error: Exception) {
                _state.update {
                    it.copy(
                        busy = false,
                        error = error.message ?: "Could not sign in.",
                    )
                }
            }
        }
    }

    fun logout() {
        clearSession()
    }

    fun refreshProjects() {
        viewModelScope.launch { loadProjects() }
    }

    fun selectProject(projectId: String) {
        if (_state.value.activeProjectId == projectId) return
        _state.update {
            it.copy(
                activeProjectId = projectId,
                files = emptyList(),
                path = "",
                searchQuery = "",
                searchResults = emptyList(),
                gitStatus = "",
                dbProfiles = emptyList(),
                dbSchemas = emptyMap(),
                webTargets = emptyList(),
            )
        }
        viewModelScope.launch {
            loadTree("")
            loadDbProfiles()
            loadWebTargets()
            loadGitStatus()
        }
    }

    fun loadTree(path: String = "") {
        val project = _state.value.activeProject ?: return
        viewModelScope.launch {
            runCatching { requireApi().tree(project.id, path) }
                .onSuccess { entries ->
                    _state.update { it.copy(files = entries, path = path, error = null) }
                }
                .onFailure { showError(it) }
        }
    }

    fun search(query: String) {
        val project = _state.value.activeProject ?: return
        _state.update { it.copy(searchQuery = query) }
        if (query.isBlank()) {
            _state.update { it.copy(searchResults = emptyList(), searchLoading = false) }
            return
        }
        _state.update { it.copy(searchLoading = true) }
        viewModelScope.launch {
            runCatching { requireApi().search(project.id, query) }
                .onSuccess { results ->
                    _state.update { it.copy(searchResults = results, searchLoading = false) }
                }
                .onFailure { error ->
                    _state.update { it.copy(searchLoading = false) }
                    showError(error)
                }
        }
    }

    fun clearSearch() {
        _state.update { it.copy(searchQuery = "", searchResults = emptyList(), searchLoading = false) }
    }

    private suspend fun loadGitStatus() {
        val project = _state.value.activeProject ?: return
        runCatching { requireApi().gitStatus(project.id) }
            .onSuccess { status -> _state.update { it.copy(gitStatus = status) } }
    }

    fun openFile(path: String) {
        val current = _state.value
        val project = current.activeProject ?: return
        val existing = current.projectTabs.firstOrNull {
            it.kind == TabKind.EDITOR && it.path == path
        }
        if (existing != null) {
            selectTab(existing.id)
            return
        }
        val tab = WorkTab(
            id = UUID.randomUUID().toString(),
            kind = TabKind.EDITOR,
            title = path.substringAfterLast('/'),
            path = path,
            language = languageFor(path),
            loading = true,
        )
        addTab(project.id, tab)
        viewModelScope.launch {
            runCatching { requireApi().file(project.id, path) }
                .onSuccess { file ->
                    updateTab(project.id, tab.id) {
                        it.copy(
                            content = file.content,
                            hash = file.hash,
                            dirty = false,
                            loading = false,
                        )
                    }
                }
                .onFailure { error ->
                    updateTab(project.id, tab.id) {
                        it.copy(loading = false, error = error.message ?: "Could not open file.")
                    }
                }
        }
    }

    fun updateEditorContent(tabId: String, content: String) {
        val project = _state.value.activeProject ?: return
        updateTab(project.id, tabId) { it.copy(content = content, dirty = true) }
    }

    fun saveTab(tabId: String) {
        val current = _state.value
        val project = current.activeProject ?: return
        val tab = current.projectTabs.firstOrNull { it.id == tabId } ?: return
        if (tab.kind != TabKind.EDITOR || tab.path == null) return
        viewModelScope.launch {
            runCatching {
                requireApi().saveFile(
                    projectId = project.id,
                    path = tab.path,
                    content = tab.content,
                    baseHash = tab.hash,
                )
            }.onSuccess { file ->
                updateTab(project.id, tab.id) {
                    it.copy(hash = file.hash, dirty = false, error = null)
                }
                _state.update { it.copy(notice = "Saved ${tab.path}") }
            }.onFailure { error ->
                val message = if (error is ApiException && error.status == 409) {
                    "File changed on disk. Reload it before saving."
                } else {
                    error.message ?: "Could not save file."
                }
                updateTab(project.id, tab.id) { it.copy(error = message) }
                _state.update { it.copy(error = message) }
            }
        }
    }

    fun openDatabaseTab() {
        val project = _state.value.activeProject ?: return
        val tab = WorkTab(
            id = UUID.randomUUID().toString(),
            kind = TabKind.DATABASE,
            title = "Database",
        )
        addTab(project.id, tab)
        if (_state.value.dbProfiles.isEmpty()) {
            viewModelScope.launch { loadDbProfiles() }
        }
    }

    fun openTerminalTab() {
        val project = _state.value.activeProject ?: return
        val tab = WorkTab(
            id = UUID.randomUUID().toString(),
            kind = TabKind.TERMINAL,
            title = "Terminal",
            loading = true,
        )
        addTab(project.id, tab)
        viewModelScope.launch {
            runCatching { requireApi().createTerminal(project.id) }
                .onSuccess { terminalId ->
                    updateTab(project.id, tab.id) {
                        it.copy(terminalId = terminalId, loading = false)
                    }
                }
                .onFailure { error ->
                    updateTab(project.id, tab.id) {
                        it.copy(loading = false, error = error.message ?: "Could not open terminal.")
                    }
                }
        }
    }

    fun openAiTab() {
        val project = _state.value.activeProject ?: return
        val tab = WorkTab(
            id = UUID.randomUUID().toString(),
            kind = TabKind.AI,
            title = "OpenCode",
        )
        addTab(project.id, tab)
    }

    fun openWebTab(target: WebTarget) {
        val project = _state.value.activeProject ?: return
        val existing = _state.value.projectTabs.firstOrNull {
            it.kind == TabKind.WEB && it.url == target.url
        }
        if (existing != null) {
            selectTab(existing.id)
            return
        }
        addTab(
            project.id,
            WorkTab(
                id = UUID.randomUUID().toString(),
                kind = TabKind.WEB,
                title = target.name,
                url = target.url,
            ),
        )
    }

    fun closeTab(tabId: String) {
        val current = _state.value
        val project = current.activeProject ?: return
        val tabs = current.projectTabs
        val index = tabs.indexOfFirst { it.id == tabId }
        if (index < 0) return
        val remaining = tabs.filterNot { it.id == tabId }
        val activeId = when {
            current.activeTab?.id != tabId -> current.activeTab?.id
            remaining.isEmpty() -> null
            else -> remaining[minOf(index, remaining.lastIndex)].id
        }
        _state.update {
            it.copy(
                tabs = it.tabs + (project.id to remaining),
                activeTabIds = it.activeTabIds + (project.id to activeId),
            )
        }
    }

    fun selectTab(tabId: String) {
        val project = _state.value.activeProject ?: return
        _state.update {
            it.copy(activeTabIds = it.activeTabIds + (project.id to tabId))
        }
    }

    fun openNewTabSheetAction(action: NewTabAction) {
        when (action) {
            NewTabAction.DATABASE -> openDatabaseTab()
            NewTabAction.AI -> openAiTab()
            NewTabAction.WEB -> Unit
        }
    }

    fun setDbProfile(tabId: String, profileId: String) {
        val project = _state.value.activeProject ?: return
        updateTab(project.id, tabId) { it.copy(profileId = profileId) }
    }

    fun setSql(tabId: String, sql: String) {
        val project = _state.value.activeProject ?: return
        updateTab(project.id, tabId) { it.copy(sql = sql) }
    }

    fun loadSchema(profileId: String) {
        if (_state.value.dbSchemas.containsKey(profileId)) return
        viewModelScope.launch {
            runCatching { requireApi().dbSchema(profileId) }
                .onSuccess { tables ->
                    _state.update { state ->
                        state.copy(dbSchemas = state.dbSchemas + (profileId to tables))
                    }
                }
                .onFailure { showError(it) }
        }
    }

    fun runQuery(tabId: String) {
        val current = _state.value
        val project = current.activeProject ?: return
        val tab = current.projectTabs.firstOrNull { it.id == tabId } ?: return
        val profileId = tab.profileId ?: current.dbProfiles.firstOrNull()?.id
        if (profileId == null) {
            updateTab(project.id, tabId) { it.copy(error = "Choose a database connection first.") }
            return
        }
        if (tab.sql.isBlank()) return
        updateTab(project.id, tabId) {
            it.copy(profileId = profileId, result = null, error = null, loading = true)
        }
        viewModelScope.launch {
            runCatching { requireApi().queryDB(profileId, tab.sql) }
                .onSuccess { result ->
                    updateTab(project.id, tabId) {
                        it.copy(result = result, loading = false, error = null)
                    }
                }
                .onFailure { error ->
                    updateTab(project.id, tabId) {
                        it.copy(loading = false, error = error.message ?: "Query failed.")
                    }
                }
        }
    }

    fun sendAi(tabId: String, text: String) {
        val value = text.trim()
        if (value.isEmpty()) return
        val current = _state.value
        val project = current.activeProject ?: return
        val tab = current.projectTabs.firstOrNull { it.id == tabId } ?: return
        if (tab.streaming) return

        updateTab(project.id, tabId) {
            it.copy(
                messages = it.messages + AiMessage(
                    id = UUID.randomUUID().toString(),
                    role = "user",
                    text = value,
                ),
                streaming = true,
                error = null,
            )
        }

        viewModelScope.launch {
            try {
                val sessionId = tab.sessionId ?: requireApi()
                    .createOpenCodeSession(project.root)
                    .also { created ->
                        updateTab(project.id, tabId) { it.copy(sessionId = created) }
                        startOpenCodeStream(tabId, created)
                    }
                if (tab.sessionId != null) startOpenCodeStream(tabId, sessionId)
                requireApi().promptOpenCode(sessionId, value)
            } catch (error: Exception) {
                updateTab(project.id, tabId) {
                    it.copy(
                        streaming = false,
                        error = error.message ?: "Could not reach OpenCode.",
                    )
                }
            }
        }
    }

    fun replyPermission(tabId: String, messageId: String, requestId: String, decision: String) {
        val current = _state.value
        val project = current.activeProject ?: return
        val tab = current.projectTabs.firstOrNull { it.id == tabId } ?: return
        val sessionId = tab.sessionId ?: return
        viewModelScope.launch {
            runCatching { requireApi().replyOpenCodePermission(sessionId, requestId, decision) }
                .onSuccess {
                    updateTab(project.id, tabId) { currentTab ->
                        currentTab.copy(
                            messages = currentTab.messages.map { message ->
                                if (message.id == messageId) {
                                    message.copy(
                                        permissionId = null,
                                        text = if (decision == "reject") {
                                            "Permission rejected."
                                        } else {
                                            "Permission allowed."
                                        },
                                    )
                                } else {
                                    message
                                }
                            },
                        )
                    }
                }
                .onFailure { showError(it) }
        }
    }

    fun stopAi(tabId: String) {
        val current = _state.value
        val project = current.activeProject ?: return
        val tab = current.projectTabs.firstOrNull { it.id == tabId } ?: return
        val sessionId = tab.sessionId ?: return
        viewModelScope.launch {
            runCatching { requireApi().interruptOpenCode(sessionId) }
            updateTab(project.id, tabId) { it.copy(streaming = false) }
        }
    }

    fun createProject(name: String, root: String) {
        viewModelScope.launch {
            runCatching { requireApi().createProject(name, root) }
                .onSuccess { project ->
                    loadProjects()
                    selectProject(project.id)
                    _state.update { it.copy(notice = "Project created.") }
                }
                .onFailure { showError(it) }
        }
    }

    fun createWebTarget(name: String, url: String) {
        viewModelScope.launch {
            runCatching { requireApi().createWebTarget(name, url) }
                .onSuccess {
                    loadWebTargets()
                    _state.update { state -> state.copy(notice = "Web app added.") }
                }
                .onFailure { showError(it) }
        }
    }

    fun createDbProfile(name: String, driver: String, dsn: String, readOnly: Boolean) {
        viewModelScope.launch {
            runCatching { requireApi().createDBProfile(name, driver, dsn, readOnly) }
                .onSuccess {
                    loadDbProfiles()
                    _state.update { state -> state.copy(notice = "Database connection added.") }
                }
                .onFailure { showError(it) }
        }
    }

    fun terminalWebSocketUrl(terminalId: String?): String? {
        if (terminalId.isNullOrBlank()) return null
        return api?.terminalWebSocketUrl(terminalId)
    }

    fun clearError() {
        _state.update { it.copy(error = null) }
    }

    fun clearNotice() {
        _state.update { it.copy(notice = null) }
    }

    private fun checkForUpdates() {
        viewModelScope.launch {
            UpdateChecker.latest(BuildConfig.VERSION_NAME)?.let { update ->
                _state.update { it.copy(availableUpdate = update) }
            }
        }
    }

    private suspend fun loadProjects() {
        runCatching { requireApi().projects() }
            .onSuccess { projects ->
                val active = _state.value.activeProjectId
                    ?.takeIf { id -> projects.any { it.id == id } }
                    ?: projects.firstOrNull()?.id
                _state.update {
                    it.copy(
                        projects = projects,
                        activeProjectId = active,
                        error = null,
                    )
                }
                if (active != null) {
                    loadTree("")
                    loadDbProfiles()
                    loadWebTargets()
                    loadGitStatus()
                }
            }
            .onFailure { showError(it) }
    }

    private suspend fun loadDbProfiles() {
        runCatching { requireApi().dbProfiles() }
            .onSuccess { profiles -> _state.update { it.copy(dbProfiles = profiles) } }
            .onFailure { showError(it) }
    }

    private suspend fun loadWebTargets() {
        runCatching { requireApi().webTargets() }
            .onSuccess { targets -> _state.update { it.copy(webTargets = targets) } }
            .onFailure { showError(it) }
    }

    private fun addTab(projectId: String, tab: WorkTab) {
        _state.update {
            it.copy(
                tabs = it.tabs + (projectId to (it.tabs[projectId].orEmpty() + tab)),
                activeTabIds = it.activeTabIds + (projectId to tab.id),
            )
        }
    }

    private fun updateTab(projectId: String, tabId: String, transform: (WorkTab) -> WorkTab) {
        _state.update { state ->
            val tabs = state.tabs[projectId] ?: return@update state
            state.copy(
                tabs = state.tabs + (
                    projectId to tabs.map { tab ->
                        if (tab.id == tabId) transform(tab) else tab
                    }
                    ),
            )
        }
    }

    private fun updateTabBySession(sessionId: String, transform: (WorkTab) -> WorkTab) {
        _state.update { state ->
            val updated = state.tabs.mapValues { (_, tabs) ->
                tabs.map { tab ->
                    if (tab.sessionId == sessionId) transform(tab) else tab
                }
            }
            state.copy(tabs = updated)
        }
    }

    private fun startOpenCodeStream(tabId: String, sessionId: String) {
        if (eventSources.containsKey(sessionId)) return
        val api = api ?: return
        val source = api.subscribeOpenCode(object : EventSourceListener() {
            override fun onEvent(
                eventSource: EventSource,
                id: String?,
                type: String?,
                data: String,
            ) {
                if (data.isBlank()) return
                val root = runCatching { json.parseToJsonElement(data).jsonObject }.getOrNull()
                    ?: return
                val eventType = root.string("type") ?: return
                val payload = root["data"] as? JsonObject ?: return
                val eventSession = payload.string("sessionID") ?: return
                if (eventSession != sessionId) return
                when (eventType) {
                    "session.text.started" -> {
                        val messageId = "assistant-${payload.string("assistantMessageID")}"
                        updateTabBySession(sessionId) { tab ->
                            if (tab.id != tabId) tab else {
                                val exists = tab.messages.any { it.id == messageId }
                                if (exists) tab else tab.copy(
                                    messages = tab.messages + AiMessage(messageId, "assistant", ""),
                                )
                            }
                        }
                    }

                    "session.text.delta" -> {
                        val messageId = "assistant-${payload.string("assistantMessageID")}"
                        val delta = payload.string("delta").orEmpty()
                        updateTabBySession(sessionId) { tab ->
                            if (tab.id != tabId) tab else {
                                val messages = tab.messages.toMutableList()
                                val index = messages.indexOfFirst { it.id == messageId }
                                if (index >= 0) {
                                    messages[index] = messages[index].copy(
                                        text = messages[index].text + delta,
                                    )
                                } else {
                                    messages += AiMessage(messageId, "assistant", delta)
                                }
                                tab.copy(messages = messages)
                            }
                        }
                    }

                    "session.tool.called" -> {
                        val input = payload["input"]?.toString().orEmpty()
                        updateTabBySession(sessionId) { tab ->
                            if (tab.id != tabId) tab else tab.copy(
                                messages = tab.messages + AiMessage(
                                    UUID.randomUUID().toString(),
                                    "tool",
                                    input,
                                ),
                            )
                        }
                    }

                    "permission.asked" -> {
                        val action = payload.string("action").orEmpty()
                        val resources = payload["resources"]?.toString().orEmpty()
                        val requestId = payload.string("id").orEmpty()
                        updateTabBySession(sessionId) { tab ->
                            if (tab.id != tabId) tab else tab.copy(
                                messages = tab.messages + AiMessage(
                                    id = UUID.randomUUID().toString(),
                                    role = "tool",
                                    text = "Permission requested: $action $resources",
                                    permissionId = requestId,
                                    permissionAction = action,
                                ),
                            )
                        }
                    }

                    "session.idle" -> {
                        updateTabBySession(sessionId) { it.copy(streaming = false) }
                    }

                    "session.execution.failed" -> {
                        updateTabBySession(sessionId) {
                            it.copy(
                                streaming = false,
                                error = "OpenCode could not complete this turn.",
                            )
                        }
                    }
                }
            }

            override fun onFailure(
                eventSource: EventSource,
                t: Throwable?,
                response: okhttp3.Response?,
            ) {
                eventSources.remove(sessionId)
                updateTabBySession(sessionId) {
                    it.copy(
                        streaming = false,
                        error = t?.message ?: "OpenCode event stream closed.",
                    )
                }
            }
        })
        eventSources[sessionId] = source
    }

    private fun clearSession() {
        eventSources.values.forEach { it.cancel() }
        eventSources.clear()
        api?.close()
        api = null
        token = null
        session.clear()
        _state.value = UiState(booting = false)
    }

    private fun requireApi(): TophApi =
        api ?: throw IllegalStateException("Not authenticated.")

    private fun showError(error: Throwable) {
        _state.update { it.copy(error = error.message ?: "Something went wrong.") }
    }

    override fun onCleared() {
        eventSources.values.forEach { it.cancel() }
        eventSources.clear()
        api?.close()
        super.onCleared()
    }

    private fun JsonObject.string(key: String): String? =
        this[key]?.jsonPrimitive?.contentOrNull

}

enum class NewTabAction {
    DATABASE,
    AI,
    WEB,
}
