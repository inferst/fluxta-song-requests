import { EditorPage, PluginEditorLayout } from "@fluxta/sdk/ui";

import { PlayerPageSection } from "./PlayerPageSection";
import { SettingsSection } from "./SettingsSection";
import { usePluginStatus } from "./usePluginStatus";

export function PluginEditorApp() {
  const { status, sidecarSilent } = usePluginStatus();

  if (!status) {
    return (
      <EditorPage>
        {sidecarSilent ? (
          <p className="text-muted-foreground text-xs/relaxed">
            The plugin process is not answering. Fluxta does not restart a
            crashed process — start the plugin again from the settings list, and
            check its log if it keeps failing.
          </p>
        ) : null}
      </EditorPage>
    );
  }

  return (
    <PluginEditorLayout
      title="Song Requests"
      sections={[
        ...(status.stateFile.recovered
          ? [
              {
                id: "state-file",
                label: "Song Queue",
                tone: "error" as const,
                content: (
                  <p className="text-muted-foreground text-xs/relaxed">
                    The saved Song Queue could not be read — the file was
                    damaged. It was moved aside, next to where it lived, and the
                    plugin started with an empty Song Queue.
                  </p>
                ),
              },
            ]
          : []),
        {
          id: "player",
          label: "Player",
          tone: status.playerConnected ? "ok" : "idle",
          content: <PlayerPageSection status={status} />,
        },
        {
          id: "settings",
          label: "Settings",
          tone: status.apiKey.state === "refused" ? "error" : undefined,
          content: <SettingsSection status={status} />,
        },
      ]}
    />
  );
}
