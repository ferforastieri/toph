import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const signing = [
  "ANDROID_KEYSTORE_PATH",
  "ANDROID_KEYSTORE_PASSWORD",
  "ANDROID_KEY_ALIAS",
  "ANDROID_KEY_PASSWORD",
];
if (signing.every((name) => !process.env[name])) {
  console.log("Android signing environment not set; leaving the Gradle project unsigned.");
} else if (signing.some((name) => !process.env[name])) {
  throw new Error(`Incomplete Android signing environment: ${signing.filter((name) => !process.env[name]).join(", ")}`);
}

const file = resolve("src-tauri/gen/android/app/build.gradle.kts");
let source = await readFile(file, "utf8");
if (signing.every((name) => process.env[name]) && !source.includes('create("release")')) {
  source = source.replace(
    "android {\n",
    `android {
    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("ANDROID_KEYSTORE_PATH"))
            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("ANDROID_KEY_ALIAS")
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
`,
  );
}
if (signing.every((name) => process.env[name])) {
  source = source.replace(
    'getByName("release") {\n',
    'getByName("release") {\n            signingConfig = signingConfigs.getByName("release")\n',
  );
}
// Self-hosted servers may be reached over LAN HTTP. The native app already
// allowed cleartext; keep that capability for the Tauri release build so a
// Toph server URL with http:// works without a hidden platform failure.
source = source.replace(
  'manifestPlaceholders["usesCleartextTraffic"] = "false"',
  'manifestPlaceholders["usesCleartextTraffic"] = "true"',
);
source = source.replace(
  'versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()',
  'versionCode = System.getenv("TOPH_VERSION_CODE")?.toInt() ?: tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()',
);
source = source.replace(
  'versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")',
  'versionName = System.getenv("TOPH_VERSION_NAME") ?: tauriProperties.getProperty("tauri.android.versionName", "1.0")',
);
await writeFile(file, source);
console.log("Configured Android release build settings.");
