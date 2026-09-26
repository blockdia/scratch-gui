import { pinyin } from "pinyin-pro";

// Owned by a workspace index: names are converted once, never on each keystroke.
export const createSearchAliases = () => {
  const cache = new Map();
  return (text) => {
    const lower = text.toLowerCase();
    if (cache.has(lower)) return cache.get(lower);
    const aliases = [{ text: lower, rank: 0 }];
    if (/\p{Script=Han}/u.test(lower)) {
      const syllables = pinyin(lower, { toneType: "none", type: "array", nonZh: "consecutive", v: true });
      const full = syllables.join("");
      // Keep Latin text and punctuation intact in the initials form.
      const initials = pinyin(lower, {
        toneType: "none", type: "array", nonZh: "consecutive", pattern: "first", v: true,
      }).join("");
      for (const [text, rank] of [[full, 1], [initials, 2]]) {
        if (!aliases.some((alias) => alias.text === text)) aliases.push({ text, rank });
      }
    }
    cache.set(lower, aliases);
    return aliases;
  };
};

// A ghost suggestion must preserve every character already typed.
export const appendableSuggestion = (input, completion) => completion.startsWith(input) ? completion : "";
