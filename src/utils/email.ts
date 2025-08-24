export function extractEmailsFromText(text: string): string[] | undefined {
  if (!text) return undefined;

  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const matches = text.match(emailRegex);
  
  if (!matches || matches.length === 0) return undefined;
  
  // Remove duplicates and filter out common false positives
  const uniqueEmails = [...new Set(matches)]
    .filter(email => !email.includes('example.com'))
    .filter(email => !email.includes('test.com'))
    .filter(email => !email.includes('noreply'))
    .filter(email => !email.includes('no-reply'));
  
  return uniqueEmails.length > 0 ? uniqueEmails : undefined;
}
