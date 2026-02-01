/**
 * PackDoc.gs
 *
 * Creates (or copies from template) a Google Doc into packFolder,
 * writes minimal content, and embeds optional images inline.
 *
 * Supports BOTH call signatures (backward compatible):
 *   createPackDoc_(packFolder, title, ig, metaObj, imageEntries)
 *   createPackDoc_(CFG, packFolder, title, ig, metaObj, imageEntries)
 *
 * Returns: { fileId, url }
 */
function createPackDoc_() {
  // ---- Support both signatures
  let cfg, packFolder, title, ig, metaObj, imageEntries;

  if (arguments.length === 6 && typeof arguments[0] === "object") {
    cfg = arguments[0];
    packFolder = arguments[1];
    title = arguments[2];
    ig = arguments[3];
    metaObj = arguments[4];
    imageEntries = arguments[5];
  } else {
    // Legacy signature: (packFolder, title, ig, metaObj, imageEntries)
    cfg = (typeof CFG !== "undefined") ? CFG : null;
    packFolder = arguments[0];
    title = arguments[1];
    ig = arguments[2];
    metaObj = arguments[3];
    imageEntries = arguments[4];
  }

  if (!packFolder) throw new Error("createPackDoc_: packFolder is required");

  const safeTitle = safeFilename_(title || "Pack");
  let docId, docUrl;

  // ---- 1) Create/copy doc
  if (cfg && cfg.docTemplateId) {
    const copy = DriveApp.getFileById(cfg.docTemplateId)
      .makeCopy(`${safeTitle} - Notes`, packFolder);
    docId = copy.getId();
    docUrl = copy.getUrl();
  } else {
    const doc = DocumentApp.create(`${safeTitle} - Notes`);
    docId = doc.getId();
    docUrl = doc.getUrl();

    // Move new doc into pack folder
    const file = DriveApp.getFileById(docId);
    packFolder.addFile(file);

    // Root removal can fail on shared drives; ignore if so
    try {
      DriveApp.getRootFolder().removeFile(file);
    } catch (e) {}
  }

  // Optional: Drive sometimes lags right after copy/create
  try { waitForDriveFile_(docId, 8000); } catch (e) {}

  // ---- 2) Write minimal content
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();

  // If you want to keep template content, remove this line:
  body.clear();

  // Title
  body.appendParagraph(metaObj?.title || title || "(Untitled)").setBold(true);
  body.appendParagraph("");

  // Metadata
  const typeLine = `Type: ${metaObj?.type || ""}`.trim();
  if (typeLine !== "Type:") body.appendParagraph(typeLine);

  if (metaObj?.authorOrBrand) body.appendParagraph(`Author/Brand: ${metaObj.authorOrBrand}`);
  if (metaObj?.link) body.appendParagraph(`Link: ${metaObj.link}`);
  if (metaObj?.createdAt) body.appendParagraph(`Created: ${metaObj.createdAt}`);
  if (metaObj?.sourceAttachmentUrl) body.appendParagraph(`Source file: ${metaObj.sourceAttachmentUrl}`);
  body.appendParagraph("");

  // Notes
  if (metaObj?.notes) {
    body.appendParagraph("Notes:");
    body.appendParagraph(String(metaObj.notes));
    body.appendParagraph("");
  }

  // Caption + hashtags
  if (ig?.caption) {
    body.appendParagraph("Caption:");
    body.appendParagraph(String(ig.caption));
    body.appendParagraph("");
  }

  if (ig?.hashtags?.length) {
    body.appendParagraph("Hashtags:");
    body.appendParagraph(ig.hashtags.join(" "));
    body.appendParagraph("");
  }

  // ---- 3) Insert images (array)
  if (Array.isArray(imageEntries) && imageEntries.length) {
    body.appendParagraph("Images:");

    const MAX_W = 500;

    imageEntries.forEach((img, i) => {
      body.appendParagraph(`Image ${i + 1}`);

      if (!img || !img.blob) {
        body.appendParagraph("(missing image blob)");
        body.appendParagraph("");
        return;
      }

      const el = body.appendImage(img.blob);

      // scale to MAX_W (aspect ratio locked)
      const w = el.getWidth();
      const h = el.getHeight();
      if (w > MAX_W) {
        const scale = MAX_W / w;
        el.setWidth(Math.round(w * scale));
        el.setHeight(Math.round(h * scale));
      }

      body.appendParagraph("");
    });
  }

  doc.saveAndClose();
  return { fileId: docId, url: docUrl };
}
