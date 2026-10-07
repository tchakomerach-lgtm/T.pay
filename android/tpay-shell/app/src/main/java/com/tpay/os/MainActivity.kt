package com.tpay.os

import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.webkit.SslErrorHandler
import android.net.http.SslError
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
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
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    requireHttps(request.url)
                    return request.url.host != startUri.host || request.url.port != startUri.port
                }

                override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, sslError: SslError) {
                    Log.e(TAG, "TPAY_SSL_ERROR:" + sslError.primaryError + ":" + sslError.url)
                    handler.cancel()
                }

                override fun onReceivedError(view: WebView, request: WebResourceRequest, webError: WebResourceError) {
                    Log.e(TAG, "TPAY_WEB_ERROR:" + webError.errorCode + ":" + webError.description + ":" + request.url)
                    super.onReceivedError(view, request, webError)
                }

                override fun onPageFinished(view: WebView, url: String) {
                    Log.i(TAG, "TPAY_WEB_LOADED:" + url)
                    super.onPageFinished(view, url)
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
        (webView.parent as? android.view.ViewGroup)?.removeView(webView)
        webView.stopLoading()
        webView.clearHistory()
        webView.destroy()
        super.onDestroy()
    }

    private companion object {
        const val TAG = "TPAY_TERRAIN"
    }
}
