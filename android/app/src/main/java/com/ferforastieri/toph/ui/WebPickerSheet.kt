@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.ferforastieri.toph.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.composables.icons.lucide.Globe
import com.composables.icons.lucide.Plus
import com.composables.icons.lucide.Lucide
import com.ferforastieri.toph.data.WebTarget

@Composable
fun WebPickerSheet(
    targets: List<WebTarget>,
    onDismiss: () -> Unit,
    onOpen: (WebTarget) -> Unit,
    onCreate: (String, String) -> Unit,
) {
    var showCreate by remember { mutableStateOf(false) }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = TophSurface,
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Web apps",
                    color = TophText,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 15.sp,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = { showCreate = true }) {
                    Icon(Lucide.Plus, "Add web app", tint = TophMuted)
                }
            }
            HorizontalDivider(color = TophBorder)
            if (targets.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(160.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "No web apps yet. Add one with the + button.",
                        color = TophMuted,
                        fontSize = 12.sp,
                    )
                }
            } else {
                LazyColumn {
                    items(targets, key = { it.id }) { target ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onOpen(target) }
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                Lucide.Globe,
                                null,
                                tint = TophInfo,
                                modifier = Modifier.size(18.dp),
                            )
                            Spacer(Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(target.name, color = TophText, fontSize = 13.sp)
                                Text(
                                    target.url,
                                    color = TophMuted2,
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 9.5.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(18.dp))
        }
    }
    if (showCreate) {
        CreateWebTargetDialog(
            onDismiss = { showCreate = false },
            onCreate = { name, url ->
                showCreate = false
                onCreate(name, url)
            },
        )
    }
}

@Composable
private fun CreateWebTargetDialog(
    onDismiss: () -> Unit,
    onCreate: (String, String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var url by remember { mutableStateOf("https://") }
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = TophSurface,
        title = { Text("New web app", color = TophText) },
        text = {
            Column(verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(10.dp)) {
                androidx.compose.material3.OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name") },
                    singleLine = true,
                )
                androidx.compose.material3.OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    label = { Text("URL") },
                    singleLine = true,
                )
            }
        },
        confirmButton = {
            androidx.compose.material3.TextButton(
                onClick = { onCreate(name.trim(), url.trim()) },
                enabled = name.isNotBlank() && url.startsWith("http"),
            ) {
                Text("Add", color = TophJade, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            androidx.compose.material3.TextButton(onClick = onDismiss) {
                Text("Cancel", color = TophMuted)
            }
        },
    )
}
