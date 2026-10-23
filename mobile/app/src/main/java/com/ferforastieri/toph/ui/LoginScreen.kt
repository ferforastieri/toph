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
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ferforastieri.toph.data.UiState

@Composable
fun LoginScreen(viewModel: TophViewModel, state: UiState) {
    var username by rememberSaveable { mutableStateOf("admin") }
    var password by rememberSaveable { mutableStateOf("") }
    val canSubmit = username.isNotBlank() && password.isNotBlank()

    LaunchedEffect(state.error) {
        // The inline error is enough; clear it when the user edits the form.
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.radialGradient(
                    colors = listOf(Color(0xFF1D2617), TophBg),
                ),
            )
            .imePadding()
            .padding(22.dp),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            color = TophSurface.copy(alpha = 0.97f),
            shape = RoundedCornerShape(20.dp),
            tonalElevation = 2.dp,
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
                        Text(
                            "T",
                            color = TophJade,
                            fontSize = 31.sp,
                            fontWeight = FontWeight.ExtraBold,
                        )
                    }
                }
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        "Toph",
                        style = androidx.compose.material3.MaterialTheme.typography.titleLarge,
                        color = TophText,
                    )
                    Text(
                        "Code, data and AI in one workbench.",
                        color = TophMuted,
                        fontSize = 12.sp,
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    state.baseUrl,
                    color = TophMuted2,
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                    fontSize = 10.sp,
                )
                OutlinedTextField(
                    value = username,
                    onValueChange = { username = it },
                    label = { Text("Username") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
                if (state.error != null) {
                    Text(
                        state.error,
                        color = TophError,
                        fontSize = 12.sp,
                    )
                }
                Button(
                    onClick = { viewModel.login(username, password) },
                    enabled = canSubmit && !state.busy,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = TophJade,
                        contentColor = Color(0xFF10140B),
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(46.dp),
                ) {
                    if (state.busy) {
                        CircularProgressIndicator(
                            color = Color(0xFF10140B),
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(18.dp),
                        )
                    } else {
                        Text("Sign in", fontWeight = FontWeight.Bold)
                    }
                }
                Text(
                    "Self-hosted. The first password is printed in the server log.",
                    color = TophMuted2,
                    fontSize = 10.5.sp,
                    lineHeight = 15.sp,
                )
                TextButton(
                    onClick = viewModel::changeServer,
                ) {
                    Text("Change server", color = TophMuted2, fontSize = 11.sp)
                }
            }
        }
    }
}
