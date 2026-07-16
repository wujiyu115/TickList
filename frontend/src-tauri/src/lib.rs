use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

/// 切换主窗口显示/隐藏；隐藏状态则显示并聚焦。
fn toggle_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

/// 托盘弹窗窗口尺寸（含四周透明外边距，用于容纳 CSS 阴影）。
const TRAY_MENU_W: f64 = 240.0;
const TRAY_MENU_H: f64 = 140.0;

#[tauri::command]
fn tray_toggle_window(app: AppHandle) {
    toggle_main_window(&app);
    if let Some(w) = app.get_webview_window("tray-menu") {
        let _ = w.hide();
    }
}

#[tauri::command]
fn tray_quit(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![tray_toggle_window, tray_quit])
        .setup(|app| {
            // 预建隐藏的透明托盘弹窗，加载前端轻量入口 index.html#tray
            let _tray_window = WebviewWindowBuilder::new(
                app,
                "tray-menu",
                WebviewUrl::App("index.html#tray".into()),
            )
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .shadow(false)
            .visible(false)
            .inner_size(TRAY_MENU_W, TRAY_MENU_H)
            .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .on_tray_icon_event(|tray, event| match event {
                    // 左键：切换主窗口（现状不变）
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } => {
                        toggle_main_window(tray.app_handle());
                    }
                    // 右键：在光标附近弹出磨砂菜单窗
                    TrayIconEvent::Click {
                        button: MouseButton::Right,
                        button_state: MouseButtonState::Up,
                        position,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("tray-menu") {
                            // 菜单出现在光标左上方（Windows 托盘在右下，向上展开）
                            let x = position.x - TRAY_MENU_W;
                            let y = position.y - TRAY_MENU_H;
                            let _ = win.set_position(PhysicalPosition::new(x, y));
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| match event {
            // 主窗口关闭请求拦截为隐藏到托盘
            WindowEvent::CloseRequested { api, .. } => {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            // 托盘弹窗失焦自动隐藏
            WindowEvent::Focused(false) => {
                if window.label() == "tray-menu" {
                    let _ = window.hide();
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
