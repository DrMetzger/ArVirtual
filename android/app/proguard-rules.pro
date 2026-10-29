# A ponte com o site é chamada pelo JavaScript: os métodos não podem ser renomeados nem removidos.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
