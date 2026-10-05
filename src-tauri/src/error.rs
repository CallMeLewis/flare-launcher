use std::collections::BTreeMap;
use std::fmt;

use serde::{Deserialize, Serialize, Serializer};
use serde_json::Value;

/// Text for the player, sent to the interface as its English template and values so the interface can show it in the
/// player's language. Placeholders are written `{name}`, and counts as ICU plurals. Every template is listed for
/// translation in `src/lib/backend-messages.ts`, which a test there keeps in step with `text!` calls.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Text {
  pub message: String,
  pub values: BTreeMap<String, Value>,
}

/// A value for a placeholder. Counts stay numbers, so plurals can pick the right form.
pub fn value(value: impl ToString) -> Value {
  let text = value.to_string();
  text.parse::<u64>().map_or(Value::String(text), Value::from)
}

/// Builds a [`Text`]: `text!("Couldn't find {host}.", host = host)`.
#[macro_export]
macro_rules! text {
  ($message:literal $(, $name:ident = $value:expr)* $(,)?) => {
    $crate::error::Text {
      message: $message.to_string(),
      values: [$((stringify!($name).to_string(), $crate::error::value(&$value))),*].into_iter().collect(),
    }
  };
}

/// English with the values filled in, for logs and tests. Plurals are left as written.
impl fmt::Display for Text {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    let mut text = self.message.clone();
    for (name, value) in &self.values {
      let value = value.as_str().map_or_else(|| value.to_string(), String::from);
      text = text.replace(&format!("{{{name}}}"), &value);
    }
    f.write_str(&text)
  }
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
  #[error("Couldn't reach the server list: {0}")]
  Http(#[from] reqwest::Error),
  #[error("{0}")]
  Io(#[from] std::io::Error),
  /// Text for the player, translated by the interface.
  #[error("{0}")]
  Text(Text),
  /// Text from elsewhere, such as the system, shown as it is.
  #[error("{0}")]
  Message(String),
}

impl From<Text> for Error {
  fn from(text: Text) -> Self {
    Self::Text(text)
  }
}

impl Error {
  /// An error whose text comes from elsewhere and isn't translated. Write the launcher's own with `text!`.
  pub fn msg(message: impl Into<String>) -> Self {
    Self::Message(message.into())
  }
}

// Commands return the launcher's own text as a template for the interface to translate, and anything else as a string.
impl Serialize for Error {
  fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
    match self {
      Self::Text(text) => text.serialize(serializer),
      Self::Http(error) => crate::text!("Couldn't reach the server list: {error}", error = error).serialize(serializer),
      other => serializer.serialize_str(&other.to_string()),
    }
  }
}

pub type Result<T> = std::result::Result<T, Error>;

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn sends_the_template_and_its_values() {
    let error = Error::from(crate::text!("Couldn't find {host}.", host = "example.com"));
    assert_eq!(
      serde_json::to_value(&error).unwrap(),
      serde_json::json!({ "message": "Couldn't find {host}.", "values": { "host": "example.com" } })
    );
    assert_eq!(error.to_string(), "Couldn't find example.com.");
  }

  #[test]
  fn keeps_counts_as_numbers() {
    let text = crate::text!("{count, plural, one {# mod} other {# mods}}", count = 3usize);
    assert_eq!(text.values["count"], serde_json::json!(3));
  }

  #[test]
  fn sends_other_errors_as_they_are() {
    assert_eq!(serde_json::to_value(Error::msg("Access is denied.")).unwrap(), serde_json::json!("Access is denied."));
  }
}
