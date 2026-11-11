// BHOME — ثنائيُّ سطح المكتب: ينادي نقطةَ التشغيل المشتركة في المكتبة.
// (موبايل Tauri يُقلِع من `lib.rs::run` مباشرةً عبر `mobile_entry_point`.)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    brandzo_hub_lib::run()
}
