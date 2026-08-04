# Licensed real-world price-image corpus

Research date: 2026-08-04

## Recommendation

Use two sources for the checked-in and next real-world fixtures:

1. Keep the current five-image Wikimedia Commons pilot for USD, AUD, JPY, TWD, and EUR. The primary file pages support the authors, licenses, and upstream hashes recorded in its manifest.
2. Use a sampled subset of CORD v2 as the next expansion for real IDR receipts with existing text boxes and price annotations.

Both routes grant redistribution rights explicitly. Keep every downloaded original beside a machine-readable provenance record and a third-party notices file. Do not scrape ordinary image-search results, Kaggle/Roboflow mirrors, or arbitrary dataset mirrors: a download link does not establish that the uploader can license the pixels.

This is a rights-screening recommendation, not legal advice. Copyright licenses do not grant trademark, privacy, or publicity rights; reject fixtures with identifiable people, account/card data, or unnecessarily prominent brands.

## Current pilot: documentary license review

### Wikimedia Commons: targeted retail scenes

Commons is best treated as a catalog of individually licensed files, not as one uniformly licensed dataset. Wikimedia's reuse guidance says each file can have different credit and license requirements and advises reusers to verify each file's status. Its official API can return original URLs, SHA-1 values, and `extmetadata` such as creator, credit, and license fields. [Commons reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia) [MediaWiki Imageinfo API](https://www.mediawiki.org/wiki/API:Imageinfo)

The five files currently represented in `test-fixtures/recognition/real-world/manifest.json` pass an initial documentary review:

| Coverage | Fixture | Owner/license evidence | Stable original download | Obligations |
| --- | --- | --- | --- | --- |
| AUD, supermarket shelf, multiple nearby prices | [Expensive organic food](https://commons.wikimedia.org/wiki/File:Expensive_organic_food.jpg), Sgroey | Uploader declares own work under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Original file](https://commons.wikimedia.org/wiki/Special:Redirect/file/Expensive_organic_food.jpg) | Attribution plus ShareAlike for distributed adaptations. The retained 1,920-pixel Wikimedia thumbnail is correctly disclosed as a resize. Upstream SHA-1: `e2dbd0d4370a3a7cb546d82570baf603fd05cf08`. |
| EUR, low-light dual-currency label | [Dual Croatian kuna/euro price display](https://commons.wikimedia.org/wiki/File:Price_tag_with_dual_price_display_in_Croatian_kuna_and_euro.jpg), Koreanovsky | Uploader declares own work under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Original file](https://commons.wikimedia.org/wiki/Special:Redirect/file/Price_tag_with_dual_price_display_in_Croatian_kuna_and_euro.jpg) | Attribution plus ShareAlike for distributed adaptations. The manifest correctly records no modification. |
| JPY, rotated handwritten/printed store signs | [DryFishStoreInJapan](https://commons.wikimedia.org/wiki/File:DryFishStoreInJapan.JPG), mbostock | Originally posted by the photographer to Flickr under [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/); Commons records a 2007 FlickreviewR license verification | [Original file](https://commons.wikimedia.org/wiki/Special:Redirect/file/DryFishStoreInJapan.JPG) | Attribution plus ShareAlike for distributed adaptations. Upstream SHA-1: `a19e481509ef1ddb35300e67d90ad7039442be73`. This has stronger evidence than an unverified mirror, but preserve the Commons verification record because it is not an uploader-owned Commons file. |
| TWD, convenience-store sticker, Traditional Chinese context | [OK Mart price tag](https://commons.wikimedia.org/wiki/File:OK_Mart_price_tag_20160608.jpg), Solomon203 | Uploader declares own work under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Original file](https://commons.wikimedia.org/wiki/Special:Redirect/file/OK_Mart_price_tag_20160608.jpg) | Attribution plus ShareAlike for distributed adaptations. Upstream SHA-1: `c3f63fd3a294a672365e6adb20ee4ef7f5928fc8`. |
| USD, grocery shelf labels, several nearby prices | [“wow” price tag](https://commons.wikimedia.org/wiki/File:%22wow%22_price_tag.jpg), Tessa Bury | Uploader declares own work under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [Original file](https://commons.wikimedia.org/wiki/Special:Redirect/file/%22wow%22_price_tag.jpg) | Credit creator and title, link source and license, and identify modifications. No ShareAlike. The retained 1,920-pixel Wikimedia thumbnail is correctly disclosed as a resize. Upstream SHA-1: `51d47f4e3b645d882957ffce7b15f39dd57f8c4e`. |

The official `Special:Redirect/file` mechanism is intended for direct external links to original files. It remains stable when Wikimedia changes the underlying hashed storage URL. [MediaWiki linking-to-files documentation](https://www.mediawiki.org/wiki/Help:Linking_to_files/en#Direct_links_from_external_sites)

Useful official discovery categories include [USD price tags](https://commons.wikimedia.org/wiki/Category:Price_tags_in_United_States_dollars) (20 files when reviewed), [Australian price tags](https://commons.wikimedia.org/wiki/Category:Price_tags_in_Australia) (2), [Taiwan price tags](https://commons.wikimedia.org/wiki/Category:Price_tags_in_Taiwan) (14), [euro price tags](https://commons.wikimedia.org/wiki/Category:Price_tags_in_euros) (189), and [Japanese-language pricing](https://commons.wikimedia.org/wiki/Category:Pricing_in_Japanese) (hundreds of price-value subcategories). Category membership is useful for discovery but is not license evidence; preserve and review the individual file page.

For CC BY-SA files, keep the unmodified original as the versioned fixture when practical. If a crop or other copyright-relevant adaptation is checked in, label that derived file CC BY-SA 4.0, name the change, and retain the source attribution. ShareAlike applies to the adapted media, not unrelated TagLingo source code. CC BY and CC BY-SA both require attribution, a license reference, a source URI when practicable, and an indication of changes; CC BY-SA additionally requires a same-or-compatible license for shared adaptations. [CC BY 4.0 legal code](https://creativecommons.org/licenses/by/4.0/legalcode) [CC BY-SA 4.0 legal code](https://creativecommons.org/licenses/by-sa/4.0/legalcode)

### CORD v2: photographed Indonesian receipts

CORD is the strongest bulk source found. NAVER CLOVA's official repository calls it a receipt-parsing dataset containing images, OCR boxes/text, and semantic price fields; the public v2 release contains 1,000 Indonesian receipt images split 800/100/100. The repository and the official `naver-clova-ix` Hugging Face dataset both declare CC BY 4.0. [CORD owner repository and license](https://github.com/clovaai/cord) [CORD v2 official dataset](https://huggingface.co/datasets/naver-clova-ix/cord-v2)

This supplies real receipts, dense competing numerals, discounts, taxes, totals, and IDR/Rp formatting. It does not substitute for shelf tags or for other currency/script families.

Use the 100-row test split first rather than vendoring 2.31 GB. This URL is pinned to the current full dataset commit rather than mutable `main`:

```text
https://huggingface.co/datasets/naver-clova-ix/cord-v2/resolve/7f0115a4b758a71d6473b8d085751692da2fef98/data/test-00000-of-00001-9c204eb3f4e11791.parquet
```

The complete pinned release is available by replacing the filename with the four train shards or the validation shard listed in the [official files view](https://huggingface.co/datasets/naver-clova-ix/cord-v2/tree/main/data). The official dataset metadata records 800 train, 100 validation, and 100 test examples. [Pinned owner commit](https://huggingface.co/datasets/naver-clova-ix/cord-v2/commit/7f0115a4b758a71d6473b8d085751692da2fef98)

Redistribution obligations: attribute CORD/NAVER CLOVA, link the dataset and CC BY 4.0, retain supplied copyright/license notices, and identify any image or annotation changes. CORD's maintainers note that some semantic categories were removed for Indonesian legal reasons; independently screen selected pixels for personal/payment data before checking them into this public repository.

## Eligible only after per-image review

### TextOCR v0.1

TextOCR is valuable for mining natural scene-text negatives and difficult geometry: its official site reports 28,134 natural images and 903,069 word polygons and says its data is CC BY 4.0. It also says the images come from Open Images. [TextOCR official overview](https://textvqa.org/textocr/) [TextOCR dataset and license](https://textvqa.org/textocr/dataset/)

Official Meta-hosted downloads are stable and versioned by filename:

```text
https://dl.fbaipublicfiles.com/textvqa/images/train_val_images.zip
https://dl.fbaipublicfiles.com/textvqa/data/textocr/TextOCR_0.1_train.json
https://dl.fbaipublicfiles.com/textvqa/data/textocr/TextOCR_0.1_val.json
```

Do not vendor this archive wholesale. Open Images says its annotations are CC BY 4.0 and its images are *listed* as CC BY 2.0, but explicitly disclaims warranty and tells users to verify each image's license. Its image-information CSV supplies each original landing page, author, license, and checksum fields for that verification. [Open Images licenses](https://storage.googleapis.com/openimages/web/factsfigures_v7.html#licenses) [Open Images image metadata format](https://storage.googleapis.com/openimages/web/download_v7.html#image-information)

Safe use requires joining each selected TextOCR ID to Open Images metadata, verifying the original owner's landing page still records a compatible license, and preserving both TextOCR and photographer attribution. TextOCR annotates non-English text as `.` rather than transcribing it, so its practical coverage is predominantly English/Latin; use it for USD-like scene complexity and negatives, not universal currency coverage.

### HierText

Google's HierText release contains 11,639 text-heavy Open Images photographs, word/line/paragraph polygons, and transcriptions. The owner repository is CC BY-SA 4.0 and publishes unsigned S3 downloads for its fixed train, validation, and test archives. [HierText owner repository](https://github.com/google-research-datasets/hiertext) [HierText license](https://github.com/google-research-datasets/hiertext/blob/main/LICENSE)

```text
s3://open-images-dataset/ocr/train.tgz
s3://open-images-dataset/ocr/validation.tgz
s3://open-images-dataset/ocr/test.tgz
```

Treat it as a discovery pool, not an immediately redistributable fixture bundle. It inherits the same per-image Open Images verification issue, adds ShareAlike obligations for the HierText annotations/adaptations, and is not price-targeted. Its value is in finding dense menus, store displays, and hard negative text layouts after legal and content filtering.

## Sources not recommended for the checked-in corpus

- **Open Images in bulk:** excellent discovery metadata and download tooling, but Google explicitly says to verify each image's claimed CC BY 2.0 license. Use only individually verified images.
- **NYPL Buttolph menus:** the [public-domain filter](https://digitalcollections.nypl.org/collections/buttolph-collection-of-menus?filters%5Brights%5D=pd&keywords=) exposes more than 18,000 historical menus, and NYPL permits high-resolution download of items it marks public domain. However, NYPL states that its determination is under US law and may not hold in other countries. This makes it less clean for a globally redistributed repository than explicit CC licensing. [NYPL rights guidance](https://digitalcollections.nypl.org/about)
- **WildReceipt/SROIE and third-party mirrors:** the sources reviewed did not provide a sufficiently clear, owner-issued image redistribution license independent of repository code or competition access terms. Apache/MIT licensing on a loader repository does not automatically license third-party receipt pixels.
- **Kaggle, Roboflow, Hugging Face mirrors, and ordinary web image search:** accept only when they point back to an owner-issued license covering the actual images. A mirror's dataset-card license field is not enough by itself.

## Required fixture manifest

Every checked-in image should have a sibling manifest record with at least:

```yaml
id: stable-project-id
title: source title
creator: source creator
source_page_url: human-readable license/provenance page
download_url: original-resolution URL
retrieved_at: ISO-8601 timestamp
sha256: downloaded-byte hash
license_spdx: CC-BY-4.0
license_url: https://creativecommons.org/licenses/by/4.0/
modifications: none
currency: USD
scene_type: shelf-tag
expected_prices: []
```

The acquisition script should fail closed when the creator, source page, license, or hash is absent. It should download locally once; tests must never hotlink remote images. A generated `THIRD_PARTY_FIXTURES.md` should render the required credits from these records.

## Suggested first tranche

1. Retain the current five-image Commons pilot, its content hashes, and its per-file attribution records.
2. Extract a small, fixed set of CORD test receipts that covers `Rp`, comma/period grouping variation, discounts, subtotal/tax/total competition, and no explicit currency marker.
3. Add AI-generated fixtures to fill systematic notation combinations, but keep `origin: generated` separate from these real-image records.
4. Expand real-image coverage currency by currency through individually verified Commons files; use TextOCR/HierText only as discovery indexes until each selected source image passes the same manifest gate.
