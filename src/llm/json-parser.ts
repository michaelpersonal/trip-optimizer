export function parseJsonResponse(text: string): any {
  // Strip markdown code blocks
  if (text.startsWith('```')) {
    text = text.split('\n').slice(1).join('\n');
    const lastBacktick = text.lastIndexOf('```');
    if (lastBacktick >= 0) {
      text = text.substring(0, lastBacktick).trim();
    }
  }

  // Replace +N with N (LLM often outputs "+3" which isn't valid JSON for number values)
  text = text.replace(/:\s*\+(\d)/g, ': $1');

  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {}

  const objStart = text.indexOf('{');
  const arrStart = text.indexOf('[');

  // Determine extraction order: try whichever appears first in the text
  const extractors: Array<() => any> = [];

  const extractObject = () => {
    if (objStart < 0) return undefined;
    let depth = 0;
    for (let i = objStart; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.substring(objStart, i + 1));
          } catch {
            return undefined;
          }
        }
      }
    }
    return undefined;
  };

  const extractArray = () => {
    if (arrStart < 0) return undefined;
    let depth = 0;
    for (let i = arrStart; i < text.length; i++) {
      if (text[i] === '[') depth++;
      else if (text[i] === ']') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.substring(arrStart, i + 1));
          } catch {
            return undefined;
          }
        }
      }
    }
    return undefined;
  };

  // Try the one that appears first in the text, then the other
  if (arrStart >= 0 && (objStart < 0 || arrStart < objStart)) {
    extractors.push(extractArray, extractObject);
  } else {
    extractors.push(extractObject, extractArray);
  }

  for (const extractor of extractors) {
    const result = extractor();
    if (result !== undefined) return result;
  }

  // Try salvaging truncated array
  if (arrStart !== undefined && arrStart >= 0) {
    const lastClose = text.lastIndexOf('}');
    if (lastClose > arrStart) {
      try {
        return JSON.parse(text.substring(arrStart, lastClose + 1) + ']');
      } catch {}
    }
  }

  throw new Error(`Could not parse JSON from LLM response: ${text.substring(0, 200)}`);
}
