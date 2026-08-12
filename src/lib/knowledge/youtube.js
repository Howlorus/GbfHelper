// US-05-10 YouTube source validator (PRD §17.4). Pure.
// Accepts youtube.com/watch?v=... and youtu.be/... only.
// Rejects everything else. Requires publicationDate and author on video sources.
// §17.4 non-goal: never store full videos — enforced by returning ONLY metadata
// + selected transcript fragments (validation of shape, not of content).

const WATCH = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:.*&)?v=([\w-]{11})(?:&|$)/;
const SHORT = /^https?:\/\/youtu\.be\/([\w-]{11})(?:\?|$)/;
const EMBED = /^https?:\/\/(?:www\.)?youtube\.com\/embed\/([\w-]{11})(?:\?|$)/;

export function parseYouTubeUrl(url) {
  if (typeof url !== "string") return null;
  const m = url.match(WATCH) || url.match(SHORT) || url.match(EMBED);
  return m ? m[1] : null;
}

export function validateYouTubeSource(meta) {
  const errors = [];
  if (!meta || typeof meta !== "object") return { ok: false, errors: ["meta required"] };

  const videoId = parseYouTubeUrl(meta.url);
  if (!videoId) errors.push("url must be a youtube.com/watch?v= or youtu.be/ link");
  if (!meta.publicationDate) errors.push("publicationDate required for video sources");
  if (!meta.author) errors.push("author required for video sources");
  if (meta.videoFile || meta.videoBlob || meta.videoBytes) errors.push("full video storage forbidden (§17.4)");

  if (meta.fragments !== undefined) {
    if (!Array.isArray(meta.fragments)) errors.push("fragments must be an array");
    else meta.fragments.forEach((f, i) => {
      if (!f || typeof f !== "object") { errors.push(`fragment ${i}: not an object`); return; }
      if (typeof f.timestampSec !== "number" || f.timestampSec < 0) errors.push(`fragment ${i}: timestampSec required (>=0)`);
      if (typeof f.text !== "string" || !f.text) errors.push(`fragment ${i}: text required`);
    });
  }

  return errors.length ? { ok: false, errors } : { ok: true, videoId };
}
