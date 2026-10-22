@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.ferforastieri.toph.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.composables.icons.lucide.Database
import com.composables.icons.lucide.Files
import com.composables.icons.lucide.Globe
import com.composables.icons.lucide.Lucide
import com.composables.icons.lucide.Sparkles
import com.composables.icons.lucide.Terminal

@Composable
fun NewTabSheet(
    onDismiss: () -> Unit,
    onFiles: () -> Unit,
    onDatabase: () -> Unit,
    onAi: () -> Unit,
    onWeb: () -> Unit,
    onTerminal: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = TophSurface,
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Text(
                "New tab",
                color = TophText,
                fontWeight = FontWeight.SemiBold,
                fontSize = 15.sp,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
            )
            HorizontalDivider(color = TophBorder)
            NewTabRow("Files", "Browse and edit a file", Lucide.Files, onFiles)
            NewTabRow("Database", "Run SQL and inspect results", Lucide.Database, onDatabase)
            NewTabRow("OpenCode", "Start an AI session", Lucide.Sparkles, onAi)
            NewTabRow("Web app", "Open a homelab interface", Lucide.Globe, onWeb)
            NewTabRow("Terminal", "Open a shell in this project", Lucide.Terminal, onTerminal)
            Spacer(Modifier.height(18.dp))
        }
    }
}

@Composable
private fun NewTabRow(
    title: String,
    subtitle: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = TophJade, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(12.dp))
        Column {
            Text(title, color = TophText, fontSize = 13.sp)
            Text(subtitle, color = TophMuted2, fontSize = 10.5.sp)
        }
    }
}
