// Brandzo Hub — قشرة سطح مكتب: نافذة أصلية تفتح النظام السحابي الحيّ.
// «العامل الخفي» (Service Worker) المبنيّ في الموقع يعمل داخل WebView2،
// فيرث البرنامج المنصَّب العملَ دون اتصال والتحديثَ الذاتي تلقائيًّا.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Brandzo Hub");
}
