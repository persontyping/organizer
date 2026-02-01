/**
 * Creates (or copies from template) a Google Doc into packFolder,
 * writes minimal text, and embeds the optional imageBlob inline.
 *
 * Returns: { fileId, url }
 */
function createPackDoc_(packFolder, title, ig, metaObj, imageEntries) {
  const safeTitle = safeFilename_(title || "Pack");
  let docId, docUrl;

  // 1) Create/copy doc
  if (CFG.docTemplateId) {
    const copy = DriveApp.getFileById(CFG.docTemplateId)
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
    DriveApp.getRootFolder().removeFile(file);
  }

  // 2) Write minimal content
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();

  // If you want to keep template content, remove this line:
  body.clear();

  // Minimal formatting: just one slightly-emphasized title
  body.appendParagraph(metaObj?.title || title || "(Untitled)").setBold(true);
  body.appendParagraph(""); // spacer

  // Metadata (plain text)
  body.appendParagraph(`Type: ${metaObj?.type || ""}`.trim());
  if (metaObj?.authorOrBrand) body.appendParagraph(`Author/Brand: ${metaObj.authorOrBrand}`);
  if (metaObj?.link) body.appendParagraph(`Link: ${metaObj.link}`);
  if (metaObj?.createdAt) body.appendParagraph(`Created: ${metaObj.createdAt}`);
  if (metaObj?.sourceAttachmentUrl) body.appendParagraph(`Source file: ${metaObj.sourceAttachmentUrl}`);
  body.appendParagraph(""); // spacer

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

  // 3) Insert an array of images
  if (Array.isArray(imageEntries) && imageEntries.length) {
    body.appendParagraph("Images:");

    imageEntries.forEach((img, i) => {
      const p = body.appendParagraph(`Image ${i + 1}`);
      const el = body.appendImage(img.blob);

      // scale to page width (aspect ratio locked)
      const MAX_W = 500;
      const w = el.getWidth();
      const h = el.getHeight();
      if (w > MAX_W) {
        const scale = MAX_W / w;
        el.setWidth(Math.round(w * scale));
        el.setHeight(Math.round(h * scale));
      }
    });
  }

  doc.saveAndClose();
  return { fileId: docId, url: docUrl };
}
