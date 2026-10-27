import { EditorPage, TemplateField, useActionSettings } from "@fluxta/sdk/ui";
import type { RequestSongSettings } from "song-requests-protocol";

export function RequestSongEditor() {
  const { values, set } = useActionSettings<RequestSongSettings>({
    request: "",
  });

  return (
    <EditorPage>
      <TemplateField
        label="Request"
        value={values.request ?? ""}
        onChange={set("request")}
        placeholder="https://youtu.be/…"
        hint="A YouTube link — usually what a viewer typed after the command. Later steps can read whether it was accepted, the Song's title and its place in the queue."
      />
    </EditorPage>
  );
}
