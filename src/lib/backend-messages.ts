import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { generateMessageId } from "@lingui/message-utils/generateMessageId";
import type { BackendText } from "./types";

/** Shows text from the backend in the interface's language. */
export function backendText({ message, values }: BackendText): string {
  return i18n._(generateMessageId(message), values, { message });
}

/**
 * Every message the backend sends with `text!`, so they're extracted for translation like the interface's own. The
 * backend sends the English template and its values, and `backendText` translates it. A test keeps this list in step
 * with the Rust code.
 */
export const BACKEND_MESSAGES = [
  msg({ message: "Couldn't find {host}. Check the address and try again." }),
  msg({ message: "Couldn't reach the server list: {error}" }),
  msg({ message: "Couldn't reach the update server." }),
  msg({ message: "DayZ couldn't be started: {error}" }),
  msg({ message: "DayZ wasn't found. Set the DayZ folder in Settings." }),
  msg({ message: "Enter the server's address, such as {example}." }),
  msg({ message: "Flare Launcher is in your app menu, but couldn't reopen: {error}" }),
  msg({ message: "Mods are already being downloaded." }),
  msg({ message: "Mods are being downloaded. Try again once they've finished." }),
  msg({ message: "No beta release has been published yet." }),
  msg({
    message:
      "No DayZ server answered at that address. Check it's running, or enter the server's query port instead of its game port.",
  }),
  msg({ message: "No password store was found on this computer ({error})." }),
  msg({ message: "No release has been published yet." }),
  msg({ message: "Only the AppImage can add itself to the app menu." }),
  msg({ message: "Steam couldn't be asked: {error}" }),
  msg({ message: "Steam couldn't be opened: {error}" }),
  msg({ message: "Steam couldn't be reached. Make sure Steam is running and you're signed in, then try again." }),
  msg({
    message:
      "Steam couldn't be reached. With the Flatpak version of Steam, the launcher may not be able to download mods: subscribe to them in the Steam Workshop instead, then try again.",
  }),
  msg({
    message:
      "Steam couldn't download {failures, plural, one {# mod} other {# mods}}. Check your connection and disk space, then try again.",
  }),
  msg({ message: "Steam couldn't unsubscribe you from {failures, plural, one {# mod} other {# mods}}. Try again." }),
  msg({ message: "Steam didn't answer in time. Make sure Steam is running and you're signed in, then try again." }),
  msg({ message: "Steam is out of date. Restart Steam so it can update, then try again." }),
  msg({ message: "Steam wasn't found on this computer. Install Steam, then try again." }),
  msg({ message: "That server is no longer in the list. Refresh and try again." }),
  msg({ message: "The download couldn't be started: {error}" }),
  msg({ message: "The download stopped unexpectedly. Try again." }),
  msg({ message: "The download stopped unexpectedly: {error}" }),
  msg({ message: "The folder couldn't be opened: {error}" }),
  msg({ message: "The installer already added Flare Launcher to the Start menu." }),
  msg({ message: "The password store couldn't be used: {error}" }),
  msg({ message: "The port after the colon has to be a number." }),
  msg({ message: "The server answered but didn't send its details. Try again in a moment." }),
  msg({ message: "The server list wasn't in the expected format: {error}" }),
  msg({ message: "The settings folder couldn't be found." }),
  msg({ message: "The update failed a security check, so it wasn't installed." }),
  msg({ message: "The update failed: {error}" }),
  msg({ message: "There is no downloaded update to install." }),
  msg({ message: "Unsubscribing stopped unexpectedly: {error}" }),
  msg({ message: "Use Add or remove programs to take Flare Launcher off this computer." }),
  msg({ message: "Your home folder couldn't be found." }),
  msg({ message: "{error}" }),
  msg({ message: "{missing, plural, one {# required mod is} other {# required mods are}} not installed yet." }),
];
