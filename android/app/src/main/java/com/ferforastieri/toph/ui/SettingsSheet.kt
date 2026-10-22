@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.ferforastieri.toph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.composables.icons.lucide.GitBranch
import com.composables.icons.lucide.LogOut
import com.composables.icons.lucide.Lucide
import com.composables.icons.lucide.Server
import com.composables.icons.lucide.UserRound
import com.ferforastieri.toph.BuildConfig
import com.ferforastieri.toph.data.UiState

@Composable
fun SettingsSheet(
    state: UiState,
    onDismiss: () -> Unit,
    onLogout: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = TophSurface,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 22.dp),
            verticalArrangement = Arrangement.spacedBy(0.dp),
        ) {
            Text(
                "Settings",
                color = TophText,
                fontWeight = FontWeight.SemiBold,
                fontSize = 15.sp,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
            )
            HorizontalDivider(color = TophBorder)
            SettingRow(Lucide.UserRound, "Account", state.user?.username ?: "unknown")
            SettingRow(Lucide.Server, "Server", state.baseUrl)
            SettingRow(Lucide.Server, "Version", "Toph ${BuildConfig.VERSION_NAME}")
            SettingRow(
                Lucide.GitBranch,
                "Git",
                state.gitStatus.lineSequence().firstOrNull()?.removePrefix("## ")
                    ?.substringBefore("...")
                    ?.ifBlank { "not a repository" }
                    ?: "not a repository",
            )
            Spacer(Modifier.height(14.dp))
            Button(
                onClick = onLogout,
                colors = ButtonDefaults.buttonColors(
                    containerColor = TophElevated,
                    contentColor = TophError,
                ),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .height(44.dp),
            ) {
                Icon(Lucide.LogOut, null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text("Sign out", fontWeight = FontWeight.SemiBold)
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "Toph is self-hosted. Repositories, databases and AI sessions stay on your server.",
                color = TophMuted2,
                fontSize = 10.sp,
                lineHeight = 14.sp,
                modifier = Modifier.padding(horizontal = 16.dp),
            )
        }
    }
}

@Composable
private fun SettingRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = TophMuted, modifier = Modifier.size(17.dp))
        Spacer(Modifier.width(10.dp))
        Column {
            Text(label, color = TophMuted2, fontSize = 9.5.sp)
            Text(value, color = TophText, fontSize = 12.sp)
        }
    }
}
