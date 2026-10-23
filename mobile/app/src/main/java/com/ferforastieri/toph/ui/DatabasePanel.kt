@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.ferforastieri.toph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.composables.icons.lucide.ChevronDown
import com.composables.icons.lucide.Database
import com.composables.icons.lucide.Lucide
import com.composables.icons.lucide.Play
import com.composables.icons.lucide.Plus
import com.ferforastieri.toph.data.QueryResult
import com.ferforastieri.toph.data.RowChangeRequest
import com.ferforastieri.toph.data.SchemaTable
import com.ferforastieri.toph.data.UiState
import com.ferforastieri.toph.data.WorkTab
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

@Composable
fun DatabasePanel(
    state: UiState,
    tab: WorkTab,
    onProfile: (String) -> Unit,
    onSql: (String) -> Unit,
    onRun: () -> Unit,
    onCreateProfile: (String, String, String, Boolean) -> Unit,
    schemas: Map<String, List<SchemaTable>>,
    onLoadSchema: (String) -> Unit,
    onOpenTable: (String, SchemaTable) -> Unit,
    onUpdateRow: (RowChangeRequest) -> Unit,
    onDeleteRow: (RowChangeRequest) -> Unit,
) {
    val profiles = state.dbProfiles
    val selected = profiles.firstOrNull { it.id == tab.profileId } ?: profiles.firstOrNull()
    var menu by remember { mutableStateOf(false) }
    var showCreate by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Pair<Int, Map<String, String>>?>(null) }
    val primaryColumns = tab.table?.columns?.filter { it.primary }?.map { it.name }.orEmpty()
    val canEdit = tab.table != null &&
        primaryColumns.isNotEmpty() &&
        selected?.readOnly != true

    androidx.compose.runtime.LaunchedEffect(selected?.id) {
        selected?.id?.let(onLoadSchema)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(TophBg)
            .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box {
                OutlinedButton(
                    onClick = { menu = true },
                    shape = RoundedCornerShape(7.dp),
                    modifier = Modifier.height(42.dp),
                ) {
                    Icon(Lucide.Database, null, tint = TophJade, modifier = Modifier.size(15.dp))
                    Spacer(Modifier.width(7.dp))
                    Text(
                        selected?.name ?: "Choose connection",
                        color = TophText,
                        fontSize = 12.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(Modifier.width(4.dp))
                    Icon(Lucide.ChevronDown, null, tint = TophMuted2, modifier = Modifier.size(13.dp))
                }
                DropdownMenu(
                    expanded = menu,
                    onDismissRequest = { menu = false },
                    containerColor = TophElevated,
                ) {
                    profiles.forEach { profile ->
                        DropdownMenuItem(
                            text = {
                                Column {
                                    Text(profile.name, color = TophText, fontSize = 12.sp)
                                    Text(
                                        "${profile.driver}${if (profile.readOnly) " · read-only" else ""}",
                                        color = TophMuted2,
                                        fontSize = 9.5.sp,
                                    )
                                }
                            },
                            onClick = {
                                menu = false
                                onProfile(profile.id)
                            },
                        )
                    }
                    val schemaTables = selected?.let { schemas[it.id] }.orEmpty()
        if (selected != null && schemaTables.isNotEmpty()) {
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(5.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 1.dp),
            ) {
                items(schemaTables, key = { "${it.schema}.${it.name}" }) { table ->
                    androidx.compose.material3.AssistChip(
                        onClick = {
                            onOpenTable(selected.id, table)
                        },
                        label = {
                            Text(
                                table.name,
                                color = TophMuted,
                                fontSize = 10.sp,
                                maxLines = 1,
                            )
                        },
                    )
                }
            }
        }

        if (profiles.isEmpty()) {
                        DropdownMenuItem(
                            text = { Text("No connections", color = TophMuted) },
                            onClick = { menu = false },
                        )
                    }
                }
            }
            Spacer(Modifier.width(8.dp))
            if (selected != null) {
                Surface(
                    color = TophElevated,
                    shape = RoundedCornerShape(5.dp),
                ) {
                    Text(
                        selected.driver.uppercase(),
                        color = TophInfo,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp),
                    )
                }
            }
            Spacer(Modifier.weight(1f))
            IconButton(onClick = { showCreate = true }, modifier = Modifier.size(38.dp)) {
                Icon(Lucide.Plus, "New connection", tint = TophMuted, modifier = Modifier.size(18.dp))
            }
            Button(
                onClick = onRun,
                enabled = selected != null && tab.sql.isNotBlank() && !tab.loading,
                colors = ButtonDefaults.buttonColors(
                    containerColor = TophJade,
                    contentColor = Color(0xFF10140B),
                ),
                shape = RoundedCornerShape(7.dp),
                modifier = Modifier.height(40.dp),
            ) {
                if (tab.loading) {
                    CircularProgressIndicator(
                        color = Color(0xFF10140B),
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(15.dp),
                    )
                } else {
                    Icon(Lucide.Play, null, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(5.dp))
                    Text("Run", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
            }
        }

        val schemaTables = selected?.let { schemas[it.id] }.orEmpty()
        if (selected != null && schemaTables.isNotEmpty()) {
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(5.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 1.dp),
            ) {
                items(schemaTables, key = { "${it.schema}.${it.name}" }) { table ->
                    androidx.compose.material3.AssistChip(
                        onClick = {
                            onOpenTable(selected.id, table)
                        },
                        label = {
                            Text(
                                table.name,
                                color = TophMuted,
                                fontSize = 10.sp,
                                maxLines = 1,
                            )
                        },
                    )
                }
            }
        }

        if (profiles.isEmpty()) {
            Surface(
                color = TophSurface,
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        "No database connections yet.",
                        color = TophMuted,
                        fontSize = 11.5.sp,
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(onClick = { showCreate = true }) {
                        Icon(Lucide.Plus, null, modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(5.dp))
                        Text("Add connection", fontSize = 11.sp)
                    }
                }
            }
        }

        OutlinedTextField(
            value = tab.sql,
            onValueChange = onSql,
            modifier = Modifier
                .fillMaxWidth()
                .height(150.dp),
            placeholder = {
                Text(
                    queryPlaceholder(selected?.driver),
                    color = TophMuted2,
                    fontFamily = FontFamily.Monospace,
                )
            },
            textStyle = androidx.compose.ui.text.TextStyle(
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                color = TophText,
            ),
            shape = RoundedCornerShape(8.dp),
        )

        if (tab.error != null) {
            Text(
                tab.error,
                color = TophError,
                fontSize = 11.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(TophSurface)
                    .padding(10.dp),
            )
        }

        val result = tab.result
        if (result == null) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "Run a query to see results.",
                    color = TophMuted2,
                    fontSize = 12.sp,
                )
            }
        } else {
            ResultTable(
                result = result,
                canEdit = canEdit,
                primaryColumns = primaryColumns,
                onEdit = { index ->
                    val row = result.rows.getOrNull(index) ?: return@ResultTable
                    val values = result.columns.mapIndexed { columnIndex, column ->
                        column.name to editableCell(row[columnIndex])
                    }.toMap()
                    editing = index to values
                },
                onDelete = { index ->
                    val row = result.rows.getOrNull(index) ?: return@ResultTable
                    val key = rowKey(result, row, primaryColumns) ?: return@ResultTable
                    onDeleteRow(
                        RowChangeRequest(
                            schema = tab.table?.schema.orEmpty(),
                            table = tab.table?.name.orEmpty(),
                            key = key,
                        ),
                    )
                },
                modifier = Modifier.weight(1f),
            )
        }
    }

    if (editing != null && tab.table != null) {
        EditRowDialog(
            table = tab.table,
            primaryColumns = primaryColumns,
            columns = tab.result?.columns.orEmpty(),
            row = tab.result?.rows?.getOrNull(editing!!.first).orEmpty(),
            values = editing!!.second,
            onDismiss = { editing = null },
            onSave = { updated ->
                val key = rowKey(
                    tab.result,
                    tab.result?.rows?.getOrNull(editing!!.first).orEmpty(),
                    primaryColumns,
                ) ?: return@EditRowDialog
                val values = updated
                    .filterKeys { it !in primaryColumns }
                    .mapValues { (_, value) -> toJsonValue(value) }
                onUpdateRow(
                    RowChangeRequest(
                        schema = tab.table.schema,
                        table = tab.table.name,
                        key = key,
                        values = values,
                    ),
                )
                editing = null
            },
        )
    }

    if (showCreate) {
        CreateConnectionSheet(
            onDismiss = { showCreate = false },
            onCreate = { name, driver, dsn, readOnly ->
                showCreate = false
                onCreateProfile(name, driver, dsn, readOnly)
            },
        )
    }
}

@Composable
private fun CreateConnectionSheet(
    onDismiss: () -> Unit,
    onCreate: (String, String, String, Boolean) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var driver by remember { mutableStateOf("postgres") }
    var dsn by remember { mutableStateOf("") }
    var readOnly by remember { mutableStateOf(true) }
    var driverMenu by remember { mutableStateOf(false) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = TophSurface,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 26.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("New database connection", color = TophText, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Box {
                OutlinedButton(
                    onClick = { driverMenu = true },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(driver.displayDriver(), color = TophText, modifier = Modifier.weight(1f), fontSize = 12.sp)
                    Icon(Lucide.ChevronDown, null, tint = TophMuted2, modifier = Modifier.size(14.dp))
                }
                DropdownMenu(
                    expanded = driverMenu,
                    onDismissRequest = { driverMenu = false },
                    containerColor = TophElevated,
                ) {
                    listOf(
                        "postgres", "mysql", "sqlite", "sqlserver", "oracle", "clickhouse",
                        "mongodb", "redis", "cassandra", "elasticsearch", "neo4j",
                    ).forEach {
                        DropdownMenuItem(
                            text = { Text(it.displayDriver(), color = TophText) },
                            onClick = {
                                driver = it
                                driverMenu = false
                            },
                        )
                    }
                }
            }
            OutlinedTextField(
                value = dsn,
                onValueChange = { dsn = it },
                label = { Text("DSN") },
                placeholder = { Text(dsnHint(driver), color = TophMuted2, fontSize = 10.5.sp) },
                minLines = 2,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Read-only", color = TophText, fontSize = 12.sp)
                    Text("Reject writes in the Toph query editor.", color = TophMuted2, fontSize = 10.sp)
                }
                Switch(checked = readOnly, onCheckedChange = { readOnly = it })
            }
            Button(
                onClick = { onCreate(name.trim(), driver, dsn.trim(), readOnly) },
                enabled = name.isNotBlank() && dsn.isNotBlank(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = TophJade,
                    contentColor = Color(0xFF10140B),
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp),
            ) {
                Text("Add connection", fontWeight = FontWeight.Bold)
            }
        }
    }
}

private fun String.displayDriver(): String = when (this) {
    "postgres" -> "PostgreSQL"
    "mysql" -> "MySQL / MariaDB"
    "sqlite" -> "SQLite"
    "sqlserver" -> "SQL Server"
    "oracle" -> "Oracle"
    "clickhouse" -> "ClickHouse"
    "mongodb" -> "MongoDB"
    "redis" -> "Redis"
    "cassandra" -> "Cassandra"
    "elasticsearch" -> "Elasticsearch"
    "neo4j" -> "Neo4j"
    else -> this
}

private fun dsnHint(driver: String): String = when (driver) {
    "postgres" -> "postgres://user:pass@host:5432/db?sslmode=disable"
    "mysql" -> "user:pass@tcp(host:3306)/db"
    "sqlite" -> "/path/to/database.db"
    "sqlserver" -> "sqlserver://user:pass@host:1433?database=db"
    "oracle" -> "oracle://user:pass@host:1521/service"
    "clickhouse" -> "clickhouse://user:pass@host:9000/db"
    "mongodb" -> "mongodb://user:pass@host:27017"
    "redis" -> "redis://user:pass@host:6379/0"
    "cassandra" -> "cassandra://host:9042/keyspace"
    "elasticsearch" -> "http://user:pass@host:9200"
    "neo4j" -> "neo4j://user:pass@host:7687"
    else -> ""
}

private fun defaultQuery(driver: String, table: SchemaTable): String {
    return when (driver) {
        "mongodb" -> """{"database":"${table.schema}","collection":"${table.name}","filter":{},"limit":100}"""
        "redis" -> "SCAN 0 COUNT 100"
        "cassandra" -> "SELECT * FROM ${table.schema}.${table.name} LIMIT 100;"
        "elasticsearch" -> """{"index":"${table.name}","body":{"query":{"match_all":{}},"size":100}}"""
        "neo4j" -> "MATCH (n:${table.name}) RETURN n LIMIT 100;"
        "mysql" -> "SELECT * FROM `${table.schema}`.`${table.name}` LIMIT 100;"
        "sqlite" -> "SELECT * FROM \"${table.name}\" LIMIT 100;"
        "sqlserver" -> "SELECT TOP 100 * FROM [${table.schema}].[${table.name}];"
        else -> "SELECT * FROM \"${table.schema}\".\"${table.name}\" LIMIT 100;"
    }
}

private fun queryPlaceholder(driver: String?): String = when (driver) {
    "mongodb" -> """{"database":"app","collection":"users","filter":{},"limit":100}"""
    "redis" -> "HGETALL user:1"
    "cassandra" -> "SELECT * FROM keyspace.table LIMIT 100;"
    "elasticsearch" -> """{"index":"logs-*","body":{"query":{"match_all":{}},"size":100}}"""
    "neo4j" -> "MATCH (n) RETURN n LIMIT 100;"
    else -> "SELECT * FROM ..."
}

@Composable
private fun ResultTable(
    result: QueryResult,
    canEdit: Boolean,
    primaryColumns: List<String>,
    onEdit: (Int) -> Unit,
    onDelete: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 2.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("${result.rowCount} rows", color = TophMuted2, fontSize = 10.sp)
            Text("${result.durationMs} ms", color = TophMuted2, fontSize = 10.sp)
            if (result.truncated) {
                Text("truncated", color = TophWarning, fontSize = 10.sp)
            }
        }
        if (result.columns.isEmpty()) {
            Text("Statement executed.", color = TophMuted, fontSize = 12.sp)
            return@Column
        }
        val scroll = rememberScrollState()
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .horizontalScroll(scroll),
        ) {
            Column(
                modifier = Modifier
                    .width((maxOf(result.columns.size, 3) * 150).dp)
                    .fillMaxHeight(),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(TophElevated)
                        .padding(vertical = 6.dp),
                ) {
                    result.columns.forEach { column ->
                        Text(
                            column.name,
                            color = TophJadeHover,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier
                                .width(150.dp)
                                .padding(horizontal = 7.dp),
                        )
                    }
                    if (canEdit) {
                        Text(
                            "Actions",
                            color = TophJadeHover,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier
                                .width(84.dp)
                                .padding(horizontal = 7.dp),
                        )
                    }
                }
                LazyColumn(modifier = Modifier.weight(1f)) {
                    itemsIndexed(result.rows) { index, row ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(if (index % 2 == 0) TophBg else TophSurface)
                                .padding(vertical = 5.dp),
                        ) {
                            row.forEach { cell ->
                                Text(
                                    formatCell(cell),
                                    color = if (cell is JsonPrimitive && cell.contentOrNull == null) {
                                        TophMuted2
                                    } else {
                                        TophText
                                    },
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 10.5.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier
                                        .width(150.dp)
                                        .padding(horizontal = 7.dp),
                                )
                            }
                            if (canEdit) {
                                Row(
                                    modifier = Modifier.width(84.dp),
                                    horizontalArrangement = Arrangement.End,
                                ) {
                                    androidx.compose.material3.TextButton(
                                        onClick = { onEdit(index) },
                                        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 4.dp),
                                    ) {
                                        Text("Edit", color = TophJade, fontSize = 10.sp)
                                    }
                                    androidx.compose.material3.TextButton(
                                        onClick = { onDelete(index) },
                                        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 4.dp),
                                    ) {
                                        Text("Del", color = TophError, fontSize = 10.sp)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun formatCell(value: JsonElement): String {
    return when (value) {
        is JsonPrimitive -> value.contentOrNull ?: "NULL"
        else -> value.toString()
    }
}

private fun editableCell(value: JsonElement): String {
    return if (value is JsonPrimitive && value.contentOrNull == null) "" else formatCell(value)
}

private fun rowKey(result: QueryResult?, row: List<JsonElement>, primary: List<String>): Map<String, JsonElement>? {
    if (result == null) return null
    val key = mutableMapOf<String, JsonElement>()
    for (column in primary) {
        val index = result.columns.indexOfFirst { it.name == column }
        if (index < 0) return null
        key[column] = row.getOrNull(index) ?: return null
    }
    return key
}

private fun toJsonValue(value: String): JsonElement {
    if (value.isEmpty()) return JsonPrimitive("")
    if (value == "null") return kotlinx.serialization.json.JsonNull
    if (value == "true" || value == "false" || value.matches(Regex("-?\\d+(\\.\\d+)?"))) {
        return runCatching { Json.parseToJsonElement(value) }.getOrElse { JsonPrimitive(value) }
    }
    if (value.startsWith("{") || value.startsWith("[")) {
        return runCatching { Json.parseToJsonElement(value) }.getOrElse { JsonPrimitive(value) }
    }
    return JsonPrimitive(value)
}

@Composable
private fun EditRowDialog(
    table: SchemaTable,
    primaryColumns: List<String>,
    columns: List<com.ferforastieri.toph.data.QueryColumn>,
    row: List<JsonElement>,
    values: Map<String, String>,
    onDismiss: () -> Unit,
    onSave: (Map<String, String>) -> Unit,
) {
    var draft by remember { mutableStateOf(values) }
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = TophSurface,
        title = { Text("Edit ${table.name}", color = TophText) },
        text = {
            LazyColumn(modifier = Modifier.height(320.dp)) {
                items(columns, key = { it.name }) { column ->
                    val disabled = column.name in primaryColumns
                    OutlinedTextField(
                        value = draft[column.name].orEmpty(),
                        onValueChange = { draft = draft + (column.name to it) },
                        enabled = !disabled,
                        label = {
                            Text(
                                column.name + if (disabled) " · primary key" else "",
                                fontSize = 10.sp,
                                color = if (disabled) TophMuted2 else TophMuted,
                            )
                        },
                        singleLine = true,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 3.dp),
                    )
                }
            }
        },
        confirmButton = {
            androidx.compose.material3.TextButton(onClick = { onSave(draft) }) {
                Text("Save", color = TophJade, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            androidx.compose.material3.TextButton(onClick = onDismiss) {
                Text("Cancel", color = TophMuted)
            }
        },
    )
}
