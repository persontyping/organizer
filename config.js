// config.gs
const CFG_DEFAULTS = {
  ENV: "dev", // fallback only
  SHEET_ID: "dev-sheet-id-here",
  OUTPUT_ROOT_FOLDER_ID: "dev-folder-id-here",
  SLIDES_TEMPLATE_ID: "dev-slides-template-id",
  DOC_TEMPLATE_ID: "dev-doc-template-id",

  INBOX_LABEL: "MEM",
  PROCESSED_LABEL: "MEM/Closed",
  LOOKBACK_HOURS: "720",
  MAX_THREADS_PER_RUN: "30",
  DEBUG: "true",
  }

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