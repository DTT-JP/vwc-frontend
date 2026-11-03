# ffmpeg.wasm の対応ソース

本ファイルは `python3 tools/complete.py` が `tools/dependencies.json` から生成します。手で編集しないでください。

`@ffmpeg/core` 0.12.10（tarball SHA-256 `d00089ce82e1bdf637ddbe42e0c3d41a1ba8cf4c9e825e7fa4d0bb970e844bd4`）は GPL-2.0-or-later です。次が、そのバイナリの構成部品と、固定した取得元です。

- ビルド手順：https://github.com/ffmpegwasm/ffmpeg.wasm の Dockerfile（コミット 71aa99d37c02a7b4c435275ca9ef50e612f6efa1）
- ビルド環境：emscripten/emsdk:3.1.40（Docker イメージ）
- configure：`--enable-gpl --enable-libx264 --enable-libx265 --enable-libvpx --enable-libmp3lame --enable-libtheora --enable-libvorbis --enable-libopus --enable-zlib --enable-libwebp --enable-libfreetype --enable-libfribidi --enable-libass --enable-libzimg`

| 部品 | 版 | ライセンス | 取得元と固定コミット |
|---|---|---|---|
| ffmpeg.wasm（ビルド手順・fftools） | v0.12.10 リリースコミット | MIT | [ffmpegwasm/ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm/tree/71aa99d37c02a7b4c435275ca9ef50e612f6efa1) の `71aa99d37c02a7b4c435275ca9ef50e612f6efa1` |
| FFmpeg | n5.1.4 | GPL-2.0-or-later（--enable-gpl） | [FFmpeg/FFmpeg](https://github.com/FFmpeg/FFmpeg/tree/4729204c17f756e186d622060088371d10b34f7e) の `4729204c17f756e186d622060088371d10b34f7e` |
| x264 | 4-cores ブランチ（ffmpegwasm フォーク） | GPL-2.0-or-later | [ffmpegwasm/x264](https://github.com/ffmpegwasm/x264/tree/33cac6b77d5b9259c552156013a817ab23119612) の `33cac6b77d5b9259c552156013a817ab23119612` |
| x265 | 3.4（ffmpegwasm フォーク） | GPL-2.0-or-later | [ffmpegwasm/x265](https://github.com/ffmpegwasm/x265/tree/2bb5520e9596f361bf0ed81b3b8da0d7fd999069) の `2bb5520e9596f361bf0ed81b3b8da0d7fd999069` |
| libvpx | v1.13.1 | BSD-3-Clause | [ffmpegwasm/libvpx](https://github.com/ffmpegwasm/libvpx/tree/10b9492dcf05b652e2e4b370e205bd605d421972) の `10b9492dcf05b652e2e4b370e205bd605d421972` |
| LAME | 3.100（ffmpegwasm フォーク master） | LGPL-2.0（COPYING は GNU Library GPL v2） | [ffmpegwasm/lame](https://github.com/ffmpegwasm/lame/tree/2badea1974ae36cb8312afe99cff1e6b3b5decee) の `2badea1974ae36cb8312afe99cff1e6b3b5decee` |
| libogg | v1.3.4 | BSD-3-Clause | [ffmpegwasm/Ogg](https://github.com/ffmpegwasm/Ogg/tree/bada45718453ac27b56773ae663f7e65112f6a6e) の `bada45718453ac27b56773ae663f7e65112f6a6e` |
| libtheora | v1.1.1 | BSD-3-Clause | [ffmpegwasm/theora](https://github.com/ffmpegwasm/theora/tree/7ffd8b2ecfc2d93ae5e16028e7528e609266bfbf) の `7ffd8b2ecfc2d93ae5e16028e7528e609266bfbf` |
| Opus | v1.3.1 | BSD-3-Clause | [ffmpegwasm/opus](https://github.com/ffmpegwasm/opus/tree/e85ed7726db5d677c9c0677298ea0cb9c65bdd23) の `e85ed7726db5d677c9c0677298ea0cb9c65bdd23` |
| libvorbis | v1.3.3 | BSD-3-Clause | [ffmpegwasm/vorbis](https://github.com/ffmpegwasm/vorbis/tree/7798164043197d7e33f02de4353ce2aa5b248225) の `7798164043197d7e33f02de4353ce2aa5b248225` |
| zlib | v1.2.11 | Zlib | [ffmpegwasm/zlib](https://github.com/ffmpegwasm/zlib/tree/cacf7f1d4e3d44d871b605da3b647f07d718623f) の `cacf7f1d4e3d44d871b605da3b647f07d718623f` |
| libwebp | v1.3.2 | BSD-3-Clause | [ffmpegwasm/libwebp](https://github.com/ffmpegwasm/libwebp/tree/ca332209cb5567c9b249c86788cb2dbf8847e760) の `ca332209cb5567c9b249c86788cb2dbf8847e760` |
| FreeType | VER-2-10-4 | FTL（FreeType License） | [ffmpegwasm/freetype2](https://github.com/ffmpegwasm/freetype2/tree/6a2b3e4007e794bfc6c91030d0ed987f925164a8) の `6a2b3e4007e794bfc6c91030d0ed987f925164a8` |
| FriBidi | v1.0.9 | LGPL-2.1-or-later | [fribidi/fribidi](https://github.com/fribidi/fribidi/tree/f9e8e71a6fbf4a4619481284c9f484d10e559995) の `f9e8e71a6fbf4a4619481284c9f484d10e559995` |
| HarfBuzz | 5.2.0 | MIT（Old MIT） | [harfbuzz/harfbuzz](https://github.com/harfbuzz/harfbuzz/tree/4a1d891c6317d2c83e5f3c2607ec5f5ccedffcde) の `4a1d891c6317d2c83e5f3c2607ec5f5ccedffcde` |
| libass | 0.15.0 | ISC | [libass/libass](https://github.com/libass/libass/tree/d149636f502f5774ae1a8fb4c554b122674393b2) の `d149636f502f5774ae1a8fb4c554b122674393b2` |
| zimg | release-3.0.5 | WTFPL-2.0 | [sekrit-twc/zimg](https://github.com/sekrit-twc/zimg/tree/e5b0de6bebbcbc66732ed5afaafef6b2c7dfef87) の `e5b0de6bebbcbc66732ed5afaafef6b2c7dfef87` |

## 取得方法

```sh
python3 tools/fetch_ffmpeg_source.py --out ffmpeg-source
```

各部品を固定コミットで取得し、`ffmpeg-source/` に tar.gz と `SHA256SUMS` を作ります（git が必要です）。上の表のリンクは各部品の固定コミットを指し、FFmpeg 本体のリンクは `tools/project.json` の `ffmpeg_source_url` から生成します。`ffmpeg_source_url` は FFmpeg 本体のソースを示すもので、同梱部品全体をまとめたアーカイブではありません。公開方法が GPL の要件を満たすことは、配布形態に応じて公開前に確認してください。

## 確認の範囲

- `ffmpeg-core.wasm` に埋め込まれたビルド設定と版の文字列を、上流の Dockerfile（コミット `71aa99d37c02a7b4c435275ca9ef50e612f6efa1`）と照合しました。
- x264 は `4-cores` ブランチ、LAME は `master` ブランチを Dockerfile が指しています。表のコミットは、取得時点の先頭で、どちらも `@ffmpeg/core` 0.12.10 の公開日（2025-01-07）より前の日付です。ビルド時点と同一かは、上流がブランチ名でしか固定していないため、確認できません。
- 配布バイナリを、この手順で再ビルドして同一になることは確認していません。法的な確認は、公開前に専門家へ依頼してください。
