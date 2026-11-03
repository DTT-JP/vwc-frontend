# NOTICE

Copyright (C) 2026 DTT-JP

Visual Web Code フロントエンドの自作部分は GNU GPL version 3 or later (`GPL-3.0-or-later`) で提供します。
以下の第三者資材は、それぞれのライセンス条件で提供されます。
この一覧は `vendor/MANIFEST.json` から生成しています。

| 資材 | 版 | ライセンス | ライセンス文書・補足 | 取得元 | 用途 |
|---|---|---|---|---|---|
| @fontsource-variable/noto-sans-jp | 5.3.1 | OFL-1.1 | [`vendor/fonts/noto-sans-jp/LICENSE`](vendor/fonts/noto-sans-jp/LICENSE) | https://registry.npmjs.org/@fontsource-variable/noto-sans-jp/-/noto-sans-jp-5.3.1.tgz | 本文フォント Noto Sans JP（可変フォント、分割配信） |
| @fontsource-variable/jetbrains-mono | 5.3.0 | OFL-1.1 | [`vendor/fonts/jetbrains-mono/LICENSE`](vendor/fonts/jetbrains-mono/LICENSE) | https://registry.npmjs.org/@fontsource-variable/jetbrains-mono/-/jetbrains-mono-5.3.0.tgz | エディターの等幅フォント JetBrains Mono（可変フォント） |
| @highlightjs/cdn-assets | 11.9.0 | BSD-3-Clause | [`vendor/highlight/LICENSE`](vendor/highlight/LICENSE) | https://registry.npmjs.org/@highlightjs/cdn-assets/-/cdn-assets-11.9.0.tgz | コードの構文強調（本体と追加言語9種） |
| mermaid | 11.17.2 | MIT | [`vendor/mermaid/LICENSE`](vendor/mermaid/LICENSE) | https://registry.npmjs.org/mermaid/-/mermaid-11.17.2.tgz | Markdown内の図（```mermaid。必要な場合だけ読み込み） |
| qrcode-generator | 2.0.4 | MIT | [`vendor/qr/qrcode-generator.LICENSE`](vendor/qr/qrcode-generator.LICENSE) 配布 tarball にライセンス本文がないため、上流リポジトリ（kazuhikoarase/qrcode-generator のタグ js2.0.4）の LICENSE を取得して同梱しています。 | https://registry.npmjs.org/qrcode-generator/-/qrcode-generator-2.0.4.tgz | QRコードの生成（ログイン画面） |
| jsqr | 1.4.0 | Apache-2.0 | [`vendor/qr/jsQR.LICENSE`](vendor/qr/jsQR.LICENSE) | https://registry.npmjs.org/jsqr/-/jsqr-1.4.0.tgz | QRコードの読取（BarcodeDetector がない環境向け） |
| @ffmpeg/ffmpeg | 0.12.15 | MIT | [`vendor/ffmpeg/LICENSE-MIT`](vendor/ffmpeg/LICENSE-MIT) 使用元は https://github.com/ffmpegwasm/ffmpeg.wasm の公式配布物です。npm tarball にライセンス本文がないため、上流リポジトリの LICENSE を取得して同梱しています。 | https://registry.npmjs.org/@ffmpeg/ffmpeg/-/ffmpeg-0.12.15.tgz | ffmpeg.wasm の呼び出し側（Worker付き） |
| @ffmpeg/core | 0.12.10 | GPL-2.0-or-later | [`vendor/ffmpeg/LICENSE-GPL-2.0-or-later`](vendor/ffmpeg/LICENSE-GPL-2.0-or-later) FFmpeg 5.1.4 を --enable-gpl（--enable-version3 なし）でビルドした GPL-2.0-or-later のバイナリです。構成部品・対応ソース・入手方法は vendor/ffmpeg/SOURCE.md と、アプリ内のライセンス＞FFmpeg を参照してください。 | https://registry.npmjs.org/@ffmpeg/core/-/core-0.12.10.tgz | ffmpeg.wasm 本体（シングルスレッド版、音声・動画変換） |
| material-symbols | 0.48.2 | Apache-2.0 | [`vendor/fonts/material-symbols.LICENSE`](vendor/fonts/material-symbols.LICENSE) | https://registry.npmjs.org/material-symbols/-/material-symbols-0.48.2.tgz | アイコンフォント Material Symbols Outlined |

FE と BE は別リポジトリ・別配布物です。このリポジトリに PHP、BE の画面、BE のライブラリは含みません。

`@ffmpeg/core` の構成部品・対応ソース・取得方法は [`vendor/ffmpeg/SOURCE.md`](vendor/ffmpeg/SOURCE.md) とアプリ内の「ライセンス」に記載しています。
