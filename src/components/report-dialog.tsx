import { useEffect, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { backend, errorMessage } from "@/lib/backend";
import { closeReport, useReportRequest } from "@/lib/report";
import type { Report } from "@/lib/types";

/** The longest note, matching what the backend sends. */
const MAX_NOTE = 1000;

/**
 * Sends a report of a failure to the launcher's developer, once the player has seen exactly what it holds. Opened
 * with `openReport` from wherever the failure shows.
 */
export function ReportDialog({ dayzDir }: { dayzDir: string }) {
  const { t } = useLingui();
  const request = useReportRequest();
  const [report, setReport] = useState<Report | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setReport(null);
    setNote("");
    setError("");
    if (!request) return;
    let cancelled = false;
    backend
      .prepareReport(request.problem, request.error, dayzDir)
      .then((prepared) => !cancelled && setReport(prepared))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
    // Built once per failure: the folder changing meanwhile doesn't make it a different report.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!report || sending) return;
    setSending(true);
    setError("");
    try {
      await backend.sendReport(report, note);
      closeReport();
      toast.success(t`Report sent`, { description: t`Thank you. It helps fix problems like this one.` });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && !sending && closeReport()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={(event) => void send(event)} className="flex min-w-0 flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="text-base">
              <Trans>Send a report</Trans>
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              <Trans>
                Sends the details below to the launcher's developer to help fix the problem. Server names and addresses
                are left out.
              </Trans>
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="report-note" className="text-xs text-muted-foreground">
              <Trans>What were you doing? (optional)</Trans>
            </Label>
            <Textarea
              id="report-note"
              value={note}
              maxLength={MAX_NOTE}
              onChange={(event) => setNote(event.target.value)}
              aria-describedby="report-note-hint"
              className="h-20 resize-none"
            />
            <p id="report-note-hint" className="text-xs text-muted-foreground">
              <Trans>Don't include passwords or personal details.</Trans>
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-xs text-muted-foreground" id="report-details-label">
              <Trans>Details to send</Trans>
            </p>
            {report ? (
              <pre
                className="data selectable max-h-48 overflow-auto rounded-md border bg-card p-3 text-[11px] break-words whitespace-pre-wrap"
                aria-labelledby="report-details-label"
                tabIndex={0}
              >
                {JSON.stringify(report, null, 2)}
              </pre>
            ) : (
              !error && <Skeleton className="h-48 w-full" />
            )}
          </div>

          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={sending} onClick={closeReport}>
              <Trans>Cancel</Trans>
            </Button>
            <Button type="submit" disabled={!report || sending}>
              {sending ? (
                <>
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
                  <Trans>Sending…</Trans>
                </>
              ) : (
                <Trans>Send report</Trans>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
