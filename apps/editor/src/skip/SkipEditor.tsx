import { EditorPage, Section } from "@fluxta/sdk/ui";

export function SkipEditor() {
  return (
    <EditorPage>
      <Section title="Skip">
        <p>
          Ends the Current Song and starts the next one, unless playback is
          paused. Later steps can read the skipped Song's title. With no Current
          Song, nothing changes.
        </p>
      </Section>
    </EditorPage>
  );
}
