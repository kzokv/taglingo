import generatedManifest from "../test-fixtures/recognition/generated/manifest.json";
import realWorldManifest from "../test-fixtures/recognition/real-world/manifest.json";
import {
  createBrowserRecognitionFixtureRunner,
  type BrowserRecognitionFixture,
  type BrowserRecognitionFixtureResult
} from "../src/recognition/browserFixtureRunner";
import {
  createRecognitionFixtureContracts,
  type RecognitionFixtureContract,
  validateGeneratedRecognitionCorpusManifest,
  validateRealWorldRecognitionCorpusManifest
} from "../src/recognition/recognitionFixtureManifest";

const contracts = createRecognitionFixtureContracts(
  validateGeneratedRecognitionCorpusManifest(generatedManifest),
  validateRealWorldRecognitionCorpusManifest(realWorldManifest)
);
const imageUrls = import.meta.glob<string>(
  "../test-fixtures/recognition/{generated,real-world}/images/*",
  { eager: true, query: "?url", import: "default" }
);
const fixtureById = new Map(
  contracts.map((contract) => {
    const directory =
      contract.origin === "generated" ? "generated" : "real-world";
    const imagePath = `../test-fixtures/recognition/${directory}/${contract.file}`;
    const imageUrl = imageUrls[imagePath];
    if (!imageUrl) {
      throw new Error(`Recognition fixture asset was not bundled: ${imagePath}`);
    }
    const fixture: BrowserRecognitionFixture = {
      id: contract.id,
      origin: contract.origin,
      imageUrl,
      sourceCurrency: contract.sourceCurrency,
      samples: contract.samples
    };
    return [contract.id, fixture] as const;
  })
);
const runner = createBrowserRecognitionFixtureRunner();

declare global {
  interface Window {
    recognitionFixtures: {
      list(): readonly RecognitionFixtureContract[];
      run(fixtureId: string): Promise<BrowserRecognitionFixtureResult>;
      terminate(): Promise<void>;
    };
  }
}

window.recognitionFixtures = {
  list: () => structuredClone(contracts),
  async run(fixtureId) {
    const fixture = fixtureById.get(fixtureId);
    if (!fixture) {
      throw new Error(`Unknown recognition fixture: ${fixtureId}`);
    }
    return runner.run(fixture);
  },
  terminate: () => runner.terminate()
};
