plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.tpay.os"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.tpay.os"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        val terrainWebUrl = providers.gradleProperty("tpayWebUrl")
            .orElse("https://127.0.0.1:5173/")
            .get()
        require(terrainWebUrl.startsWith("https://")) {
            "T.Pay Android requires an HTTPS frontend URL"
        }
        buildConfigField("String", "TPAY_WEB_URL", "\\"$terrainWebUrl\\"")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures { buildConfig = true }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
}
