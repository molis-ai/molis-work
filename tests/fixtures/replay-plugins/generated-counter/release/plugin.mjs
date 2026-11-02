// src/operations/0.ts
function countCodePointsAndBytes(text) {
  let characters = 0;
  let utf8Bytes = 0;
  for (const symbol of text) {
    characters += 1;
    const codePoint = symbol.codePointAt(0) ?? 0;
    if (codePoint <= 127) utf8Bytes += 1;
    else if (codePoint <= 2047) utf8Bytes += 2;
    else if (codePoint <= 65535) utf8Bytes += 3;
    else utf8Bytes += 4;
  }
  return { characters, utf8_bytes: utf8Bytes };
}
function countLines(text) {
  return text.split("\n").length;
}
async function operation(input, _sdk) {
  const raw = input.text;
  const text = typeof raw === "string" ? raw : "";
  const { characters, utf8_bytes } = countCodePointsAndBytes(text);
  const result = {
    characters,
    utf8_bytes,
    lines: countLines(text)
  };
  return result;
}

// src/index.ts
var operations = {
  "text.count": operation
};
export {
  operations
};
