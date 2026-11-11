// BHOME — نقطةُ التشغيل المشتركة بين سطح المكتب والموبايل (Tauri 2).
//
// ★ لماذا مكتبة؟ موبايل Tauri يُقلِع من القشرة الأصليّة (Android/iOS) التي تنادي
//   دالّةَ `run()` هذه عبر `mobile_entry_point`، لا من ثنائيٍّ له `main`. فالمنطقُ
//   كلُّه هنا، و`main.rs` لسطح المكتب يناديها، فلا يفترق المسلكان.
//
// ★ طبقةُ البيانات المحلّيّة واحدةٌ للاثنين: جسرُ SQL في `db.rs` يفتح قاعدةً
//   مدمجةً (SQLite) في مجلّد بيانات التطبيق — على ويندوز وأندرويد سواء.
//
// ★ التحديثُ التلقائيّ عبر مُلحق Tauri **لسطح المكتب وحده** (لا يدعم الموبايل)،
//   فهو محروسٌ بـ`cfg(desktop)` ولا يُصرَّف لأندرويد؛ وتحديثُ أندرويد يأتي من
//   مُحدِّثٍ مخصّصٍ في الواجهة (فحصُ إصدار + تنزيلُ APK موقَّع).

mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        // فتحُ الروابط خارجيًّا (سطح المكتب وأندرويد) — لمحدّث أندرويد.
        .plugin(tauri_plugin_opener::init());

    // مُلحقُ التحديث لسطح المكتب فقط — غيرُ مدعومٍ على الموبايل ولا يُصرَّف له.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .setup(|app| {
            db::init(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::bhome_db_query,
            db::bhome_db_exec,
            db::bhome_db_batch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running BHOME");
}
