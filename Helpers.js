/*******************************************************
 * Helpers.gs
 * Boring, reusable utilities only.
 * No workflow/business logic.
 *******************************************************/

/************ DRIVE WAIT ************/
function waitForDriveFile_(fileId, maxMs) {
  const start = Date.now();
  const timeout = Math.max(1000, maxMs || 8000);

  while (Date.now() - start < timeout) {
    try {
      const f = DriveApp.getFileById(fileId);
      f.getMimeType(); // touch to force Drive resolution
      return f;
    } catch (e) {
      Utilities.sleep(250);
    }
  }

  throw new Error(`waitForDriveFile_: timed out waiting for fileId=${fileId}`);
}

/************ SUBJECT CLEANUP ************/
function cleanSubject_(subject) {
  return String(subject || "")
    .replace(/^\s*\[.*?\]\s*/g, "") // strips leading tags like [MEM], [TODO]
    .trim();
}

// Generic bracket-tag extraction/removal (no meaning attached)
function extractBracketTags_(subject) {
  const s = String(subject || "");
  return (s.match(/\[[^\]]+\]/g) || [])
    .map(x => x.replace(/[\[\]]/g, "").trim())
    .filter(Boolean);
}

function removeBracketTags_(subject) {
  return String(subject || "")
    .replace(/\s*\[[^\]]+\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/************ GMAIL LABEL HELPER ************/
function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

/************ GMAIL THREAD MARKING ************/
function markThreadDoneByName_(thread, inboxLabelName, processedLabelName) {
  const inbox = GmailApp.getUserLabelByName(inboxLabelName) || GmailApp.createLabel(inboxLabelName);
  const done = GmailApp.getUserLabelByName(processedLabelName) || GmailApp.createLabel(processedLabelName);

  thread.addLabel(done);
  thread.removeLabel(inbox);
  thread.moveToArchive();
}

/************ EMAIL ATTACHMENTS ************/
// Always returns an ARRAY of image blobs (inline + normal attachments)
function getImageAttachments_(msg) {
  const atts = msg.getAttachments({
    includeInlineImages: true,
    includeAttachments: true
  }) || [];

  return atts.filter(a =>
    (a.getContentType() || "").toLowerCase().startsWith("image/")
  );
}

/********************* Image Helpers *************************/
/* Contain-Fit */
function containFitImage_(img, W, H, paddingPt) {
  const pad = Number(paddingPt || 0);
  const boxW = W - pad * 2;
  const boxH = H - pad * 2;

  const iw = img.getWidth();
  const ih = img.getHeight();

  const scale = Math.min(boxW / iw, boxH / ih);
  const nw = iw * scale;
  const nh = ih * scale;

  img.setWidth(nw).setHeight(nh);
  img.setLeft((W - nw) / 2);
  img.setTop((H - nh) / 2);
}

/* Cover-Fit */
function coverFitImage_(img, W, H) {
  const iw = img.getWidth();
  const ih = img.getHeight();

  const scale = Math.max(W / iw, H / ih);
  const nw = iw * scale;
  const nh = ih * scale;

  img.setWidth(nw).setHeight(nh);
  img.setLeft((W - nw) / 2);
  img.setTop((H - nh) / 2);
}

/************ HASH HELPER ************/
function hash_(s) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(s || ""),
    Utilities.Charset.UTF_8
  );

  return bytes
    .map(b => (b + 256).toString(16).slice(-2))
    .join("");
}

/************ LOG ************/
// Supports BOTH:
//   log_("msg", {a:1})
//   log_(CFG, "msg", {a:1})
function log_() {
  const args = Array.from(arguments);

  let cfg = null;
  let message = "";
  let data = undefined;

  if (args.length >= 2 && typeof args[0] === "object" && args[0] && typeof args[1] === "string") {
    cfg = args[0];
    message = args[1];
    data = args[2];
  } else {
    message = args[0];
    data = args[1];
  }

  if (cfg && cfg.debug === false) return;

  Logger.log(
    data !== undefined
      ? `${message} | ${JSON.stringify(data)}`
      : String(message)
  );
}

/************************ DRIVE (Pack) Helpers ************************/
function saveSourceAttachmentsToPack_(packFolder, msg, title) {
  const images = getImageAttachments_(msg);
  if (!images.length) return [];

  const safeTitle = safeFilename_(title);

  return images.map((att, i) => {
    const ext = ((att.getContentType() || "image/png").split("/")[1] || "png").toLowerCase();
    const name = `SOURCE_${safeTitle}_${String(i + 1).padStart(2, "0")}.${ext}`.slice(0, 180);

    const blob = att.copyBlob();
    const file = packFolder.createFile(blob).setName(name);

    return {
      index: i + 1,
      fileId: file.getId(),
      url: file.getUrl(),
      blob
    };
  });
}

/************ SHEETS ************/
function ensureHeaders_(sheet, headerList) {
  const lastCol = Math.max(sheet.getLastColumn(), headerList.length);

  const existing = sheet
    .getRange(1, 1, 1, lastCol)
    .getValues()[0]
    .map(v => String(v).trim());

  if (existing.every(v => v === "")) {
    sheet.getRange(1, 1, 1, headerList.length).setValues([headerList]);
    return;
  }

  const missing = headerList.filter(h => !existing.includes(h));
  if (missing.length) {
    sheet
      .getRange(1, existing.length + 1, 1, missing.length)
      .setValues([missing]);
  }
}

/************ TEMPLATE COPIERS ************/
// Backward compatible signatures:
// - copySlidesTemplateToPack_(packFolder, title) uses global CFG
// - copySlidesTemplateToPack_(CFG, packFolder, title)
function copySlidesTemplateToPack_() {
  let cfg, packFolder, title;

  if (arguments.length === 3 && typeof arguments[0] === "object") {
    cfg = arguments[0];
    packFolder = arguments[1];
    title = arguments[2];
  } else {
    cfg = (typeof CFG !== "undefined") ? CFG : null;
    packFolder = arguments[0];
    title = arguments[1];
  }

  if (!cfg || !cfg.slidesPackTemplateId) return null;

  const safeTitle = safeFilename_(title);
  const copy = DriveApp.getFileById(cfg.slidesPackTemplateId)
    .makeCopy(`${safeTitle} - Slides`, packFolder);

  return { fileId: copy.getId(), url: copy.getUrl() };
}

function copyDocTemplateToPack_() {
  let cfg, packFolder, title;

  if (arguments.length === 3 && typeof arguments[0] === "object") {
    cfg = arguments[0];
    packFolder = arguments[1];
    title = arguments[2];
  } else {
    cfg = (typeof CFG !== "undefined") ? CFG : null;
    packFolder = arguments[0];
    title = arguments[1];
  }

  if (!cfg || !cfg.docTemplateId) return null;

  const safeTitle = safeFilename_(title);
  const copy = DriveApp.getFileById(cfg.docTemplateId)
    .makeCopy(`${safeTitle} - Notes`, packFolder);

  return { fileId: copy.getId(), url: copy.getUrl() };
}

/**
 * Writes ONE json file to the pack folder.
 * Returns {fileId, url}
 */
function writePackArtifacts_(packFolder, ig, metaObj) {
  const payload = {
    caption: ig?.caption || "",
    hashtags: ig?.hashtags || [],
    meta: metaObj || {},
  };

  const safeTitle = metaObj?.title
    ? safeFilename_(metaObj.title)
    : "pack";

  const fileName = `${safeTitle}_pack.json`;

  const file = packFolder.createFile(
    fileName,
    JSON.stringify(payload, null, 2),
    MimeType.PLAIN_TEXT
  );

  return {
    fileId: file.getId(),
    url: file.getUrl(),
  };
}

function ensureChildFolder_(parentFolderId, name) {
  const parent = DriveApp.getFolderById(parentFolderId);
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function safeFilename_(s) {
  return String(s || "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60) || "item";
}

/************ ARRAYS ************/
function unique_(arr) {
  return Array.from(new Set(arr));
}

/************ TEXT ************/
function decodeHtml_(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractNotes_(body) {
  return String(body || "")
    .replace(/\bhttps?:\/\/[^\s<>()"]+/gi, "")           // strip URLs
    .replace(/^\s*(Type|Title|Author|Notes):.*$/gmi, "") // strip front-matter
    .trim();
}

/************ URL PARSING ************/
function extractUrls_(text) {
  const urlRegex = /\bhttps?:\/\/[^\s<>()"]+/gi;
  return Array.from(
    new Set((String(text || "").match(urlRegex) || []).map(u => u.replace(/[),.]+$/g, "")))
  ).slice(0, 10);
}

function isJunkUrl_(url) {
  const u = (url || "").toLowerCase();
  return [
    "proton.me",
    "mail.proton.me",
    "accounts.google.com",
    "unsubscribe",
    "privacy",
    "terms"
  ].some(bad => u.includes(bad));
}

function hyperlinkFormula_(url, label) {
  return url ? `=HYPERLINK("${url}","${label || "Link"}")` : "";
}

/************ FETCH PAGE TITLE ************/
function fetchTitle_(url) {
  if (!url) return { title: "" };

  try {
    const resp = UrlFetchApp.fetch(url, {
      followRedirects: true,
      muteHttpExceptions: true,
    });

    if (resp.getResponseCode() !== 200) return { title: "" };

    const html = resp.getContentText() || "";
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = match?.[1]
      ? decodeHtml_(match[1].replace(/\s+/g, " ").trim())
      : "";

    return { title };
  } catch (_) {
    return { title: "" };
  }
}

/************ STATE (dedupe) ************/
// Backward compatible:
// - loadSeen_() uses CFG.stateKey
// - loadSeen_(stateKey)
// - saveSeen_(seen) uses CFG.stateKey
// - saveSeen_(stateKey, seen)
function loadSeen_(stateKey) {
  const key = stateKey || ((typeof CFG !== "undefined") ? CFG.stateKey : null);
  if (!key) return {};

  const raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) return {};

  try {
    const obj = JSON.parse(raw);

    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== "number" || v < cutoff) delete obj[k];
    }
    return obj;
  } catch (e) {
    return {};
  }
}

function saveSeen_(a, b) {
  let key, seen;
  if (typeof a === "string") {
    key = a;
    seen = b;
  } else {
    key = (typeof CFG !== "undefined") ? CFG.stateKey : null;
    seen = a;
  }

  if (!key) throw new Error("saveSeen_: missing stateKey");

  PropertiesService
    .getScriptProperties()
    .setProperty(key, JSON.stringify(seen || {}));
}

/********************* Type Helpers *************************/
function inferType_(subject, body, url) {
  const text = `${subject || ""}\n${body || ""}\n${url || ""}`.toLowerCase();

  if (/\bbook\b|\bread\b|\bauthor\b|\bkindle\b|\bgoodreads\b/.test(text)) {
    return "Book";
  }

  if (/\brestaurant\b|\bcafe\b|\bbar\b|\bmenu\b|\bdinner\b|\bbrunch\b/.test(text)) {
    return "Restaurant";
  }

  return "Thing";
}
