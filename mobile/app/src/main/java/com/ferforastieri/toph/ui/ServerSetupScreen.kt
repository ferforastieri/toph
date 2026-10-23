package com.ferforastieri.toph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ferforastieri.toph.data.UiState
import com.ferforastieri.toph.data.TophApi

@Composable
fun ServerSetupScreen(viewModel: TophViewModel, state: UiState) {
    var url by rememberSaveable { mutableStateOf("") }
    val canSubmit = url.isNotBlank() && !state.busy

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(TophBg)
            .imePadding()
            .padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            color = TophSurface,
            shape = RoundedCornerShape(20.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Surface(
                    color = TophElevated,
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.size(58.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text("T", color = TophJade, fontSize = 31.sp, fontWeight = FontWeight.ExtraBold)
                    }
                }
                Text("Conecte ao seu Toph", color = TophText, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    "Digite o endereço do servidor para continuar.",
                    color = TophMuted,
                    fontSize = 12.sp,
                )
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    label = { Text("URL do servidor") },
                    placeholder = { Text("https://example.com") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Uri,
                        imeAction = ImeAction.Done,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
                if (state.error != null) {
                    Text(state.error, color = TophError, fontSize = 11.sp)
                }
                Button(
                    onClick = { viewModel.connectServer(url) },
                    enabled = canSubmit,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = TophJade,
                        contentColor = Color(0xFF10140B),
                    ),
                    modifier = Modifier.fillMaxWidth().height(46.dp),
                ) {
                    if (state.busy) {
                        CircularProgressIndicator(
                            color = Color(0xFF10140B),
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(18.dp),
                        )
                    } else {
                        Text("Conectar", fontWeight = FontWeight.Bold)
                    }
                }
                Text(
                    "Você só precisa informar isso uma vez. Use LAN, VPN ou Tailscale.",
                    color = TophMuted2,
                    fontSize = 10.sp,
                )
                Text(
                    "Servidor atual: ${state.baseUrl.ifBlank { TophApi.normalizeBaseUrl(url) }}",
                    color = TophMuted2,
                    fontSize = 9.sp,
                )
            }
        }
    }
}
