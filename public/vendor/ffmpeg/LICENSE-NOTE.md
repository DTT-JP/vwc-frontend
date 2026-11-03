# ffmpeg.wasm のライセンスについて

- `ffmpeg-core.js` / `ffmpeg-core.wasm`（@ffmpeg/core 0.12.10）は、FFmpeg 5.1.4 を `--enable-gpl` でビルドしたもので、x264・x265・libvpx・LAME・Vorbis・Opus などを含みます。配布物全体のライセンスは **GPL-2.0-or-later** です（npm の package.json の license 欄）。
- `ffmpeg.js` / `814.ffmpeg.js`（@ffmpeg/ffmpeg 0.12.15）は MIT です。
- このアプリは同梱の ffmpeg を、利用者のブラウザの中だけで動かします（サーバーでは動かしません）。**配布・公開するときは、GPL の条件（ソースの提供の申し出など）を満たす必要があります。要確認：実際に公開する前に、法務・指導者の判断を受けてください。**
- GPL を避けたい場合は、LGPL ビルドのコア（x264/x265 を含まないもの）に差し替えます。その場合は `tools/dependencies.json` と `verified.json` を更新してください。
