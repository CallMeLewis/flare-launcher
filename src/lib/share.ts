import { t } from "@lingui/core/macro";
import { toast } from "sonner";
import { joinLink } from "./format";
import type { ServerRow } from "./types";

/** Copies a server's join link, saying what it does for whoever it's sent to. */
export async function copyJoinLink(server: Pick<ServerRow, "ip" | "gamePort">): Promise<void> {
  try {
    await navigator.clipboard.writeText(joinLink(server));
    toast.success(t`Join link copied`, {
      description: t`It opens this server in Flare Launcher, or offers the launcher to download.`,
    });
  } catch {
    toast.error(t`Couldn't copy the join link`);
  }
}
