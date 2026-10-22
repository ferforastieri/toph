package com.ferforastieri.toph.data

fun languageFor(path: String): String {
    val name = path.substringAfterLast('/').lowercase()
    val extension = name.substringAfterLast('.', "")
    return when {
        name == "dockerfile" -> "dockerfile"
        name == "makefile" -> "shell"
        extension in setOf("ts", "tsx") -> "typescript"
        extension in setOf("js", "jsx", "mjs", "cjs") -> "javascript"
        extension == "json" -> "json"
        extension == "sql" -> "sql"
        extension in setOf("py", "pyw") -> "python"
        extension in setOf("html", "htm") -> "html"
        extension == "css" -> "css"
        extension in setOf("md", "mdx") -> "markdown"
        extension == "go" -> "go"
        extension in setOf("sh", "bash", "zsh") -> "shell"
        else -> "plaintext"
    }
}
