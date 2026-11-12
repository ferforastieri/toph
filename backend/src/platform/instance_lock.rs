use std::fs::{File, OpenOptions};
use std::path::Path;

use crate::errors::{AppError, AppResult};

/// An exclusive lock on a data directory.
///
/// Toph recovers unfinished runs when it starts. A second process pointed at
/// the same directory must fail *before* that recovery, otherwise it marks the
/// first instance's live runs as interrupted and the chat shows a false
/// "server stopped" error. The OS releases the lock when the holder exits, so
/// a crash never leaves a stale lock behind.
pub struct InstanceLock {
    _file: File,
}

impl InstanceLock {
    pub fn acquire(data_dir: &Path) -> AppResult<Self> {
        std::fs::create_dir_all(data_dir)?;
        let path = data_dir.join(".toph.lock");
        let mut options = OpenOptions::new();
        options.write(true).create(true);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            // Windows has no flock: a file opened without sharing is the lock.
            options.share_mode(0);
        }
        let file = options.open(&path).map_err(|error| {
            if locked(&error) {
                busy()
            } else {
                AppError::Io(error)
            }
        })?;
        #[cfg(unix)]
        {
            use std::os::unix::io::AsRawFd;
            let result = unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) };
            if result != 0 {
                let error = std::io::Error::last_os_error();
                if error.kind() == std::io::ErrorKind::WouldBlock {
                    return Err(busy());
                }
                return Err(AppError::Io(error));
            }
        }
        Ok(Self { _file: file })
    }
}

fn busy() -> AppError {
    AppError::ServiceUnavailable(
        "Outra instância do Toph já está usando este diretório de dados.".into(),
    )
}

#[cfg(windows)]
fn locked(error: &std::io::Error) -> bool {
    // ERROR_SHARING_VIOLATION and ERROR_LOCK_VIOLATION.
    matches!(error.raw_os_error(), Some(32) | Some(33))
}

#[cfg(not(windows))]
fn locked(_error: &std::io::Error) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_second_instance_is_refused_and_the_lock_is_released_on_drop() {
        let dir = std::env::temp_dir().join(format!("toph-lock-{}", crate::crypto::new_id()));
        let first = InstanceLock::acquire(&dir).expect("first lock");
        let second = InstanceLock::acquire(&dir);
        assert!(
            second.is_err(),
            "a second instance must not acquire the lock"
        );
        drop(first);
        let third = InstanceLock::acquire(&dir);
        assert!(third.is_ok(), "dropping the holder releases the lock");
        drop(third);
        std::fs::remove_dir_all(&dir).ok();
    }
}
