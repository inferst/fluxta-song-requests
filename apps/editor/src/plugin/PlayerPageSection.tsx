import { Button, Field, Input, Section, StatusBadge } from "@fluxta/sdk/ui";
import { useRef, useState } from "react";
import type { PluginStatus } from "song-requests-protocol";

/**
 * The Player Page's address, for an OBS Browser Source, and whether a page is
 * playing. The address holds the Player Key; it is shown here only to be
 * copied into OBS.
 */
export function PlayerPageSection({ status }: { status: PluginStatus }) {
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(status.playerUrl);
    } catch {
      // The editor's sandboxed frame may not be granted the clipboard; a
      // selected field copies the old way.
      input.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Section
      title="Player Page"
      description="Add this address to OBS as a Browser Source on this computer, and keep the source in view on stream: YouTube does not allow a player that is not shown."
    >
      <div className="flex items-center gap-2">
        {status.playerConnected ? (
          <StatusBadge tone="ok">Playing in a Player Page</StatusBadge>
        ) : (
          <StatusBadge tone="idle">No Player Page open</StatusBadge>
        )}
      </div>
      <Field
        label="Address"
        hint="Songs wait in the queue while no Player Page is open."
      >
        <div className="flex gap-2">
          <Input
            ref={input}
            readOnly
            value={status.playerUrl}
            onFocus={(event) => event.currentTarget.select()}
            aria-label="Player Page address"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={!status.playerUrl}
            onClick={copy}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </Field>
    </Section>
  );
}
