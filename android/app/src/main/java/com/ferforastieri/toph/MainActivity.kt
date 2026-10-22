package com.ferforastieri.toph

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.ferforastieri.toph.ui.BootScreen
import com.ferforastieri.toph.ui.LoginScreen
import com.ferforastieri.toph.ui.TophTheme
import com.ferforastieri.toph.ui.TophViewModel
import com.ferforastieri.toph.ui.WorkbenchScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            TophTheme {
                val viewModel: TophViewModel = viewModel()
                val state by viewModel.state.collectAsStateWithLifecycle()
                when {
                    state.booting -> BootScreen()
                    state.user == null -> LoginScreen(viewModel, state)
                    else -> WorkbenchScreen(viewModel, state)
                }
            }
        }
    }
}
