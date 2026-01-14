// Lightweight regression tests for Lean doc comment splitting.
// Run with: node scripts/test-lean-comment-parser.js

const assert = require('assert');
const { splitLeanDocComments } = require('../out/leanCommentParser');

function testInlineBackticksContainingFenceMarker() {
  const text = "/-!\nInline fence marker in backticks: ` ``` ` should NOT start a fence.\n\nBut a real fence should:\n```lean\n#eval 1\n```\n-/\n\ndef foo := 1\n";
  const blocks = splitLeanDocComments(text);
  assert.strictEqual(blocks.length, 2, 'should produce module-doc + code blocks');
  assert.strictEqual(blocks[0].type, 'module-doc');
  assert.strictEqual(blocks[1].type, 'code');
  assert.ok(blocks[0].content.includes('Inline fence marker'), 'module-doc should contain text');
  assert.ok(blocks[1].source.includes('def foo'), 'code should contain definition');
}

function testBasicDocComment() {
  const text = "/-- hello -/\ndef x := 1\n";
  const blocks = splitLeanDocComments(text);
  assert.strictEqual(blocks.length, 2);
  assert.strictEqual(blocks[0].type, 'doc-comment');
  assert.strictEqual(blocks[1].type, 'code');
}

function testFullExampleFixture() {
  const fs = require('fs');
  const path = require('path');
  const fixturePath = path.join(__dirname, 'fixtures', 'test-comments-full.lean');
  const text = fs.readFileSync(fixturePath, 'utf8');

  const blocks = splitLeanDocComments(text);

  const moduleDocs = blocks.filter(b => b.type === 'module-doc');
  const docComments = blocks.filter(b => b.type === 'doc-comment');
  const codes = blocks.filter(b => b.type === 'code');

  // The sample contains multiple /-! sections and multiple /-- doc comments.
  assert.ok(moduleDocs.length >= 3, `expected >=3 module-doc blocks, got ${moduleDocs.length}`);
  assert.ok(docComments.length >= 5, `expected >=5 doc-comment blocks, got ${docComments.length}`);
  assert.ok(codes.length >= 1, `expected >=1 code blocks, got ${codes.length}`);

  // Ensure the well-known problematic pattern exists in the input and does not break splitting.
  assert.ok(text.includes('` ``` `'), 'fixture should include the inline fence marker pattern');

  // Ensure we did not lose the final module-doc summary.
  assert.ok(
    moduleDocs.some(b => b.content.includes('ドキュメントスタイルのまとめ')),
    'expected to include final module-doc summary block'
  );
}

function main() {
  testInlineBackticksContainingFenceMarker();
  testBasicDocComment();
  testFullExampleFixture();
  console.log('OK');
}

main();
