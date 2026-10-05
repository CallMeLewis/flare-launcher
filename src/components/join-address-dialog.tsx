import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { backend, errorMessage } from "@/lib/backend";
import type { ServerRow } from "@/lib/types";

/** Finds a server from its address, for servers that aren't in the server list or on the local network. */
export function JoinAddressDialog({
  open,
  onOpenChange,
  onFound,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFound: (server: ServerRow) => void;
}) {
  const { t } = useLingui();
  const [address, setAddress] = useState("");
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState("");

  const find = async (event: React.FormEvent) => {
    event.preventDefault();
    if (finding || !address.trim()) return;
    setFinding(true);
    setError("");
    try {
      const server = await backend.findServer(address);
      setAddress("");
      onFound(server);
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setFinding(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(event) => void find(event)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="text-base">
              <Trans>Add server</Trans>
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              <Trans>
                For a server that isn't in the list. Enter its address and the launcher finds it and shows it on the
                right, ready to join.
              </Trans>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="server-address" className="text-xs text-muted-foreground">
              <Trans>Server address</Trans>
            </Label>
            <Input
              id="server-address"
              autoComplete="off"
              spellCheck={false}
              placeholder="192.168.1.20:2302"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              aria-invalid={error !== "" || undefined}
              aria-describedby="server-address-hint"
              className="data h-8"
              autoFocus
            />
            <p
              id="server-address-hint"
              role={error ? "alert" : undefined}
              className={error ? "text-xs text-danger" : "text-xs text-muted-foreground"}
            >
              {error || t`The address and the port you join on. Leave the port out to try the usual ones.`}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button type="submit" disabled={finding || !address.trim()}>
              {finding ? (
                <>
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
                  <Trans>Finding…</Trans>
                </>
              ) : (
                <Trans>Find server</Trans>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
