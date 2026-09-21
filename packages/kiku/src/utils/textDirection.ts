const LETTER = /\p{L}/u;
// Link targets and bare URLs are Latin whatever language the sentence is in.
const URL_LIKE = /\]\([^)]*\)|https?:\/\/\S+|www\.\S+/g;

// Same right-to-left ranges as isRTLText in ChatModal/types.
function isRTLCode(code: number): boolean {
  return (code >= 0x0590 && code <= 0x08ff) || (code >= 0xfb1d && code <= 0xfdff) || (code >= 0xfe70 && code <= 0xfeff);
}

// A line reads in the script most of its letters are in; too few letters, or a tie, follows the chat.
export function lineDirection(text: string, minLetters = 1): 'rtl' | 'ltr' | undefined {
  let rtl = 0;
  let ltr = 0;
  for (const ch of text.replace(URL_LIKE, ' ')) {
    if (!LETTER.test(ch)) continue;
    if (isRTLCode(ch.codePointAt(0) ?? 0)) rtl++;
    else ltr++;
  }
  if (rtl + ltr < minLetters || rtl === ltr) return undefined;
  return rtl > ltr ? 'rtl' : 'ltr';
}
