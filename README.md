# NEON VANGUARD (side-shooter)

ブラウザで動く横スクロールシューティングの試作です。Phaser 3 + TypeScript + Vite で作っています。

## 遊び方

| 操作 | キー |
| --- | --- |
| 移動 | 矢印キー / WASD |
| ショット（押しっぱなし） | Z / Space |
| 低速移動（当たり判定表示） | X / Shift |

## ローカルで動かす（Mac）

```sh
npm install
npm run dev
```

表示された `http://localhost:5173/` をブラウザで開きます。

確認用のURLパラメータがあります。

- `?boss` ボス戦から開始（パワー最大）
- `?t=30` ステージを30秒地点から開始

## 構成

- `src/scenes/` Boot（画像生成とフォント待ち）、Title、Game
- `src/entities/` 自機、敵3種、中ボス、弾プール
- `src/stage/stage1.ts` 敵の出現タイムライン（秒単位のデータ）
- `src/systems/juice.ts` ヒットストップ、スロー、画面揺れ、フラッシュ
- `src/systems/fx.ts` 爆発、火花、破片、衝撃波リング
- `src/systems/audio.ts` 効果音とBGMをWeb Audioで合成
- `src/systems/textures.ts` 全グラフィックをCanvasで描画生成

画像・音声ファイルは使っていません。すべて実行時にコードで生成しているため、素材ライセンスの制約がありません。

## 公開

`main` へのpushで GitHub Actions がビルドし、GitHub Pages に公開します。
