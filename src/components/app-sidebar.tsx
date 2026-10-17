import { Clock, List, Network, Package, Star, type LucideIcon } from "lucide-react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { AppSidebar as FlareSidebar, type SidebarItem } from "@flare/ui";

export type View = "all" | "favourites" | "recent" | "lan" | "mods";

type Props = {
  view: View;
  onViewChange: (view: View) => void;
  /** `null` for a list whose size isn't known yet. */
  counts: Record<View, number | null>;
  onOpenSettings: () => void;
};

type Item = { view: View; label: MessageDescriptor; icon: LucideIcon };

const SERVER_LISTS: Item[] = [
  { view: "all", label: msg`All servers`, icon: List },
  { view: "favourites", label: msg`Favourites`, icon: Star },
  { view: "recent", label: msg`Recent`, icon: Clock },
  { view: "lan", label: msg`LAN`, icon: Network },
];
const LIBRARY: Item[] = [{ view: "mods", label: msg`Mods`, icon: Package }];

/** The Flare apps' shared sidebar, with the launcher's server lists and library, each with its count. */
export function AppSidebar({ view, onViewChange, counts, onOpenSettings }: Props) {
  const { i18n, t } = useLingui();
  const items = (list: Item[]): SidebarItem<View>[] =>
    list.map(({ view: id, label, icon }) => {
      const count = counts[id];
      return { id, label: i18n._(label), icon, ...(count !== null && { badge: i18n.number(count) }) };
    });
  return (
    <FlareSidebar
      sections={[
        { label: t`Server lists`, items: items(SERVER_LISTS) },
        { label: t`Your library`, items: items(LIBRARY) },
      ]}
      active={view}
      onSelect={onViewChange}
      onOpenSettings={onOpenSettings}
    />
  );
}
