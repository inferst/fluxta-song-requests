import { Section, StatusBadge } from "@fluxta/sdk/ui";
import type { PluginStatus } from "song-requests-protocol";

import { CopyField } from "./CopyField";

/**
 * The Player Page's address, for an OBS Browser Source, and whether a page is
 * playing. The address holds the Player Key; it is shown here only to be
 * copied into OBS.
 */
export function PlayerPageSection({ status }: { status: PluginStatus }) {
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
      <CopyField
        label="Address"
        hint="Songs wait in the queue while no Player Page is open."
        value={status.playerUrl}
      />
    </Section>
  );
}
