function copySlidesTemplateToPack_(CFG, packFolderOrId, title) {
  const packFolder =
    typeof packFolderOrId === "string"
      ? DriveApp.getFolderById(packFolderOrId)
      : packFolderOrId;

  if (!packFolder || typeof packFolder.createFile !== "function") {
    throw new Error("copySlidesTemplateToPack_: packFolder is not a Folder (check what you pass in).");
  }

  const safeTitle = safeFilename_(title);
  const templateFile = DriveApp.getFileById(CFG.slidesPackTemplateId);

  const copy = templateFile.makeCopy(`${safeTitle} - Slides`, packFolder);

  const out = { fileId: copy.getId(), url: copy.getUrl() };
  log_(CFG, "Slides template copied", out);
  return out;
}

function applyCoverImageToSlides_(slidesFileId, images) {
  if (!slidesFileId) return { ok: false, reason: "missing_slidesFileId" };
  if (!images || !images.length) return { ok: false, reason: "no_images" };

  const blob = images[0]?.blob;
  if (!blob) return { ok: false, reason: "missing_blob" };

  const pres = openSlidesWithRetry_(slidesFileId, 8);

  const slide = pres.getSlides()[0];
  slide.getPageElements().forEach(e => e.remove());

  const W = pres.getPageWidth();
  const H = pres.getPageHeight();

  const img = slide.insertImage(blob);
  containFitImage_(img, W, H, 40);

  pres.saveAndClose();
  return { ok: true };
}



function openSlidesWithRetry_(slidesFileId, attempts) {
  const tries = Math.max(2, attempts || 8);
  let lastErr = null;

  // Ensure Drive can see it first
  waitForDriveFile_(slidesFileId, 10000);

  for (let i = 0; i < tries; i++) {
    try {
      return SlidesApp.openById(slidesFileId);
    } catch (e) {
      lastErr = e;
      const msg = String(e || "");
      // Only retry on "Not found" style errors
      if (!/not found/i.test(msg)) throw e;
      Utilities.sleep(350 * (i + 1)); // backoff
    }
  }
  throw lastErr;
}

