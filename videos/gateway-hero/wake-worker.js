/* Local inference only. No microphone samples are uploaded or retained. */
const ASSETS = new URL("./assets/wake/sherpa-onnx-1.13.3/", self.location.href).href;
let detector, stream, keywordText, epoch = 0;
const fail = error => self.postMessage({ type: "error", message: String(error) });
// The exported Emscripten runtime reads this global in this classic worker.
var Module = {
  locateFile: name => ASSETS + name,
  mainScriptUrlOrBlob: ASSETS + "sherpa-onnx-wasm-kws-main.js",
  onAbort: fail,
  onRuntimeInitialized() {
    try {
      detector = createKws(Module, {
        featConfig: { samplingRate: 16000, featureDim: 80 },
        modelConfig: {
          transducer: {
            encoder: "./encoder-epoch-12-avg-2-chunk-16-left-64.onnx",
            decoder: "./decoder-epoch-12-avg-2-chunk-16-left-64.onnx",
            joiner: "./joiner-epoch-12-avg-2-chunk-16-left-64.onnx",
          },
          tokens: "./tokens.txt", numThreads: 1, provider: "cpu", debug: 0,
          modelType: "zipformer2", modelingUnit: "bpe", bpeVocab: "",
        },
        keywords: keywordText, maxActivePaths: 4, numTrailingBlanks: 1,
        // Calibrate against booth recordings: higher threshold reduces false wakes.
        keywordsScore: 1.0, keywordsThreshold: 0.25,
      });
      if (!detector.handle) throw new Error("Keyword model initialization failed");
      stream = detector.createStream();
      self.postMessage({ type: "ready" });
    } catch (error) { fail(error); }
  },
};
self.onmessage = ({ data }) => {
  if (!detector || !stream) return;
  try {
    if (data.type === "reset") {
      epoch = data.epoch;
      stream.free(); stream = detector.createStream();
    } else if (data.type === "audio" && data.epoch === epoch) {
      // sherpa resamples the native microphone rate, preserving continuity.
      stream.acceptWaveform(data.sampleRate, data.samples);
      while (detector.isReady(stream)) {
        detector.decode(stream);
        const result = detector.getResult(stream);
        const phrase = { Hei_Nadi: "Hei Nadi" }[result.keyword];
        if (phrase) {
          self.postMessage({ type: "wake", phrase, epoch });
          stream.free(); stream = detector.createStream();
          break;
        }
      }
      self.postMessage({ type: "processed", epoch, seconds: data.samples.length / data.sampleRate });
    }
  } catch (error) { fail(error); }
};
fetch(ASSETS + "keywords.txt?v=hei-id-1").then(response => {
  if (!response.ok) throw new Error("Keyword definitions failed to load");
  return response.text();
}).then(text => {
  // The WASM API expects the keyword definitions, not a filesystem path.
  keywordText = text;
  importScripts(ASSETS + "sherpa-onnx-kws.js", ASSETS + "sherpa-onnx-wasm-kws-main.js");
}).catch(fail);
