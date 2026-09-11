#!/usr/bin/env bash
# Requires Emscripten 4.0.23 activated, Python >=3.10, CMake, make, curl, and tar.
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
fetch() {
  curl -fL --retry 3 "$1" -o "$2"
  printf '%s  %s\n' "$3" "$2" | shasum -a 256 -c -
}
fetch https://github.com/k2-fsa/sherpa-onnx/archive/refs/tags/v1.13.3.tar.gz "$work/source.tgz" 01db47e87078d5f8fd0e163f9168436ad1e2ad783d61af51da44f117cae3e554
fetch https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01.tar.bz2 "$work/model.tbz" f170013b4716e41b62b9bfd809687c207cef798ef9bc6534d524e17af9b6561a
fetch https://github.com/nlohmann/json/releases/download/v3.12.0/json.tar.xz "$work/json.txz" 42f6e95cad6ec532fd372391373363b62a14af6d771056dbfc86160e6dfff7aa
tar -xzf "$work/source.tgz" -C "$work"
tar -xjf "$work/model.tbz" -C "$work"
tar -xJf "$work/json.txz" -C "$work"
source_dir="$work/sherpa-onnx-1.13.3"
model="$work/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01"
assets="$source_dir/wasm/kws/assets"
for part in encoder decoder joiner; do
  name="$part-epoch-12-avg-2-chunk-16-left-64"
  cp "$model/$name.int8.onnx" "$assets/$name.onnx"
done
cp "$model/tokens.txt" "$assets/tokens.txt"
# Generated with the archived bpe.model and SentencePiece 0.2.2, uppercase inputs.
cp "$repo/videos/gateway-hero/assets/wake/sherpa-onnx-1.13.3/keywords.txt" "$assets/keywords.txt"
python3 - "$source_dir" "$work/json" <<'PY'
from pathlib import Path
import sys
root = Path(sys.argv[1])
p = root / 'wasm/kws/CMakeLists.txt'
p.write_text(p.read_text().replace('INITIAL_MEMORY=512MB', 'INITIAL_MEMORY=64MB').replace('PTHREAD_POOL_SIZE=4', 'PTHREAD_POOL_SIZE=1'))
p = root / 'build-wasm-simd-kws.sh'
p.write_text(p.read_text().replace('-DSHERPA_ONNX_ENABLE_PYTHON=OFF', f'-DFETCHCONTENT_SOURCE_DIR_JSON={sys.argv[2]} -DSHERPA_ONNX_ENABLE_PYTHON=OFF'))
PY
(cd "$source_dir" && bash ./build-wasm-simd-kws.sh)
output="$repo/videos/gateway-hero/assets/wake/sherpa-onnx-1.13.3"
mkdir -p "$output/licenses"
cp "$source_dir/build-wasm-simd-kws/install/bin/wasm/"*.{js,wasm,data} "$output/"
# app.js belongs to the upstream demo, not Nadi.
rm "$output/app.js"
cp "$assets/keywords.txt" "$output/keywords.txt"
cp "$model/README.md" "$output/MODEL-README.md"
curl -fL --retry 3 https://raw.githubusercontent.com/microsoft/onnxruntime/v1.24.4/LICENSE -o "$output/licenses/onnxruntime.txt"
curl -fL --retry 3 https://raw.githubusercontent.com/microsoft/onnxruntime/v1.24.4/ThirdPartyNotices.txt -o "$output/licenses/onnxruntime-third-party.txt"
cp "$source_dir/LICENSE" "$output/licenses/sherpa-onnx.txt"
cp "$work/json/LICENSE.MIT" "$output/licenses/json.txt"
python3 - "$source_dir/build-wasm-simd-kws/_deps" "$output" <<'PY'
from pathlib import Path
import hashlib, sys
root, output = map(Path, sys.argv[1:])
for dep in root.glob('*-src'):
    for pattern in ('LICENSE*', 'COPYING*', 'NOTICE*', 'COPYRIGHT*'):
        for file in dep.glob(pattern):
            if file.is_file():
                (output/'licenses'/f'{dep.name}-{file.name}').write_bytes(file.read_bytes())
(output/'SHA256SUMS').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in sorted(output.iterdir()) if p.suffix in ('.js', '.wasm', '.data')))
PY
