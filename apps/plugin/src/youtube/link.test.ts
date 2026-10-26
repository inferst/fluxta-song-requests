import { describe, expect, it } from "vitest";

import { videoIdOf } from "./link";

const ID = "dQw4w9WgXcQ";

describe("a YouTube link in a Request", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&t=42s&list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG`,
    `https://youtube.com/watch?feature=share&v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}&si=abc`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=Xyz123&t=10`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `youtube.com/watch?v=${ID}`,
    `  https://youtu.be/${ID}  `,
  ])("finds the video in %s", (request) => {
    expect(videoIdOf(request)).toBe(ID);
  });

  it.each([
    "never gonna give you up",
    `rick astley https://youtu.be/${ID}`,
    `https://example.com/watch?v=${ID}`,
    "https://www.youtube.com/watch?v=tooShort",
    "https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG",
    "https://youtu.be/",
    "",
  ])("finds no video in %j", (request) => {
    expect(videoIdOf(request)).toBeUndefined();
  });
});
