/-!
# Lean4 ドキュメントコメントのテスト例

このファイルは、LeanDocumentation-Comment-Style.md に準拠した
ドキュメントコメントの書き方を実例で示します。

## Main definitions

* `myFunction` - 自然数のインクリメント関数
* `multiply` - 2つの自然数の積を計算
* `H84` - H(8,4)符号語の型（サンプル実装）
* `codewords` - 16個の符号語配列（サンプル）

## Main statements

* `add_comm` - 加法の可換性
* `multiply_comm` - 乗法の可換性

## Implementation notes

**Markdown 活用のポイント**:
- **見出しには太字** (`**...**`) を使用 → HTML で視認性向上
- コード要素は `` `backtick` `` で囲む → 自動リンク生成
- 箇条書きは `*` または `-` を使用
- 数式・疑似コードは ` ``` ` ブロックを使用

**ソースコードでの可読性を最優先**し、HTML レンダリングは副次的。

## References

* LeanDocumentation-Comment-Style.md
* Mathlib4 Documentation Guide

## Tags

documentation, test, examples, Markdown
-/

namespace TestComments

/-! ### 基本的な関数定義 -/

/-- 通常のドキュメントコメント（`/--` ... `-/`）。

これは個別の定義に対する説明です。

**数学的意味**: 後者関数 `S(n) = n + 1`

**使用例**:
```lean
#eval myFunction 5  -- 6
```

長文の数学的説明もここに書けます。
理論的背景、計算方法、注意事項など。 -/
def myFunction (n : Nat) : Nat := n + 1

/-- 2つの自然数の積を計算。

**定義**: `multiply a b = a × b`

引数:
* `a` - 第1引数（被乗数）
* `b` - 第2引数（乗数）

返り値: `a` と `b` の積 -/
def multiply (a b : Nat) : Nat := a * b

/-! ### 定理の記述例 -/

/-- 自然数の加法は可換である。

**数学的記述**:
```
∀ n m : ℕ, n + m = m + n
```

これは Peano 算術の基本的な性質であり、数学的帰納法で証明できる。

証明の概略:
1. ベースケース: `n + 0 = 0 + n` を示す
2. 帰納ステップ: `n + S(m) = S(m) + n` を帰納法の仮定から導く -/
theorem add_comm (n m : Nat) : n + m = m + n := by
  sorry  -- 証明は省略

/-- 自然数の乗法は可換である。

**理論的根拠**: 加法の可換性から導かれる。

証明は `add_comm` を用いた帰納法による。 -/
theorem multiply_comm (a b : Nat) : multiply a b = multiply b a := by
  sorry  -- 証明は省略

#eval 5

/-! ### Markdown 活用の実例 -/

/-- H(8,4)符号語のサンプル実装。

**理論的根拠**: `H(8,4)` 拡張ハミング符号は doubly-even かつ self-dual である。

**型の解釈**:
* **型理論**: `UInt8` のエイリアス（ゼロコスト抽象化）
* **集合論**: 16要素集合 `C ⊂ {0x00, ..., 0xFF}`
* **量子論**: 16次元ヒルベルト空間の基底ラベル

これは LeanDocumentation-Comment-Style.md の推奨スタイルに従った例です。 -/
abbrev H84 := UInt8

/-- H(8,4)の16個の符号語配列（サンプル）。

**数学的性質**:
* **重み分布**: 1個の重み0、14個の重み4、1個の重み8
* **導出**: 生成行列 `G = [0xF0, 0x3C, 0x0F, 0xAA]` から計算
* **配列順序**: 重み順（0 → 4 → 8）にソート

**実装上の注意**:
実際のプロジェクトでは全16個を定義しますが、ここでは最初の3個のみ示します。 -/
def codewords : Array UInt8 := #[
  0x00,  -- 重み0
  0x0F,  -- 重み4
  0x33   -- 重み4（サンプルのため3個のみ）
]

end TestComments

/-! ## ドキュメントスタイルのまとめ

**`/-!` (Module docstring)**:
- ファイル冒頭またはセクション区切りに使用
- 必ず `#` または `###` の見出しを含む

**`/--` (Doc comment)**:
- 個別の定義・定理の直前に配置
- 1行目: 簡潔な要約（ピリオドで終わる）
- 2行目以降: 詳細説明（Markdown 活用）

**Markdown の適切な使用**:
- 見出しには `**太字**` を使用
- コード要素は `` `backtick` `` で囲む
- 箇条書きは `*` または `-`
- 過度な装飾は避ける（テーブル、絵文字など）

**可読性の優先順位**:
1. ソースコードでの可読性（最優先）
2. VS Code ホバー時の見やすさ
3. HTML レンダリング時の美しさ（副次的）

このバランスが Mathlib4 の標準スタイルです。 -/
