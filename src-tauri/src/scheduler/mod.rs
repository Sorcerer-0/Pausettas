pub mod idle;
pub mod service;

use std::time::Duration;

use tauri::{AppHandle, Manager};

use crate::commands::{AppSchedulerService, AppSettingsService};
use crate::reminder_window;
use crate::sound;

const TICK_INTERVAL: Duration = Duration::from_secs(1);

/// Starts the one task that decides when reminders fire. It runs off the main thread,
/// which is also what lets it open the reminder window without deadlocking on Windows.
pub fn spawn(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(TICK_INTERVAL).await;
            tick(&app);
        }
    });
}

fn tick(app: &AppHandle) {
    // Every tick, so edits made in the UI apply at once; this only writes on the tick a pause ends.
    let settings = match app.state::<AppSettingsService>().expire_pause() {
        Ok(settings) => settings,
        Err(error) => {
            log::error!("could not read settings: {error}");
            return;
        }
    };

    let scheduler = app.state::<AppSchedulerService>();
    if let Some(category) = scheduler.tick(&settings) {
        if let Err(error) = reminder_window::show(app, category) {
            log::error!(
                "could not show the {} reminder, retrying soon: {error}",
                category.as_str()
            );
            scheduler.retry_soon(category);
            return;
        }
        if settings.sound_enabled {
            sound::play_notification();
        }
        return;
    }

    if let Some(custom) = scheduler.tick_custom(&settings) {
        if let Err(error) = reminder_window::show_custom(app, &custom) {
            log::error!("could not show custom reminder '{}': {error}", custom.title);
            return;
        }
        if settings.sound_enabled {
            sound::play_notification();
        }
    }
}
