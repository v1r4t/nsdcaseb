// Hardcoded role allowlists for NSDC office bearers / executives.
//
// Fill in the club's real email addresses. Everyone else who registers
// becomes a `member` by default. Role edits in the admin dashboard
// override these values for existing accounts.
export const OB_EMAILS = new Set<string>([
  // "chairperson@bl.students.amrita.edu",
  // "secretary@bl.students.amrita.edu",
]);

export const EXECUTIVE_EMAILS = new Set<string>([
  // "executive1@bl.students.amrita.edu",
]);

export function roleForEmail(email: string): 'member' | 'executive' | 'ob' {
  if (OB_EMAILS.has(email)) return 'ob';
  if (EXECUTIVE_EMAILS.has(email)) return 'executive';
  return 'member';
}

// The college registration-number format will be supplied later. Until then
// this returns null and the member can provide/update it (or the admin can).
export function regNumberFromEmail(email: string): string | null {
  void email;
  // Example placeholder: return /^[a-z0-9.]+\.(\w+)@/i.exec(email)?.[1] ?? null;
  return null;
}