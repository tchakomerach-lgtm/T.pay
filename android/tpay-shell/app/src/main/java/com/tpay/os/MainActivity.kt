package com.tpay.os

import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private val startUri = Uri.parse(BuildConfig.TPAY_WEB_URL)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requireHttps(startUri)
        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    requireHttps(request.url)
                    return request.url.host != startUri.host || request.url.port != startUri.port
                }
            }
        }
        setContentView(webView)
        webView.loadUrl(startUri.toString())
    }

    private fun requireHttps(uri: Uri) {
        check(uri.scheme == "https") { "T.Pay Android requires HTTPS" }
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
