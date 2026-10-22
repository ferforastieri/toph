@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.ferforastieri.toph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.composables.icons.lucide.ChevronDown
import com.composables.icons.lucide.Database
import com.composables.icons.lucide.FileCode
import com.composables.icons.lucide.Files
import com.composables.icons.lucide.Globe
import com.composables.icons.lucide.Lucide
import com.composables.icons.lucide.Plus
import com.composables.icons.lucide.Settings
import com.composables.icons.lucide.Sparkles
import com.composables.icons.lucide.Terminal
import com.composables.icons.lucide.X
import com.ferforastieri.toph.data.TabKind
import com.ferforastieri.toph.data.UiState
import com.ferforastieri.toph.data.UpdateInstaller
import com.ferforastieri.toph.data.WorkTab

@Composable
fun WorkbenchScreen(viewModel: TophViewModel, state: UiState) {
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    var showFiles by remember { mutableStateOf(false) }
    var showWebPicker by remember { mutableStateOf(false) }
    var showNewTab by remember { mutableStateOf(false) }
    var showSettings by remember { mutableStateOf(false) }
    var showNewProject by remember { mutableStateOf(false) }

    LaunchedEffect(state.error) {
        state.error?.let {
            snackbar.showSnackbar(it)
            viewModel.clearError()
        }
    }
    LaunchedEffect(state.notice) {
        state.notice?.let {
            snackbar.showSnackbar(it)
            viewModel.clearNotice()
        }
    }
    LaunchedEffect(state.availableUpdate) {
        val update = state.availableUpdate ?: return@LaunchedEffect
        val result = snackbar.showSnackbar(
            message = "Toph ${update.versionName} is available.",
            actionLabel = "Update",
            withDismissAction = true,
            duration = SnackbarDuration.Indefinite,
        )
        if (result == SnackbarResult.ActionPerformed) {
            UpdateInstaller.install(context, update.apkUrl)
        }
    }

    Scaffold(
        containerColor = TophBg,
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            Column {
                WorkbenchTopBar(
                    state = state,
                    onSelectProject = viewModel::selectProject,
                    onNewProject = { showNewProject = true },
                    onSettings = { showSettings = true },
                )
                TabStrip(
                    tabs = state.projectTabs,
                    activeId = state.activeTab?.id,
                    onSelect = viewModel::selectTab,
                    onClose = viewModel::closeTab,
                    onNew = { showNewTab = true },
                )
            }
        },
        bottomBar = {
            NavigationBar(containerColor = TophSurface, tonalElevation = 0.dp) {
                BottomItem("Files", Lucide.Files, false) { showFiles = true }
                BottomItem("Database", Lucide.Database, state.activeTab?.kind == TabKind.DATABASE) {
                    viewModel.openDatabaseTab()
                }
                BottomItem("OpenCode", Lucide.Sparkles, state.activeTab?.kind == TabKind.AI) {
                    viewModel.openAiTab()
                }
                BottomItem("Web", Lucide.Globe, state.activeTab?.kind == TabKind.WEB) {
                    showWebPicker = true
                }
                BottomItem("Terminal", Lucide.Terminal, state.activeTab?.kind == TabKind.TERMINAL) {
                    viewModel.openTerminalTab()
                }
            }
        },
    ) { padding ->
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            val project = state.activeProject
            val tab = state.activeTab
            val bodyContent: @Composable () -> Unit = {
                when {
                    project == null -> NoProjects(viewModel) { showNewProject = true }
                    tab == null -> WorkbenchWelcome(
                        state = state,
                        onFiles = { showFiles = true },
                        onDatabase = viewModel::openDatabaseTab,
                        onAi = viewModel::openAiTab,
                        onWeb = { showWebPicker = true },
                    )

                    else -> when (tab.kind) {
                        TabKind.EDITOR -> key(tab.id) {
                            EditorPanel(
                                tab = tab,
                                onContentChange = { viewModel.updateEditorContent(tab.id, it) },
                                onSave = { viewModel.saveTab(tab.id) },
                            )
                        }

                        TabKind.DATABASE -> DatabasePanel(
                            state = state,
                            tab = tab,
                            onProfile = { viewModel.setDbProfile(tab.id, it) },
                            onSql = { viewModel.setSql(tab.id, it) },
                            onRun = { viewModel.runQuery(tab.id) },
                            onCreateProfile = viewModel::createDbProfile,
                            schemas = state.dbSchemas,
                            onLoadSchema = viewModel::loadSchema,
                            onOpenTable = viewModel::openTableTab,
                            onUpdateRow = { change ->
                                tab.profileId?.let { viewModel.updateRow(tab.id, it, change) }
                            },
                            onDeleteRow = { change ->
                                tab.profileId?.let { viewModel.deleteRow(tab.id, it, change) }
                            },
                        )

                        TabKind.AI -> AiPanel(
                            tab = tab,
                            onSend = { viewModel.sendAi(tab.id, it) },
                            onStop = { viewModel.stopAi(tab.id) },
                            onPermission = { messageId, requestId, decision ->
                                viewModel.replyPermission(tab.id, messageId, requestId, decision)
                            },
                        )

                        TabKind.WEB -> key(tab.id) { WebPanel(tab = tab) }

                        TabKind.TERMINAL -> key(tab.id) {
                            TerminalPanel(
                                tab = tab,
                                wsUrl = viewModel.terminalWebSocketUrl(tab.terminalId),
                                onClose = { viewModel.closeTab(tab.id) },
                            )
                        }
                    }
                }
            }
            if (maxWidth >= 840.dp && project != null) {
                Row(modifier = Modifier.fillMaxSize()) {
                    Surface(
                        color = TophSurface,
                        modifier = Modifier
                            .width(280.dp)
                            .fillMaxHeight(),
                    ) {
                        ProjectFilesPane(state = state, viewModel = viewModel, onOpenFile = viewModel::openFile)
                    }
                    Box(modifier = Modifier.weight(1f)) {
                        bodyContent()
                    }
                }
            } else {
                bodyContent()
            }
        }
    }

    if (showFiles) {
        FileBrowserSheet(
            state = state,
            viewModel = viewModel,
            onDismiss = { showFiles = false },
            onOpenFile = {
                showFiles = false
                viewModel.openFile(it)
            },
        )
    }
    if (showWebPicker) {
        WebPickerSheet(
            targets = state.webTargets,
            onDismiss = { showWebPicker = false },
            onOpen = {
                showWebPicker = false
                viewModel.openWebTab(it)
            },
            onCreate = viewModel::createWebTarget,
        )
    }
    if (showNewTab) {
        NewTabSheet(
            onDismiss = { showNewTab = false },
            onFiles = {
                showNewTab = false
                showFiles = true
            },
            onDatabase = {
                showNewTab = false
                viewModel.openDatabaseTab()
            },
            onAi = {
                showNewTab = false
                viewModel.openAiTab()
            },
            onWeb = {
                showNewTab = false
                showWebPicker = true
            },
            onTerminal = {
                showNewTab = false
                viewModel.openTerminalTab()
            },
        )
    }
    if (showSettings) {
        SettingsSheet(
            state = state,
            onDismiss = { showSettings = false },
            onLogout = {
                showSettings = false
                viewModel.logout()
            },
        )
    }
    if (showNewProject) {
        CreateProjectDialog(
            onDismiss = { showNewProject = false },
            onCreate = { name, root ->
                showNewProject = false
                viewModel.createProject(name, root)
            },
        )
    }
}

@Composable
private fun CreateProjectDialog(
    onDismiss: () -> Unit,
    onCreate: (String, String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var root by remember { mutableStateOf("") }
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = TophSurface,
        title = { Text("New project", color = TophText) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = root,
                    onValueChange = { root = it },
                    label = { Text("Server path") },
                    placeholder = { Text("/workspaces/my-project", color = TophMuted2, fontSize = 10.5.sp) },
                    singleLine = true,
                )
                Text(
                    "The path must exist inside TOPH_WORKSPACES.",
                    color = TophMuted2,
                    fontSize = 10.sp,
                )
            }
        },
        confirmButton = {
            androidx.compose.material3.TextButton(
                onClick = { onCreate(name.trim(), root.trim()) },
                enabled = name.isNotBlank() && root.isNotBlank(),
            ) {
                Text("Create", color = TophJade, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            androidx.compose.material3.TextButton(onClick = onDismiss) {
                Text("Cancel", color = TophMuted)
            }
        },
    )
}

@Composable
private fun WorkbenchTopBar(
    state: UiState,
    onSelectProject: (String) -> Unit,
    onNewProject: () -> Unit,
    onSettings: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val project = state.activeProject
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(TophBg)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(
            color = TophElevated,
            shape = RoundedCornerShape(8.dp),
            modifier = Modifier.size(28.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text("T", color = TophJade, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
            }
        }
        Spacer(Modifier.width(9.dp))
        Text(
            "Toph",
            color = TophText,
            fontWeight = FontWeight.Bold,
            fontSize = 14.sp,
        )
        Spacer(Modifier.width(10.dp))
        Box {
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .clickable { expanded = true }
                    .padding(horizontal = 7.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    project?.name ?: "No project",
                    color = TophMuted,
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.width(4.dp))
                Icon(Lucide.ChevronDown, null, tint = TophMuted2, modifier = Modifier.size(12.dp))
            }
            DropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false },
                containerColor = TophElevated,
            ) {
                state.projects.forEach { item ->
                    DropdownMenuItem(
                        text = {
                            Text(
                                item.name,
                                color = if (item.id == project?.id) TophJade else TophText,
                            )
                        },
                        onClick = {
                            expanded = false
                            onSelectProject(item.id)
                        },
                    )
                }
                HorizontalDivider(color = TophBorder)
                DropdownMenuItem(
                    text = { Text("New project...", color = TophJade) },
                    onClick = {
                        expanded = false
                        onNewProject()
                    },
                )
                if (state.projects.isEmpty()) {
                    DropdownMenuItem(
                        text = { Text("No projects", color = TophMuted) },
                        onClick = {},
                    )
                }
            }
        }
        Spacer(Modifier.weight(1f))
        IconButton(onClick = onSettings) {
            Icon(Lucide.Settings, "Settings", tint = TophMuted, modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
private fun TabStrip(
    tabs: List<WorkTab>,
    activeId: String?,
    onSelect: (String) -> Unit,
    onClose: (String) -> Unit,
    onNew: () -> Unit,
) {
    Surface(color = TophSurface, tonalElevation = 0.dp) {
        LazyRow(
            modifier = Modifier
                .fillMaxWidth()
                .height(40.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 6.dp),
        ) {
            items(tabs, key = { it.id }) { tab ->
                TabPill(
                    tab = tab,
                    active = tab.id == activeId,
                    onClick = { onSelect(tab.id) },
                    onClose = { onClose(tab.id) },
                )
            }
            item {
                IconButton(onClick = onNew, modifier = Modifier.size(38.dp)) {
                    Icon(Lucide.Plus, "New tab", tint = TophMuted, modifier = Modifier.size(17.dp))
                }
            }
        }
    }
}

@Composable
private fun TabPill(
    tab: WorkTab,
    active: Boolean,
    onClick: () -> Unit,
    onClose: () -> Unit,
) {
    val icon = when (tab.kind) {
        TabKind.EDITOR -> Lucide.FileCode
        TabKind.DATABASE -> Lucide.Database
        TabKind.AI -> Lucide.Sparkles
        TabKind.WEB -> Lucide.Globe
        TabKind.TERMINAL -> Lucide.Terminal
    }
    Row(
        modifier = Modifier
            .height(32.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(if (active) TophBg else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(start = 8.dp, end = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            icon,
            null,
            tint = if (active) TophJade else TophMuted2,
            modifier = Modifier.size(14.dp),
        )
        Spacer(Modifier.width(5.dp))
        Text(
            tab.title,
            color = if (active) TophText else TophMuted,
            fontSize = 11.5.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.width(120.dp),
        )
        if (tab.dirty) {
            Box(
                modifier = Modifier
                    .padding(horizontal = 4.dp)
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(TophBrass),
            )
        }
        IconButton(onClick = onClose, modifier = Modifier.size(24.dp)) {
            Icon(Lucide.X, "Close", tint = TophMuted2, modifier = Modifier.size(12.dp))
        }
    }
}

@Composable
private fun RowScope.BottomItem(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    selected: Boolean,
    onClick: () -> Unit,
) {
    NavigationBarItem(
        selected = selected,
        onClick = onClick,
        icon = { Icon(icon, label, modifier = Modifier.size(19.dp)) },
        label = { Text(label, fontSize = 9.5.sp) },
        colors = NavigationBarItemDefaults.colors(
            selectedIconColor = TophJade,
            selectedTextColor = TophJade,
            unselectedIconColor = TophMuted2,
            unselectedTextColor = TophMuted2,
            indicatorColor = TophElevated,
        ),
    )
}

@Composable
private fun WorkbenchWelcome(
    state: UiState,
    onFiles: () -> Unit,
    onDatabase: () -> Unit,
    onAi: () -> Unit,
    onWeb: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Surface(
            color = TophElevated,
            shape = RoundedCornerShape(18.dp),
            modifier = Modifier.size(64.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text("T", color = TophJade, fontWeight = FontWeight.ExtraBold, fontSize = 32.sp)
            }
        }
        Spacer(Modifier.height(14.dp))
        Text(
            state.activeProject?.name ?: "Toph",
            style = MaterialTheme.typography.titleLarge,
            color = TophText,
        )
        Text(
            state.activeProject?.root.orEmpty(),
            color = TophMuted2,
            fontSize = 10.5.sp,
        )
        Spacer(Modifier.height(20.dp))
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            QuickAction("Browse files", Lucide.Files, onFiles)
            QuickAction("Open database", Lucide.Database, onDatabase)
            QuickAction("Open OpenCode", Lucide.Sparkles, onAi)
            QuickAction("Open a web app", Lucide.Globe, onWeb)
        }
    }
}

@Composable
private fun QuickAction(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
) {
    Surface(
        color = TophSurface,
        shape = RoundedCornerShape(8.dp),
        modifier = Modifier
            .width(240.dp)
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, null, tint = TophMuted, modifier = Modifier.size(17.dp))
            Spacer(Modifier.width(10.dp))
            Text(label, color = TophText, fontSize = 12.5.sp)
        }
    }
}

@Composable
private fun NoProjects(viewModel: TophViewModel, onNewProject: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Surface(
            color = TophElevated,
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.size(56.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text("T", color = TophJade, fontWeight = FontWeight.ExtraBold, fontSize = 28.sp)
            }
        }
        Spacer(Modifier.height(16.dp))
        Text("No projects on this server.", color = TophText)
        Spacer(Modifier.height(8.dp))
        Text(
            "Create one in the browser client, then refresh.",
            color = TophMuted,
            fontSize = 12.sp,
        )
        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            androidx.compose.material3.Button(
                onClick = onNewProject,
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = TophJade),
            ) {
                Text("New project", color = Color(0xFF10140B), fontWeight = FontWeight.Bold)
            }
            androidx.compose.material3.OutlinedButton(onClick = viewModel::refreshProjects) {
                Text("Refresh", color = TophMuted)
            }
        }
    }
}
