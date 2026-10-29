import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const app = resolve(import.meta.dirname, "..");
const source = resolve(app, "android");
const generated = resolve(app, "src-tauri/gen/android");
const packageDir = resolve(
  generated,
  "app/src/main/java/br/com/ferforastieri/toph",
);
const drawableDir = resolve(generated, "app/src/main/res/drawable");

await mkdir(packageDir, { recursive: true });
await mkdir(drawableDir, { recursive: true });

for (const file of ["MainActivity.kt", "TophPush.kt", "TophMessagingService.kt"]) {
  await copyFile(resolve(source, file), resolve(packageDir, file));
}
await copyFile(resolve(source, "ic_stat_toph.xml"), resolve(drawableDir, "ic_stat_toph.xml"));
await copyFile(resolve(source, "google-services.json"), resolve(generated, "app/google-services.json"));
for (const [relative, destination] of [
  ["values/colors.xml", "app/src/main/res/values/colors.xml"],
  ["values/themes.xml", "app/src/main/res/values/themes.xml"],
  ["values-night/themes.xml", "app/src/main/res/values-night/themes.xml"],
  ["values-v31/themes.xml", "app/src/main/res/values-v31/themes.xml"],
  ["drawable/ic_launcher_background.xml", "app/src/main/res/drawable/ic_launcher_background.xml"],
]) {
  const target = resolve(generated, destination);
  await mkdir(resolve(target, ".."), { recursive: true });
  await copyFile(resolve(source, relative), target);
}

const rootGradlePath = resolve(generated, "build.gradle.kts");
let rootGradle = await readFile(rootGradlePath, "utf8");
if (!rootGradle.includes("com.google.gms:google-services")) {
  rootGradle = rootGradle.replace(
    'classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.10")',
    'classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.10")\n        classpath("com.google.gms:google-services:4.4.3")',
  );
  await writeFile(rootGradlePath, rootGradle);
}

const appGradlePath = resolve(generated, "app/build.gradle.kts");
let appGradle = await readFile(appGradlePath, "utf8");
if (!appGradle.includes('id("com.google.gms.google-services")')) {
  appGradle = appGradle.replace(
    '    id("rust")\n}',
    '    id("rust")\n    id("com.google.gms.google-services")\n}',
  );
}
if (!appGradle.includes("firebase-messaging")) {
  appGradle = appGradle.replace(
    '    implementation("androidx.webkit:webkit:1.14.0")',
    '    implementation("androidx.webkit:webkit:1.14.0")\n    implementation("com.google.firebase:firebase-messaging:24.1.2")',
  );
}
await writeFile(appGradlePath, appGradle);

const manifestPath = resolve(generated, "app/src/main/AndroidManifest.xml");
let manifest = await readFile(manifestPath, "utf8");
if (!manifest.includes("android.permission.POST_NOTIFICATIONS")) {
  manifest = manifest.replace(
    '    <uses-permission android:name="android.permission.INTERNET" />',
    '    <uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
  );
}
if (!manifest.includes("TophMessagingService")) {
  manifest = manifest.replace(
    "    </application>",
    `        <service
            android:name=".TophMessagingService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>
    </application>`,
  );
}
await writeFile(manifestPath, manifest);

console.log("Android MainActivity patched for downloads, safe areas and FCM push.");
