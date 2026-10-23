package com.ferforastieri.toph.data

fun defaultTableQuery(driver: String, table: SchemaTable): String {
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
