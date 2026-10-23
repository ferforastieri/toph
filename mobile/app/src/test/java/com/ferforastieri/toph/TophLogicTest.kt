package com.ferforastieri.toph

import com.ferforastieri.toph.data.TophApi
import com.ferforastieri.toph.data.UpdateChecker
import com.ferforastieri.toph.data.languageFor
import org.junit.Assert.assertEquals
import org.junit.Test

class TophLogicTest {
    @Test
    fun editorLanguageUsesFileExtensions() {
        assertEquals("go", languageFor("cmd/toph/main.go"))
        assertEquals("typescript", languageFor("src/App.tsx"))
        assertEquals("sql", languageFor("query.sql"))
        assertEquals("dockerfile", languageFor("Dockerfile"))
        assertEquals("plaintext", languageFor("LICENSE"))
    }

    @Test
    fun comparesReleaseVersions() {
        assert(UpdateChecker.isNewer("0.2.0", "0.1.9"))
        assert(UpdateChecker.isNewer("1.0.0", "0.9.9"))
        assert(!UpdateChecker.isNewer("0.1.0", "0.1.0"))
        assert(!UpdateChecker.isNewer("0.1.0", "0.2.0"))
    }

    @Test
    fun serverUrlGetsSchemeAndNoTrailingSlash() {
        assertEquals("http://192.168.1.10:8787", TophApi.normalizeBaseUrl("192.168.1.10:8787/"))
        assertEquals("https://lab.home.arpa", TophApi.normalizeBaseUrl("https://lab.home.arpa/"))
        assertEquals("http://localhost:8787", TophApi.normalizeBaseUrl(" http://localhost:8787/ "))
    }
}
