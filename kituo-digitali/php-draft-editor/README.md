# Rasimu ya ombi la leseni — PHP

Standalone PHP form that previews applicant-entered details and downloads a one-page application-draft PDF. It uses the existing Tanzania region/council/ward list from the main site; it does **not** copy, store, or reuse the uploaded license PDF or the person's personal details in it.

## Requirements

- PHP 8.1 or newer with `mbstring` and `gd`
- Composer

## Run locally

```sh
cd kituo-digitali/php-draft-editor
composer install --no-interaction
php -S 127.0.0.1:8080 -t .
```

Open `http://127.0.0.1:8080` in a browser.

## How it works

- User-entered applicant, TIN, business, location and optional fee-estimate values appear in a live preview.
- Submitting **Pakua rasimu PDF** validates the fields and streams a PDF download; entered fields are not saved to a database or server-side file.
- Each generated PDF is marked **RASIMU TU — SI LESENI RASMI**, carries a prominent draft label and generated application reference, and explicitly says that the fee estimate is not a payment receipt.
- No government crest, government license number, issue/expiry date, signature claim or validating QR is generated. Those items can only be supplied by an authorized licensing authority after its approval process.
- CSRF protection, output escaping, input length limits and no-store download headers are included.

## Hosting / integration

The current site is published as a static GitHub Pages/Netlify frontend; static hosting does not execute PHP. Host this directory on a PHP-enabled server (with HTTPS in production) and route users to it, or port the same server-side PDF-generation approach into the existing Firebase Functions backend. Do not put `vendor/` in the Git repository; install dependencies with Composer during deployment.
