package com.ferforastieri.toph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.composables.icons.lucide.Bot
import com.composables.icons.lucide.History
import com.composables.icons.lucide.Lucide
import com.composables.icons.lucide.Send
import com.composables.icons.lucide.Sparkles
import com.composables.icons.lucide.Square
import com.ferforastieri.toph.data.AiMessage
import com.ferforastieri.toph.data.OpenCodeSessionInfo
import com.ferforastieri.toph.data.WorkTab

@Composable
fun AiPanel(
    tab: WorkTab,
    sessions: List<OpenCodeSessionInfo>,
    onSend: (String) -> Unit,
    onStop: () -> Unit,
    onPermission: (String, String, String) -> Unit,
    onOpenSession: (OpenCodeSessionInfo) -> Unit,
) {
    var input by remember(tab.id) { mutableStateOf("") }
    var historyOpen by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()

    LaunchedEffect(tab.messages.size, tab.streaming) {
        if (tab.messages.isNotEmpty()) {
            listState.animateScrollToItem(tab.messages.lastIndex)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(TophBg)
            .imePadding(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Lucide.Sparkles, null, tint = TophBrass, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(7.dp))
            Text("OpenCode", color = TophText, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            Spacer(Modifier.weight(1f))
            Text(
                tab.sessionId?.take(8)?.let { "session $it" } ?: "new session",
                color = TophMuted2,
                fontFamily = FontFamily.Monospace,
                fontSize = 9.5.sp,
            )
            androidx.compose.foundation.layout.Box {
                IconButton(onClick = { historyOpen = true }, modifier = Modifier.size(32.dp)) {
                    Icon(Lucide.History, "History", tint = TophMuted, modifier = Modifier.size(16.dp))
                }
                DropdownMenu(
                    expanded = historyOpen,
                    onDismissRequest = { historyOpen = false },
                    containerColor = TophElevated,
                ) {
                    if (sessions.isEmpty()) {
                        DropdownMenuItem(
                            text = { Text("No saved sessions", color = TophMuted, fontSize = 11.sp) },
                            onClick = { historyOpen = false },
                        )
                    }
                    sessions.forEach { session ->
                        DropdownMenuItem(
                            text = {
                                Text(
                                    session.title ?: session.id.take(8),
                                    color = TophText,
                                    fontSize = 11.sp,
                                    maxLines = 1,
                                )
                            },
                            onClick = {
                                historyOpen = false
                                onOpenSession(session)
                            },
                        )
                    }
                }
            }
        }

        if (tab.messages.isEmpty()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(28.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Surface(
                    color = TophElevated,
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.size(54.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Lucide.Bot, null, tint = TophBrass, modifier = Modifier.size(26.dp))
                    }
                }
                Spacer(Modifier.height(12.dp))
                Text("Ask OpenCode about this project.", color = TophText, fontSize = 13.sp)
                Spacer(Modifier.height(4.dp))
                Text(
                    "The agent runs on the server and can read the project files.",
                    color = TophMuted,
                    fontSize = 11.sp,
                    lineHeight = 16.sp,
                )
            }
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(horizontal = 10.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(tab.messages, key = { it.id }) { message ->
                    MessageBubble(
                        message = message,
                        onPermission = { decision ->
                            message.permissionId?.let { requestId ->
                                onPermission(message.id, requestId, decision)
                            }
                        },
                    )
                }
                if (tab.streaming) {
                    item {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(8.dp),
                        ) {
                            CircularProgressIndicator(
                                color = TophJade,
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(14.dp),
                            )
                            Spacer(Modifier.width(8.dp))
                            Text("Working...", color = TophMuted, fontSize = 11.sp)
                        }
                    }
                }
            }
        }

        if (tab.error != null) {
            Text(
                tab.error,
                color = TophError,
                fontSize = 11.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 4.dp),
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(TophSurface)
                .padding(8.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Ask OpenCode...", color = TophMuted2, fontSize = 12.sp) },
                textStyle = TextStyle(fontSize = 12.sp, color = TophText),
                maxLines = 4,
                shape = RoundedCornerShape(8.dp),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Default),
                keyboardActions = KeyboardActions(),
            )
            Spacer(Modifier.width(7.dp))
            if (tab.streaming) {
                IconButton(onClick = onStop, modifier = Modifier.size(44.dp)) {
                    Icon(Lucide.Square, "Stop", tint = TophError, modifier = Modifier.size(19.dp))
                }
            } else {
                Button(
                    onClick = {
                        val text = input.trim()
                        if (text.isNotEmpty()) {
                            input = ""
                            onSend(text)
                        }
                    },
                    enabled = input.isNotBlank(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = TophJade,
                        contentColor = Color(0xFF10140B),
                    ),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.size(44.dp),
                ) {
                    Icon(Lucide.Send, "Send", modifier = Modifier.size(18.dp))
                }
            }
        }
    }
}

@Composable
private fun MessageBubble(message: AiMessage, onPermission: (String) -> Unit) {
    val isUser = message.role == "user"
    val accent = when (message.role) {
        "assistant" -> TophJade
        "tool" -> TophBrass
        "error" -> TophError
        else -> TophInfo
    }
    Surface(
        color = when (message.role) {
            "user" -> TophElevated
            "tool" -> Color(0xFF1B1810)
            "error" -> Color(0xFF24110F)
            else -> TophSurface
        },
        shape = RoundedCornerShape(9.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(10.dp),
            horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
        ) {
            Text(
                when (message.role) {
                    "user" -> "You"
                    "assistant" -> "OpenCode"
                    "tool" -> "Tool"
                    else -> "Error"
                },
                color = accent,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(3.dp))
            Text(
                message.text,
                color = TophText,
                fontFamily = FontFamily.Monospace,
                fontSize = 11.5.sp,
                lineHeight = 16.sp,
                modifier = Modifier.fillMaxWidth(),
            )
            if (message.permissionId != null) {
                Row(
                    modifier = Modifier.padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    PermissionButton("Allow once", TophJade) { onPermission("once") }
                    PermissionButton("Always", TophInfo) { onPermission("always") }
                    PermissionButton("Reject", TophError) { onPermission("reject") }
                }
            }
        }
    }
}

@Composable
private fun PermissionButton(label: String, color: Color, onClick: () -> Unit) {
    androidx.compose.material3.OutlinedButton(
        onClick = onClick,
        shape = RoundedCornerShape(6.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 9.dp, vertical = 3.dp),
    ) {
        Text(label, color = color, fontSize = 10.sp)
    }
}
