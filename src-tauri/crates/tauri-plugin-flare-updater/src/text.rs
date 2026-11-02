use std::collections::BTreeMap;
use std::fmt;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Text for the user, sent to the window as its English template and values, so an app with translations can show it
/// in the user's language and the others can fill the values in. Placeholders are written `{name}`. It has the same
/// shape as Flare Launcher's own backend text, which its window already translates.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Text {
  pub message: String,
  pub values: BTreeMap<String, Value>,
}

impl Text {
  pub(crate) fn new(message: &str) -> Self {
    Self { message: message.into(), values: BTreeMap::new() }
  }

  /// Fills in the `{name}` placeholder. Counts stay numbers, so plurals can pick the right form.
  pub(crate) fn with(mut self, name: &str, value: impl ToString) -> Self {
    let text = value.to_string();
    let value = text.parse::<u64>().map_or(Value::String(text), Value::from);
    self.values.insert(name.into(), value);
    self
  }
}

/// English with the values filled in, for logs and tests.
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

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn fills_in_the_values() {
    let text = Text::new("The update failed: {error}").with("error", "disk full");
    assert_eq!(text.to_string(), "The update failed: disk full");
    assert_eq!(
      serde_json::to_value(&text).unwrap(),
      serde_json::json!({ "message": "The update failed: {error}", "values": { "error": "disk full" } })
    );
    assert_eq!(Text::new("{n} left").with("n", 3).values["n"], serde_json::json!(3));
  }
}
