/************ MAIN ************/
function draftScanInbox() {
  assertEnvConfigured();

  // Build a runtime CFG so existing helpers using CFG.* keep working
  const CFG = {
    sheetId: getSheetId(),
    sheetTab: cfg("SHEET_TAB") || "MEM List", // set SHEET_TAB in properties if you want
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

  // Spreadsheet + tab
  const ss = SpreadsheetApp.openById(CFG.sheetId);
  const sheet = ss.getSheetByName(CFG.sheetTab);
  if (!sheet) throw new Error(`Tab "${CFG.sheetTab}" not found.`);

  ensureHeaders_(sheet, SHEET_HEADERS);

  const seen = loadSeen_(CFG.stateKey);

  for (const thread of threads) {
    // ... keep your existing loop exactly as-is ...
    // Just be sure you DO NOT redeclare `sheet` inside this scope.
  }

  log_(CFG, "Draft scan finished");
}
