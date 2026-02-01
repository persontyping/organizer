function saveSourceAttachmentsToPack_(packFolder, msg, title) {
  const atts = msg.getAttachments({ includeInlineImages: true, includeAttachments: true }) || [];
  const safeTitle = safeFilename_(title);

  const images = [];
  let idx = 0;

  for (const att of atts) {
    const ct = String(att.getContentType() || "").toLowerCase();
    if (!ct.startsWith("image/")) continue;

    const ext = (ct.split("/")[1] || "png").toLowerCase();
    const blob = att.copyBlob();
    const fileName = `IMG_${safeTitle}_${String(idx + 1).padStart(2, "0")}.${ext}`.slice(0, 180);

    const file = packFolder.createFile(blob).setName(fileName);

    images.push({
      index: idx,
      name: fileName,
      fileId: file.getId(),
      url: file.getUrl(),
      blob, // ✅ keep blob so Slides can insert it
      contentType: ct,
    });

    idx++;
  }

  return images; // [] if none
}
