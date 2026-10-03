fn main() {
  // Linux looks for libsteam_api.so beside the binary, where Tauri copies resources in development, and where its
  // bundles keep them, which is how the AppImage tooling finds the library to pack. Windows finds steam_api64.dll
  // beside the exe without help.
  if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux") {
    println!("cargo:rustc-link-arg-bins=-Wl,-rpath,$ORIGIN:$ORIGIN/../lib/Flare Launcher");
  }
  tauri_build::build()
}
