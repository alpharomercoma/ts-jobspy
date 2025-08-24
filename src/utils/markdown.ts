export function htmlToMarkdown(html: string): string {
  if (!html) return '';

  return html
    // Remove script and style tags completely
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    
    // Convert headers
    .replace(/<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi, (_, level, content) => {
      const hashes = '#'.repeat(parseInt(level));
      return `${hashes} ${content.trim()}\n\n`;
    })
    
    // Convert paragraphs
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    
    // Convert line breaks
    .replace(/<br\s*\/?>/gi, '\n')
    
    // Convert bold and italic
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
    
    // Convert links
    .replace(/<a[^>]*href=['"]([^'"]*)['"][^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    
    // Convert lists
    .replace(/<ul[^>]*>(.*?)<\/ul>/gis, (_, content) => {
      return content.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n') + '\n';
    })
    .replace(/<ol[^>]*>(.*?)<\/ol>/gis, (_, content) => {
      let counter = 1;
      return content.replace(/<li[^>]*>(.*?)<\/li>/gi, () => `${counter++}. $1\n`) + '\n';
    })
    
    // Convert code blocks
    .replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gis, '```\n$1\n```\n')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    
    // Convert divs and spans (just remove tags)
    .replace(/<div[^>]*>(.*?)<\/div>/gi, '$1\n')
    .replace(/<span[^>]*>(.*?)<\/span>/gi, '$1')
    
    // Remove remaining HTML tags
    .replace(/<[^>]*>/g, '')
    
    // Decode HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    
    // Clean up whitespace
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
    .trim();
}
