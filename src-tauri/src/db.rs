// ═══════════════════════════════════════════════════════════════════════════
//  بابُ القاعدة المحلّيّة — جسرُ SQL رقيقٌ لا أكثر
// ═══════════════════════════════════════════════════════════════════════════
//
// ★★★ القرارُ الحاكم: **المنطقُ في JavaScript المُختبَر، وRust جسرٌ رقيق.**
//     لا يعرف هذا الملفُّ شيئًا عن Firestore ولا عن المجموعات ولا عن القيود؛
//     يستقبل نصَّ SQL ومعاملاتِه ويُنفّذه، لا غير. فترجمةُ عقد Firestore إلى
//     SQL كلُّها في `src/services/_db/localSqlite/` حيث تُختبَر في Node بلا
//     قاعدةٍ ولا جهاز — وهذا الجسرُ يُفحص في بناء CI (لا يُجمَّع Rust محلّيًّا).
//
// ★★ التخويلُ لا RLS: SQLite بلا أمنٍ على مستوى الصفّ، فبابُ الكتابة الواحد
//     هو هذه الأوامرُ الثلاثة، والصلاحيّةُ تُفرض فوقها في طبقةٍ لاحقة (م٢) كما
//     يفعل `post_journal` في PostgreSQL — لا هنا في الجسر.
// ═══════════════════════════════════════════════════════════════════════════

use std::sync::Mutex;

use rusqlite::types::Value as SqlValue;
use rusqlite::Connection;
use serde::Deserialize;
use serde_json::{Map, Value as Json};
use tauri::{AppHandle, Manager, State};

/// الهجراتُ المدمجةُ في البرنامج — تُنفَّذ مرّةً، وما يُغيَّر يُغيَّر بهجرةٍ جديدةٍ
/// مرقّمة لا بتعديل سابقةٍ (نفسُ عُرف `db/schema`).
const MIGRATIONS: &[(&str, &str)] = &[(
    "001-kv-docs.sql",
    include_str!("../migrations/001-kv-docs.sql"),
)];

/// اتّصالٌ واحدٌ محروسٌ بقفلٍ — كاتبٌ واحدٌ بحكم التصميم.
pub struct Db(pub Mutex<Connection>);

/// بيانٌ واحدٌ في دفعةٍ ذرّيّة.
#[derive(Deserialize)]
pub struct Stmt {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<Json>,
}

/// يفتح القاعدةَ في مجلّد بيانات التطبيق، يُرحّل المخطّط، ويُسجّل الاتّصال.
pub fn init(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&dir)?;
    let conn = Connection::open(dir.join("bhome.sqlite3"))?;
    migrate(&conn)?;
    app.manage(Db(Mutex::new(conn)));
    Ok(())
}

/// يُنفّذ كلَّ هجرةٍ لم تُطبَّق بعد، ويُسجّلها كي لا تُعاد.
fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            name       TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
        );",
    )?;
    for (name, sql) in MIGRATIONS {
        let done: bool = conn
            .query_row("SELECT 1 FROM _migrations WHERE name = ?1", [name], |_| {
                Ok(true)
            })
            .unwrap_or(false);
        if done {
            continue;
        }
        conn.execute_batch(sql)?;
        conn.execute(
            "INSERT INTO _migrations (name, applied_at) VALUES (?1, datetime('now'))",
            [name],
        )?;
    }
    Ok(())
}

/// قيمةُ JSON ⟵ قيمةُ SQLite. المعاملاتُ أوّليّةٌ دائمًا (الوثيقةُ كلُّها تُمرَّر
/// نصًّا واحدًا من JavaScript)، وما شذّ يُسلسَل نصًّا احتياطًا.
fn to_sql(v: &Json) -> SqlValue {
    match v {
        Json::Null => SqlValue::Null,
        Json::Bool(b) => SqlValue::Integer(if *b { 1 } else { 0 }),
        Json::Number(n) => {
            if let Some(i) = n.as_i64() {
                SqlValue::Integer(i)
            } else {
                SqlValue::Real(n.as_f64().unwrap_or(0.0))
            }
        }
        Json::String(s) => SqlValue::Text(s.clone()),
        other => SqlValue::Text(other.to_string()),
    }
}

/// قيمةُ SQLite ⟵ قيمةُ JSON.
fn from_sql(v: SqlValue) -> Json {
    match v {
        SqlValue::Null => Json::Null,
        SqlValue::Integer(i) => Json::from(i),
        SqlValue::Real(f) => Json::from(f),
        SqlValue::Text(s) => Json::String(s),
        SqlValue::Blob(b) => Json::String(String::from_utf8_lossy(&b).to_string()),
    }
}

/// قراءةٌ: نصُّ SELECT ومعاملاتُه ⟵ صفوفٌ ككائناتٍ باسم العمود.
#[tauri::command]
pub fn bhome_db_query(
    db: State<'_, Db>,
    sql: String,
    params: Vec<Json>,
) -> Result<Vec<Map<String, Json>>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let bound: Vec<SqlValue> = params.iter().map(to_sql).collect();
    let rows = stmt
        .query_map(rusqlite::params_from_iter(bound.iter()), |row| {
            let mut obj = Map::new();
            for (i, name) in cols.iter().enumerate() {
                let val: SqlValue = row.get(i)?;
                obj.insert(name.clone(), from_sql(val));
            }
            Ok(obj)
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// كتابةٌ واحدة: نصُّ INSERT/UPDATE/DELETE ومعاملاتُه ⟵ عددُ الصفوف المتأثّرة.
#[tauri::command]
pub fn bhome_db_exec(db: State<'_, Db>, sql: String, params: Vec<Json>) -> Result<usize, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let bound: Vec<SqlValue> = params.iter().map(to_sql).collect();
    conn.execute(&sql, rusqlite::params_from_iter(bound.iter()))
        .map_err(|e| e.to_string())
}

/// دفعةٌ ذرّيّة: إمّا أن تنجح كلُّها أو لا يُكتب شيء. أساسُ `writeBatch`
/// و`runTransaction` — فالمستندُ المتعدّدُ لا يُترك نصفَ مكتوب.
#[tauri::command]
pub fn bhome_db_batch(db: State<'_, Db>, stmts: Vec<Stmt>) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for s in &stmts {
        let bound: Vec<SqlValue> = s.params.iter().map(to_sql).collect();
        tx.execute(&s.sql, rusqlite::params_from_iter(bound.iter()))
            .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
