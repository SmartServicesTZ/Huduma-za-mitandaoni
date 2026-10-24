# TIN certificate template asset

The current background template is `tin-template.png` in this directory. The renderer loads this asset, overlays the user's entered fields, and then draws a permanent bilingual watermark:

`SI HATI RASMI YA TRA / NOT AN OFFICIAL TRA DOCUMENT`

The same `renderTinCertificateCanvas` function is used for the live preview and for both PNG and PDF downloads. Do not remove the watermark or describe the generated result as an official TRA document.
