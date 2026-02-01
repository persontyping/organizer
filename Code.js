/************ CONFIG ************/

const CFG = {
  sheetId: "1mI2yqnJDoW5P2gew9-UY0GFDtJ5O0lWN_-3UgZg7qak",
  sheetTab: "MEM List",
  outputRootFolderId: "1tueGbexvt4X6W8AEX_3LPpl3EcyoK8WY",

  // slidesPackTemplateId: "1YlWjusS2iR-EwB0_oTxRFeC6ZtUuK5setxwK7iOKKYw",
  slidesPackTemplateId: "1LaP06p5jIbvRJlaGLj8rUQoJ8R620zgDUO6Y3azTOHo",
  docTemplateId: "1Ox9GvFCQatC7sL7airoWFcADE_mU375a_pHH0ANF3l8",

  stateKey: "DRAFTS_SEEN_URL_HASHES_V1",

  inboxLabel: "MEM",
  processedLabel: "MEM/Closed",

  lookbackHours: 720,
  maxThreadsPerRun: 30,
  notifyEmail: Session.getActiveUser().getEmail(),
  debug: true,
};

const SHEET_HEADERS = [
  "AddedAt",
  "Type",
  "Title",
  "AuthorOrBrand",
  "Link",
  "Notes",
  "IGCaption",
  "IGHashtags",
  "IGStatus",
  "IGDraftedAt",
  "SourceEmailSubject",
  "PackFolder"
];


/************ MAIN ************/
function draftScanInbox() {
  log_(CFG, "Draft scan started", { label: CFG.inboxLabel });

  const query =
    `label:"${CFG.inboxLabel}" -label:"${CFG.processedLabel}" newer_than:${CFG.lookbackHours}h`;

  const threads = GmailApp.search(query, 0, CFG.maxThreadsPerRun);
  log_(CFG, "Threads found", { count: threads.length });
  if (!threads.length) return;

  const ss = SpreadsheetApp.openById(CFG.sheetId);
  const sheet = ss.getSheetByName(CFG.sheetTab);
  if (!sheet) throw new Error(`Tab "${CFG.sheetTab}" not found.`);

  // ✅ make sure headers exist
  ensureHeaders_(sheet, SHEET_HEADERS);

  const seen = loadSeen_(CFG.stateKey);

  for (const thread of threads) {
    const msg = thread.getMessages().slice(-1)[0];

    const subjectRaw = (msg.getSubject() || "").trim();
    const flags = parseSubjectFlags_(subjectRaw);     // helper exists in Helpers.gs
    const subject = stripSubjectFlags_(subjectRaw);   // helper exists in Helpers.gs

    const body = (msg.getPlainBody() || "").trim();
    const bodyCore = body.split(/\n--\s*\n/i)[0].trim();

    const urls = extractUrls_(bodyCore).filter(u => !isJunkUrl_(u));
    const primaryUrl = urls[0] || "";

    const dedupeKey = primaryUrl ? hash_(primaryUrl) : hash_(subject + "\n" + bodyCore);

    if (seen[dedupeKey]) {
      log_(CFG, "Duplicate thread skipped", { subject: subjectRaw });

      // mark processed
      markThreadDoneByName_(thread, CFG.inboxLabel, CFG.processedLabel);
      continue;
    }

    /**************************
     * Topic Flagging + Parsing
     **************************/
    const overrides = parseOverrides_(bodyCore); // { type, title, author, notes }
    const inferredType = inferType_(subject, bodyCore, primaryUrl);

    // Subject flag overrides (unless body has Type:)
    let flaggedType = "";
    if (flags.isBook) flaggedType = "BOOK";
    if (flags.isPolitical) flaggedType = "POLITICAL"; // if both, POLITICAL wins

    const effectiveType = flaggedType || inferredType;

    // Body overrides still win
    const type = overrides.type || effectiveType;

    // Title/author/notes resolution
    const parsed = primaryUrl ? fetchTitle_(primaryUrl) : { title: "" }; // if you have fetchTitle_
    const title = overrides.title || parsed.title || cleanSubject_(subject) || "(Untitled)";
    const author = overrides.author || "";
    const notes = overrides.notes || extractNotes_(bodyCore);

    /**************************
     * IG Draft (Chad)
     **************************/
    const ig = chadBuildIGDraft_(type, title, author, primaryUrl, notes, flags);
    let finalIG = ig;

    // STORY-ONLY: reduce caption to story-friendly text + no hashtags
    if (flags.isStoryOnly) {
      finalIG = {
        caption: String(ig.caption || "")
          .split("\n")
          .slice(0, 2) // first 1–2 lines only
          .join("\n")
          .trim(),
        hashtags: []
      };
    }

    /**************************
     * Pack folder + media
     **************************/
    const packFolder = ensureChildFolder_(CFG.outputRootFolderId, safeFilename_(title));

    const images = saveSourceAttachmentsToPack_(packFolder, msg, title); // [] or [{index,url,blob,fileId}...]

    const slidesCopy = copySlidesTemplateToPack_(CFG, packFolder, title);

    // Apply cover image once (if you want detailed logs, keep them here)
    try {
      const result = applyCoverImageToSlides_(CFG, slidesCopy.fileId, images);
      if (CFG.debug) log_(CFG, "Applied cover image to slides", { result });
    } catch (e) {
      log_(CFG, "Cover image apply failed (continuing)", { error: String(e) });
    }

    /**************************
     * Meta + doc + json
     **************************/
    const meta = {
      createdAt: new Date().toISOString(),
      title,
      type,
      authorOrBrand: author,
      link: primaryUrl,
      notes,

      mediaType: images.length > 1 ? "CAROUSEL_ALBUM" : (images.length === 1 ? "IMAGE" : "TEXT"),
      coverImageUrl: images[0]?.url || "",
      images: images.map(i => ({ index: i.index, url: i.url })),

      emailSubject: subjectRaw,                // keep flags
      slidesUrl: slidesCopy?.url || "",
      packFolderUrl: packFolder.getUrl(),
    };

    // Create doc + write minimal content (use finalIG!)
    const docCopy = createPackDoc_(packFolder, title, finalIG, meta, images);
    meta.docUrl = docCopy?.url || "";

    // Write artifacts (use finalIG!)
    writePackArtifacts_(packFolder, finalIG, meta);

    /**************************
     * Sheet append
     **************************/
    const now = new Date().toISOString();
    sheet.appendRow([
      meta.createdAt || now,
      meta.type || type,
      meta.title || title,
      meta.authorOrBrand || author,
      meta.link || primaryUrl,
      meta.notes || notes,
      finalIG.caption || "",
      (finalIG.hashtags || []).join(" "),
      "DRAFTED",
      meta.createdAt || now,
      meta.emailSubject || subjectRaw,
      hyperlinkFormula_(meta.packFolderUrl, "Pack Folder"),
    ]);

    /**************************
     * Email draft (skip if [DRAFT])
     **************************/
    if (!flags.isDraftOnly) {
      const emailSubject = `MEM Draft (${type}): ${title}`;
      const emailBody = [
        `Caption (copy/paste):\n`,
        finalIG.caption || "",
        `\n\nHashtags:\n${(finalIG.hashtags || []).join(" ") || "(none)"}`,
        `\n\nLink:\n${primaryUrl || "(none)"}`,
        `\n\nNotes:\n${notes || "(none)"}`,
        `\n\nPack Folder:\n${packFolder.getUrl()}`,
      ].join("\n");

      const firstBlob = images[0]?.blob || null;

      GmailApp.sendEmail(CFG.notifyEmail, emailSubject, emailBody, {
        attachments: firstBlob ? [firstBlob] : [],
      });
    } else {
      log_(CFG, "Draft-only flag set — email not sent", { subject: subjectRaw });
    }

    /**************************
     * Save state + mark processed
     **************************/
    seen[dedupeKey] = Date.now();
    saveSeen_(CFG.stateKey, seen);

    log_(CFG, "Marking processed", { subject: subjectRaw });
    markThreadDoneByName_(thread, CFG.inboxLabel, CFG.processedLabel);

    log_(CFG, "Draft created", { type, title, folder: packFolder.getUrl() });
  }

  log_(CFG, "Draft scan finished");
}
