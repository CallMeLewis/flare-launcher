import { i18n } from "@lingui/core";

// Tests run in British English, the language the interface is written in. Without a catalogue, each message shows as
// written in the code.
i18n.loadAndActivate({ locale: "en-GB", messages: {} });
