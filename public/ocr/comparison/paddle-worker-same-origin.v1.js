const nativeFetch = self.fetch.bind(self);
const allowedOrigin = self.location.origin;

self.fetch = (input, init) => {
  const requestedUrl = new URL(
    input instanceof Request ? input.url : input.toString(),
    allowedOrigin
  );
  if (requestedUrl.origin !== allowedOrigin) {
    return Promise.reject(
      new Error(`Recognition blocked a third-party request: ${requestedUrl.origin}`)
    );
  }
  return nativeFetch(input, init);
};

await import("/ocr/paddleocr-js-0.4.2/worker-entry-C9UNuyOJ.js");
