// Quick local check of normalizePrivateKeyPem without Next path aliases.
function normalizePrivateKeyPem(value) {
  let key = value.trim().replace(/^\uFEFF/, "");
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  if (key.includes("\\n")) key = key.replace(/\\n/g, "\n");
  if (key.includes("\\n")) key = key.replace(/\\n/g, "\n");
  key = key.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  key = key
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
  if (!key.endsWith("\n")) key = `${key}\n`;
  return key;
}

function isValidPrivateKeyPem(value) {
  const v = value.trim();
  const hasBegin =
    v.includes("-----BEGIN PRIVATE KEY-----") ||
    v.includes("-----BEGIN RSA PRIVATE KEY-----");
  const hasEnd =
    v.includes("-----END PRIVATE KEY-----") ||
    v.includes("-----END RSA PRIVATE KEY-----");
  return hasBegin && hasEnd && v.length > 100;
}

const multiline = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7examplebody
-----END PRIVATE KEY-----
`;

const vercel =
  "-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7examplebody\\n-----END PRIVATE KEY-----\\n";

const a = normalizePrivateKeyPem(multiline);
const b = normalizePrivateKeyPem(vercel);
console.log({
  multilineValid: isValidPrivateKeyPem(a),
  vercelValid: isValidPrivateKeyPem(b),
  multilineLines: a.trim().split("\n").length,
  vercelLines: b.trim().split("\n").length,
  same: a === b,
});
