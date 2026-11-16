#![cfg_attr(windows, windows_subsystem = "windows")]

use std::env;
use std::io::{self, Write};
use std::thread;
use std::time::Duration;

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    fn GetAsyncKeyState(v_key: i32) -> i16;
}

#[cfg(windows)]
fn key_is_down(vk: i32) -> bool {
    unsafe { (GetAsyncKeyState(vk) as u16 & 0x8000) != 0 }
}

#[cfg(not(windows))]
fn key_is_down(_vk: i32) -> bool {
    false
}

fn main() {
    let vk = env::args()
        .nth(1)
        .and_then(|value| value.parse::<i32>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(0x12);

    let mut down = false;
    let stdout = io::stdout();
    let mut output = stdout.lock();

    loop {
        let pressed = key_is_down(vk);

        if pressed != down {
            down = pressed;
            let _ = writeln!(output, "{}", if down { "down" } else { "up" });
            let _ = output.flush();
        }

        thread::sleep(Duration::from_millis(20));
    }
}
