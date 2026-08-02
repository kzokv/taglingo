# PROTOTYPE — mobile recognition performance budgets

Question: do the proposed budgets distinguish a usable, sustainable recognition
profile from one that is too slow, heavy, or thermally unstable, while keeping
Manual Price Entry available during preparation?

Run:

```sh
npm run prototype:performance-budgets
```

For a non-interactive comparison of every synthetic trace:

```sh
npm run prototype:performance-budgets -- --demo
```

The traces are deliberately synthetic. They make the proposed contract concrete;
they do not claim that PaddleOCR.js, Tesseract.js, iOS Safari, or Android Chrome
achieves these results. Qualification requires measurements on each required
physical device/browser block. Accuracy and safety remain separate gates.

The pure `budgetModel.mjs` module owns the proposed budget and evaluation logic.
`prototype.mjs` is only a throwaway terminal shell.
