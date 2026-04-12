const fs = require('fs');
const vm = require('vm');
const content = fs.readFileSync('media/leanCommentParser.js', 'utf8');
vm.runInThisContext(content);

const text = `/-!
# 1. イントロ
text
## 2. 特徴空間の構成
text
-/`;

const blocks = LeanParser.parseLean(text);
console.log(JSON.stringify(blocks, null, 2));
