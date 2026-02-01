/************ MAIN ************/
function draftScanInbox() {
  
  assertEnvConfigured();

  // Build a runtime CFG so existing helpers using CFG.* keep working
  const CFG = {
    sheetId: getSheetId(),
    sheetTab: cfg("SHEET_TAB") || "MEM List",
    outputRootFolderId: getOutputRootFolderId(),
    slidesPackTemplateId: getSlidesTemplateId(),
    docTemplateId: getDocTemplateId(),
    stateKey: cfg("STATE_KEY") || "DRAFTS_SEEN_URL_HASHES_V1",

    inboxLabel: getInboxLabel(),
    processedLabel: getProcessedLabel(),

    lookbackHours: getLookbackHours(),
    maxThreadsPerRun: getMaxThreadsPerRun(),

    notifyEmail: cfg("NOTIFY_EMAIL") || Session.getActiveUser().getEmail(),
    debug: isDebug(),
  };

  if (CFG.debug) Logger.log(`Running in ${getEnv()} mode`);

  log_(CFG, "Draft scan started", { label: CFG.inboxLabel });

  const query = `label:"${CFG.inboxLabel}" -label:"${CFG.processedLabel}" newer_than:${CFG.lookbackHours}h`;
  const threads = GmailApp.search(query, 0, CFG.maxThreadsPerRun);

  log_(CFG, "Threads found", { count: threads.length });
  if (!threads.length) return;

  const ss = SpreadsheetApp.openById(CFG.sheetId);
  const sheet = ss.getSheetByName(CFG.sheetTab);
  if (!sheet) throw new Error(`Tab "${CFG.sheetTab}" not found.`);

  ensureHeaders_(sheet, SHEET_HEADERS);

  const seen = loadSeen_(CFG.stateKey);

  for (const thread of threads) {
    log_(CFG, "ENTER loop", { threadId: thread.getId() });

    const msg = thread.getMessages().slice(-1)[0];
    const subjectRaw = (msg.getSubject() || "").trim();

    // Business flags live in Chad; boring bracket removal in Helpers
    const flags = chadParseFlags_(subjectRaw);
    const subject = removeBracketTags_(subjectRaw);

    const body = (msg.getPlainBody() || "").trim();
    const bodyCore = body.split(/\n--\s*\n/i)[0].trim();

    log_(CFG, "Message loaded", { subject: subjectRaw });
    log_(CFG, "After parse", { subjectRaw });

    const urls = extractUrls_(bodyCore).filter(u => !isJunkUrl_(u));
    const primaryUrl = urls[0] || "";

    const dedupeKey = primaryUrl ? hash_(primaryUrl) : hash_(subject + "\n" + bodyCore);

    if (seen[dedupeKey] && !flags.isTest) { // (isTest optional; harmless if undefined)
      log_(CFG, "Duplicate thread skipped", { subject: subjectRaw });
      markThreadDoneByName_(thread, CFG.inboxLabel, CFG.processedLabel);
      continue;
    }

    const overrides = parseOverrides_(bodyCore); // must exist in your project
    const inferredType = inferType_(subject, bodyCore, primaryUrl);
    const type = chadEffectiveType_(inferredType, overrides.type, flags);

    const parsed = primaryUrl ? fetchTitle_(primaryUrl) : { title: "" };
    const title = overrides.title || parsed.title || cleanSubject_(subject) || "(Untitled)";
    const author = overrides.author || "";
    const notes = overrides.notes || extractNotes_(bodyCore);

    // IG draft
    const ig = chadBuildIGDraft_(type, title, author, primaryUrl, notes, flags);
    let finalIG = ig;

    if (flags.isStoryOnly) {
      finalIG = {
        caption: String(ig.caption || "").split("\n").slice(0, 2).join("\n").trim(),
        hashtags: []
      };
    }

    // Pack folder
    const packFolder = ensureChildFolder_(CFG.outputRootFolderId, safeFilename_(title));

    // Save attachments
    const images = saveSourceAttachmentsToPack_(packFolder, msg, title);

    // Slides
    const slidesCopy = copySlidesTemplateToPack_(CFG, packFolder, title);
    try {
      if (slidesCopy?.fileId) applyCoverImageToSlides_(CFG, slidesCopy.fileId, images);
    } catch (e) {
      log_(CFG, "Cover image apply failed (continuing)", { error: String(e) });
    }

    // Meta
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

      emailSubject: subjectRaw,
      slidesUrl: slidesCopy?.url || "",
      packFolderUrl: packFolder.getUrl(),
    };

    // Doc + JSON (Option A: keep PackDoc.gs)
    const docCopy = createPackDoc_(packFolder, title, finalIG, meta, images);
    meta.docUrl = docCopy?.url || "";

    writePackArtifacts_(packFolder, finalIG, meta);

    // Sheet append
    const now = new Date().toISOString();
    log_(CFG, "About to appendRow", { title, type, sheetTab: CFG.sheetTab });

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

    SpreadsheetApp.flush();
    log_(CFG, "appendRow OK");

    // Email (skip if [DRAFT])
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

    // Mark processed + save dedupe
    seen[dedupeKey] = Date.now();
    saveSeen_(CFG.stateKey, seen);

    markThreadDoneByName_(thread, CFG.inboxLabel, CFG.processedLabel);
    log_(CFG, "Draft created", { type, title, folder: packFolder.getUrl() });
  }

  log_(CFG, "Draft scan finished");
}
