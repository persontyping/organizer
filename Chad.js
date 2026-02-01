
/************ AI drafting for news/politics ************/
function buildIGDraftWithAI_(type, title, author, link, notes, options) {
  const opts = options || {};
  const fast = !!opts.fast;

  const prompt =
`You write Instagram captions for a Western Australia local-left audience.
Tone: calm, neighbourly, practical. Avoid US culture-war framing. No jargon.
Keep it concise and actionable.

Task:
Write:
1) a caption (max ${fast ? 80 : 180} words)
2) 8-15 relevant hashtags (WA-appropriate)
3) a 1-line "story opener" (very short)

Context:
Type: ${type}
Title: ${title}
Author/Brand: ${author || "(none)"}
Link: ${link || "(none)"}
Notes: ${notes || "(none)"}

Return ONLY valid JSON:
{"caption":"...","hashtags":["#..."],"story_opener":"..."}`;

  const raw = callOpenAI(prompt);

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    // fallback to template if AI returns non-JSON
    return buildIGDraft_(type, title, author, link, notes);
  }

  let caption = String(data.caption || "").trim();
  const hashtags = (data.hashtags || []).map(String);
  const storyOpener = String(data.story_opener || "").trim();

  if (storyOpener) caption = `${caption}\n\nStory opener: ${storyOpener}`;
  if (link) caption += `\n\n🔗 Link saved.`;

  return {
    caption,
    hashtags: unique_(hashtags).slice(0, 20)
  };
}


/************ Non-AI parsing and relevance checks ************/
function buildIGDraft_(type, title, author, link, notes) {
  const t = (type || "Thing").toLowerCase();

  let caption = "";
  let hashtags = [];

  if (t.includes("book")) {
    // ✅ keep your existing book formatting
    caption = [
      `📚 ${title}${author ? ` — ${author}` : ""}`,
      ``,
      `Saved for later.`,
      notes ? `\nNotes: ${notes}` : ""
    ].join("\n").trim();

    hashtags = [
      "#bookstagram",
      "#readinglist",
      "#toread",
      "#books",
      "#bookrecommendations"
    ];

  } else if (t.includes("polit")) {
    // 🟥 new political default
    caption = [
      `🟥 ${title}`,
      ``,
      `A quick local take:`,
      notes ? `\n• ${notes}` : `\n• (Add a one-liner on why this matters locally)`,
      ``,
      `If this affects you, I’d like to hear your experience.`,
    ].join("\n").trim();

    hashtags = [
      "#perth",
      "#westernaustralia",
      "#community",
      "#costofliving",
      "#housing",
      "#workersrights"
    ];

  } else {
    // ✅ keep your existing generic formatting
    caption = [
      `✨ ${title}`,
      ``,
      `Saved for later.`,
      notes ? `\nNotes: ${notes}` : ""
    ].join("\n").trim();

    hashtags = ["#savethelink", "#ideas", "#inspo"];
  }

  if (link) caption += `\n\n🔗 Link saved.`;

  return {
    caption,
    hashtags: unique_(hashtags).slice(0, 20)
  };
}



/************ PARSING ************/
function parseOverrides_(body) {
  const lines = String(body || "").split("\n");
  const out = { type: "", title: "", author: "", notes: "" };

  for (const line of lines) {
    const mType = line.match(/^\s*Type:\s*(.+)\s*$/i);
    const mTitle = line.match(/^\s*Title:\s*(.+)\s*$/i);
    const mAuthor = line.match(/^\s*Author:\s*(.+)\s*$/i);
    const mNotes = line.match(/^\s*Notes:\s*(.+)\s*$/i);

    if (mType) out.type = mType[1].trim();
    if (mTitle) out.title = mTitle[1].trim();
    if (mAuthor) out.author = mAuthor[1].trim();
    if (mNotes) out.notes = mNotes[1].trim();
  }

  return out;
}

