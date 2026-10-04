//! Shows "Playing Flare Launcher" on the player's Discord profile, and whether they're in game, through the Discord
//! app's local connection on this computer. It never says which server: streamers and others may not want that shown.
//! Discord removes the status itself when the launcher closes.

use std::io;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::{Value, json};
use sysinfo::System;
use tauri::State;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::sync::{mpsc, watch};
use tokio::task::JoinHandle;

use crate::launch;

/// The Flare Launcher application on Discord, whose name and logo the status shows. Not a secret.
const CLIENT_ID: &str = "1556446096736133201";
/// The logo's name among the application's Rich Presence art assets.
const LOGO_ASSET: &str = "logo";
/// How often to check whether the game is running.
const POLL_INTERVAL: Duration = Duration::from_secs(5);
/// How long to wait before looking for Discord again when it isn't running.
const RETRY_INTERVAL: Duration = Duration::from_secs(15);
/// Nothing Discord sends comes close to this; anything bigger means the connection is garbled.
const MAX_FRAME: usize = 64 * 1024;

const OP_HANDSHAKE: u32 = 0;
const OP_FRAME: u32 = 1;
const OP_CLOSE: u32 = 2;
const OP_PING: u32 = 3;
const OP_PONG: u32 = 4;

/// Whether the status is shown, as chosen in Settings. Off until the interface passes the setting on.
pub struct Presence(watch::Sender<bool>);

impl Presence {
  pub fn start() -> Self {
    let (enabled, receiver) = watch::channel(false);
    tauri::async_runtime::spawn(run(receiver));
    Self(enabled)
  }
}

#[tauri::command]
pub fn set_discord_presence(presence: State<'_, Presence>, enabled: bool) {
  presence.0.send_replace(enabled);
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Status {
  Browsing,
  /// In game since this time, in milliseconds since the Unix epoch.
  InGame {
    since: u64,
  },
}

fn activity(status: Status) -> Value {
  let mut activity = json!({
    "type": 0,
    "assets": { "large_image": LOGO_ASSET, "large_text": "Flare Launcher" },
  });
  match status {
    Status::Browsing => activity["details"] = "Browsing servers".into(),
    Status::InGame { since } => {
      activity["details"] = "In game".into();
      activity["timestamps"] = json!({ "start": since });
    }
  }
  activity
}

/// Follows whether the game is running, and since when. Kept across reconnections, so a Discord restart mid-game
/// doesn't reset the timer.
#[derive(Default)]
struct GameWatch {
  system: Option<System>,
  since: Option<u64>,
}

impl GameWatch {
  async fn status(&mut self) -> Status {
    let mut system = self.system.take().unwrap_or_default();
    let running = match tokio::task::spawn_blocking(move || {
      let running = launch::game_running(&mut system);
      (system, running)
    })
    .await
    {
      Ok((system, running)) => {
        self.system = Some(system);
        running
      }
      Err(_) => false,
    };
    if !running {
      self.since = None;
      return Status::Browsing;
    }
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |elapsed| elapsed.as_millis() as u64);
    Status::InGame { since: *self.since.get_or_insert(now) }
  }
}

async fn run(mut enabled: watch::Receiver<bool>) {
  let mut game = GameWatch::default();
  loop {
    if !*enabled.borrow_and_update() {
      if enabled.changed().await.is_err() {
        return;
      }
      continue;
    }
    if let Some(stream) = connect().await
      && let Err(error) = show(stream, &mut enabled, &mut game).await
    {
      log::info!("Discord status stopped: {error}");
    }
    // Discord isn't running, or has closed. Try again later, or as soon as the setting changes.
    tokio::select! {
      _ = tokio::time::sleep(RETRY_INTERVAL) => {}
      changed = enabled.changed() => if changed.is_err() { return },
    }
  }
}

/// Keeps the status up to date until Discord goes away or the setting is turned off. Returning closes the connection,
/// and Discord then removes the status.
async fn show(
  stream: impl AsyncRead + AsyncWrite + Send + 'static,
  enabled: &mut watch::Receiver<bool>,
  game: &mut GameWatch,
) -> io::Result<()> {
  let (mut reader, mut writer) = tokio::io::split(stream);
  write_frame(&mut writer, OP_HANDSHAKE, &json!({ "v": 1, "client_id": CLIENT_ID })).await?;
  let (op, reply) = read_frame(&mut reader).await?;
  if op != OP_FRAME {
    return Err(io::Error::other(format!("Discord refused the connection: {reply}")));
  }

  // Reads everything Discord sends from here on, so its replies never back up, and passes on its pings. Ends when
  // Discord closes the connection.
  let (pings, mut incoming) = mpsc::channel(4);
  let _reading = AbortOnDrop(tokio::spawn(async move {
    while let Ok((op, payload)) = read_frame(&mut reader).await {
      match op {
        OP_PING if pings.send(payload).await.is_err() => break,
        OP_CLOSE => break,
        _ => {}
      }
    }
  }));

  let mut shown = None;
  let mut nonce = 0u64;
  let mut ticks = tokio::time::interval(POLL_INTERVAL);
  loop {
    tokio::select! {
      _ = ticks.tick() => {
        let status = game.status().await;
        if shown != Some(status) {
          nonce += 1;
          let command = json!({
            "cmd": "SET_ACTIVITY",
            "args": { "pid": std::process::id(), "activity": activity(status) },
            "nonce": nonce.to_string(),
          });
          write_frame(&mut writer, OP_FRAME, &command).await?;
          shown = Some(status);
        }
      }
      ping = incoming.recv() => match ping {
        Some(payload) => write_frame(&mut writer, OP_PONG, &payload).await?,
        None => return Ok(()),
      },
      changed = enabled.changed() => if changed.is_err() || !*enabled.borrow() { return Ok(()) },
    }
  }
}

/// Stops the reading task with the connection, so its half of the connection doesn't keep it open.
struct AbortOnDrop(JoinHandle<()>);

impl Drop for AbortOnDrop {
  fn drop(&mut self) {
    self.0.abort();
  }
}

#[cfg(windows)]
async fn connect() -> Option<tokio::net::windows::named_pipe::NamedPipeClient> {
  use tokio::net::windows::named_pipe::ClientOptions;
  // Discord takes the first free number, so a second copy (such as Canary) has the next.
  (0..10).find_map(|n| ClientOptions::new().open(format!(r"\\.\pipe\discord-ipc-{n}")).ok())
}

#[cfg(not(windows))]
async fn connect() -> Option<tokio::net::UnixStream> {
  for path in socket_paths() {
    if let Ok(stream) = tokio::net::UnixStream::connect(&path).await {
      return Some(stream);
    }
  }
  None
}

/// Where Discord may have put its socket: in the runtime or temporary folder, or inside the folder the Flatpak or
/// Snap package of it can write to.
#[cfg(not(windows))]
fn socket_paths() -> Vec<std::path::PathBuf> {
  use std::path::PathBuf;
  const PACKAGE_DIRS: [&str; 6] = [
    "",
    "app/com.discordapp.Discord",
    "app/com.discordapp.DiscordCanary",
    ".flatpak/dev.vencord.Vesktop/xdg-run",
    "snap.discord",
    "snap.discord-canary",
  ];
  let mut bases: Vec<PathBuf> =
    ["XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP"].into_iter().filter_map(std::env::var_os).map(PathBuf::from).collect();
  bases.push(PathBuf::from("/tmp"));
  bases.dedup();
  bases
    .iter()
    .flat_map(|base| PACKAGE_DIRS.iter().map(move |dir| base.join(dir)))
    .flat_map(|dir| (0..10).map(move |n| dir.join(format!("discord-ipc-{n}"))))
    .collect()
}

/// A frame is its opcode and the payload's length, both little-endian, then the payload as JSON.
async fn write_frame(writer: &mut (impl AsyncWrite + Unpin), op: u32, payload: &Value) -> io::Result<()> {
  let body = serde_json::to_vec(payload)?;
  let mut frame = Vec::with_capacity(8 + body.len());
  frame.extend(op.to_le_bytes());
  frame.extend((body.len() as u32).to_le_bytes());
  frame.extend(body);
  writer.write_all(&frame).await?;
  writer.flush().await
}

async fn read_frame(reader: &mut (impl AsyncRead + Unpin)) -> io::Result<(u32, Value)> {
  let mut header = [0u8; 8];
  reader.read_exact(&mut header).await?;
  let op = u32::from_le_bytes(header[..4].try_into().unwrap());
  let len = u32::from_le_bytes(header[4..].try_into().unwrap()) as usize;
  if len > MAX_FRAME {
    return Err(io::Error::new(io::ErrorKind::InvalidData, format!("Discord sent a {len} byte frame")));
  }
  let mut body = vec![0; len];
  reader.read_exact(&mut body).await?;
  Ok((op, serde_json::from_slice(&body)?))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[tokio::test]
  async fn frames_survive_a_round_trip() {
    let (mut ours, mut theirs) = tokio::io::duplex(1024);
    let payload = json!({ "v": 1, "client_id": CLIENT_ID });
    write_frame(&mut ours, OP_HANDSHAKE, &payload).await.unwrap();
    assert_eq!(read_frame(&mut theirs).await.unwrap(), (OP_HANDSHAKE, payload));
  }

  #[tokio::test]
  async fn refuses_an_oversized_frame() {
    let (mut ours, mut theirs) = tokio::io::duplex(64);
    let mut header = OP_FRAME.to_le_bytes().to_vec();
    header.extend((MAX_FRAME as u32 + 1).to_le_bytes());
    ours.write_all(&header).await.unwrap();
    assert_eq!(read_frame(&mut theirs).await.unwrap_err().kind(), io::ErrorKind::InvalidData);
  }

  #[test]
  fn shows_the_logo_and_what_the_player_is_doing() {
    let browsing = activity(Status::Browsing);
    assert_eq!(browsing["details"], "Browsing servers");
    assert_eq!(browsing["assets"]["large_image"], LOGO_ASSET);
    assert!(browsing.get("timestamps").is_none());

    let playing = activity(Status::InGame { since: 1_700_000_000_000 });
    assert_eq!(playing["details"], "In game");
    assert_eq!(playing["timestamps"]["start"], 1_700_000_000_000u64);
    // Nothing about the server: no state line, party or buttons.
    assert!(playing.get("state").is_none() && playing.get("party").is_none() && playing.get("buttons").is_none());
  }

  #[cfg(not(windows))]
  #[test]
  fn looks_for_the_flatpak_and_snap_sockets_too() {
    let paths = socket_paths();
    let has = |suffix: &str| paths.iter().any(|path| path.ends_with(suffix));
    assert!(has("discord-ipc-0"));
    assert!(has("app/com.discordapp.Discord/discord-ipc-0"));
    assert!(has("snap.discord/discord-ipc-9"));
  }

  /// Shows each status on the profile for a few seconds. Run with `cargo test -- --ignored` while Discord is open.
  #[tokio::test]
  #[ignore = "needs Discord running"]
  async fn discord_accepts_the_status() {
    let stream = connect().await.expect("Discord isn't running");
    let (mut reader, mut writer) = tokio::io::split(stream);
    write_frame(&mut writer, OP_HANDSHAKE, &json!({ "v": 1, "client_id": CLIENT_ID })).await.unwrap();
    let (op, ready) = read_frame(&mut reader).await.unwrap();
    assert_eq!(op, OP_FRAME, "{ready}");
    assert_eq!(ready["evt"], "READY", "{ready}");

    let since = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;
    for (nonce, status) in [Status::Browsing, Status::InGame { since }].into_iter().enumerate() {
      let command = json!({
        "cmd": "SET_ACTIVITY",
        "args": { "pid": std::process::id(), "activity": activity(status) },
        "nonce": nonce.to_string(),
      });
      write_frame(&mut writer, OP_FRAME, &command).await.unwrap();
      let (_, reply) = read_frame(&mut reader).await.unwrap();
      assert_ne!(reply["evt"], "ERROR", "{reply}");
      println!("{status:?}: {reply}");
      tokio::time::sleep(Duration::from_secs(10)).await;
    }
  }
}
