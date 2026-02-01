/**
 * Sheet schema (committed, stable)
 */
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
  "PackFolder",
];

/**
 * Default config values (safe fallbacks only).
 * Real environment-specific values must be set via Script Properties.
 */
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
};

/**
 * Core resolver:
 * 1) env-scoped property (e.g. prod.SHEET_ID)
 * 2) unscoped property (e.g. SHEET_ID)
 * 3) committed default
 */

function cfg(key) {
  const props = PropertiesService.getScriptProperties();
  const env = props.getProperty("ENV") || CFG_DEFAULTS.ENV || "dev";

  return (
    props.getProperty(`${env}.${key}`) ??
    props.getProperty(key) ??
    CFG_DEFAULTS[key]
  );
}

/**
 * Typed helpers
 */
function cfgBool(key) {
  return String(cfg(key)).toLowerCase() === "true";
}

function cfgNum(key) {
  return Number(cfg(key));
}

/**
 * Environment helpers
 */
function getEnv() {
  return cfg("ENV");
}

function isProd() {
  return getEnv() === "prod";
}

/**
 * Guardrails — call once at entrypoints
 */
function assertEnvConfigured() {
  const env = getEnv();

  const requiredKeys = [
    "SHEET_ID",
    "OUTPUT_ROOT_FOLDER_ID",
    "SLIDES_TEMPLATE_ID",
    "DOC_TEMPLATE_ID",
  ];

  requiredKeys.forEach((key) => {
    const val = cfg(key);

    if (!val) {
      throw new Error(`Missing config for ${env}: ${key}`);
    }

    if (env === "prod" && val === CFG_DEFAULTS[key]) {
      throw new Error(
        `PROD is using default value for ${key}. ` +
        `Set Script Property ${env}.${key}`
      );
    }
  });
}

/**
 * Convenience accessors (recommended)
 */
function getSheetId() {
  return cfg("SHEET_ID");
}

function getOutputRootFolderId() {
  return cfg("OUTPUT_ROOT_FOLDER_ID");
}

function getSlidesTemplateId() {
  return cfg("SLIDES_TEMPLATE_ID");
}

function getDocTemplateId() {
  return cfg("DOC_TEMPLATE_ID");
}

function getInboxLabel() {
  return cfg("INBOX_LABEL");
}

function getProcessedLabel() {
  return cfg("PROCESSED_LABEL");
}

function getLookbackHours() {
  return cfgNum("LOOKBACK_HOURS");
}

function getMaxThreadsPerRun() {
  return cfgNum("MAX_THREADS_PER_RUN");
}

function isDebug() {
  return cfgBool("DEBUG");
}
