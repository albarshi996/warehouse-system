// BHOME — قشرة سطح مكتب: نافذة أصلية تفتح النظام المحزوم محليًّا (dist-desktop).
// «العامل الخفي» (Service Worker) مُطفأٌ في بناء سطح المكتب بقرار الخطّة، والعملُ
// دون اتصالٍ يأتي من القاعدة المحلّيّة (SQLite) لا من مخبوء المتصفّح.
//
// ★ طبقةُ البيانات المحلّيّة (م١ · خاملة): جسرُ SQL في `db.rs` يفتح قاعدةً
//   مدمجةً ويُسجّل ثلاثة أوامر. ويبقى **خاملًا** حتّى يختار المحوَّلُ `local-sqlite`
//   (`PUBLIC_DB_BACKEND`)، فلا يتغيّر سلوكُ البرنامج قبل القطع.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;

fn main() {
    tauri::Builder::default()
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
