"""Static preview with the same WASM isolation headers as production Nginx."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


ThreadingHTTPServer.request_queue_size = 128


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
        super().end_headers()


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 4174), Handler).serve_forever()
