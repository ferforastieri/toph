@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.ferforastieri.toph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.composables.icons.lucide.ChevronLeft
import com.composables.icons.lucide.FileCode
import com.composables.icons.lucide.Folder
import com.composables.icons.lucide.Lucide
import com.ferforastieri.toph.data.UiState

@Composable
fun FileBrowserSheet(
    state: UiState,
    viewModel: TophViewModel,
    onDismiss: () -> Unit,
    onOpenFile: (String) -> Unit,
) {
    LaunchedEffect(Unit) {
        viewModel.loadTree(state.path)
    }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = TophSurface,
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (state.path.isNotEmpty()) {
                    IconButton(
                        onClick = {
                            viewModel.loadTree(state.path.substringBeforeLast('/', ""))
                        },
                    ) {
                        Icon(Lucide.ChevronLeft, "Back", tint = TophMuted)
                    }
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        state.activeProject?.name ?: "Files",
                        color = TophText,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp,
                    )
                    Text(
                        "/${state.path}",
                        color = TophMuted2,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 9.5.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            HorizontalDivider(color = TophBorder)
            if (state.files.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = TophJade, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                }
            } else {
                LazyColumn(modifier = Modifier.fillMaxWidth()) {
                    items(state.files, key = { it.path }) { entry ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    if (entry.dir) {
                                        viewModel.loadTree(entry.path)
                                    } else {
                                        onOpenFile(entry.path)
                                    }
                                }
                                .padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                if (entry.dir) Lucide.Folder else Lucide.FileCode,
                                null,
                                tint = if (entry.dir) TophBrass else TophInfo,
                                modifier = Modifier.size(17.dp),
                            )
                            Spacer(Modifier.width(10.dp))
                            Text(
                                entry.name,
                                color = TophText,
                                fontSize = 12.5.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f),
                            )
                            if (!entry.dir) {
                                Text(
                                    formatSize(entry.size),
                                    color = TophMuted2,
                                    fontSize = 9.5.sp,
                                )
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(18.dp))
        }
    }
}

private fun formatSize(bytes: Long): String {
    return when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> "%.1f KB".format(bytes / 1024.0)
        else -> "%.1f MB".format(bytes / (1024.0 * 1024.0))
    }
}
