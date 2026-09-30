# Numbered Studio

A browser app that turns a photo into a printable pencil-by-number page using Prismacolor Premier Soft Core pencil codes.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Upload a JPG, PNG, or WebP image (up to 20 MB), or use the bundled sample. Crop the image, adjust the pencil and detail controls, then download a two-page PDF or separate template and color-preview PNGs. Use **Enlarge** to inspect small regions. For small faces, crop closer to the person and raise both Region detail and Maximum pencils. Image processing runs in a browser worker; uploaded photos are not sent to a server.

## Checks

```bash
npm test
npm run test:e2e
npm run build
```

The browser test uses Playwright Chromium. If it is not installed yet, run `npx playwright install chromium`.

## Hosted site

GitHub Actions builds and publishes the `main` branch to [GitHub Pages](https://zakport.github.io/paintbynumbers/). The workflow uses Vite's `pages` mode so assets load from `/paintbynumbers/`. Each push to `main` updates the site; the laptop does not need to stay on. Uploaded photos remain in the visitor's browser.

## How the conversion works

The app samples the cropped image, selects at most the requested number of Prismacolor pencils, assigns each pixel to one pencil, smooths isolated pixels, and merges regions too small for a number. The detail control changes working resolution, how many of the allowed pencils are used, smoothing, and the minimum region area and radius. It traces the remaining regions for the outline and places each label inside its region. Near-white image areas use the white paper and need no pencil.

The built-in catalog contains 150 pencil names, PC codes, and approximate screen colors from [Jenny's Crayon Collection](https://www.jennyscrayoncollection.com/2020/04/complete-list-of-prismacolor-premier.html). Prismacolor's [Premier Soft Core range](https://www.prismacolor.com/colored-pencils/premier-soft-core-colored-pencil-sets/SAP_3596THT.html) is the product reference. White (PC 938) is represented by uncolored paper. Digital swatches are estimates: the final color depends on paper, pressure, and layering.
