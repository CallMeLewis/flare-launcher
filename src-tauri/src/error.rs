use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum Error {
  #[error("Couldn't reach the server list: {0}")]
  Http(#[from] reqwest::Error),
  #[error("{0}")]
  Io(#[from] std::io::Error),
  #[error("{0}")]
  Message(String),
}

impl Error {
  pub fn msg(message: impl Into<String>) -> Self {
    Self::Message(message.into())
  }
}

// Commands return errors to the webview as plain strings.
impl Serialize for Error {
  fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
    serializer.serialize_str(&self.to_string())
  }
}

pub type Result<T> = std::result::Result<T, Error>;
