# Tanzania service knowledge

The Worker chat uses `tanzania-services.ts` as a small, reviewed, version-controlled knowledge source. It is bundled with the Worker, so chat matching adds no Firestore reads, search-provider calls, embeddings, or database service. An update is a source-data change followed by the Worker test suite and deployment.

For each new fact:

1. Prefer the operator, government agency, regulator, or service owner's official Tanzania page. Do not copy instructions from another country or an unofficial list as verified guidance.
2. Add a narrowly scoped entry with `jurisdiction: "TZ"`, explicit match groups, a concise answer, the original HTTPS source URL/title, and the date it was checked (`verifiedAt`). Keep variable details out unless the source explicitly documents them.
3. Set `refreshAfterDays` based on how quickly the fact may change. The matcher excludes an entry when its verification date is invalid, in the future, or older than that window.
4. Separate similar transaction intents (for example, wallet cash-out versus sending money) in both the matcher and tests. Do not reuse merchant-only steps for a regular customer.
5. Add tests for Swahili and English phrasings, an unrelated operator/country, stale entries, unknown codes and provider abstention when current local steps are unsupported.
6. Run `pnpm test`, `pnpm check`, and `pnpm build` from `worker/` before deployment.

The assistant returns the source URL and verification date separately from the generated text. When no fresh, relevant Tanzania source matches a local operator, fee, code, balance, or procedure question, the Worker abstains rather than asking a model provider to guess. Expand the corpus gradually as official sources are reviewed.

For Airtel Money Tanzania cash-out, the current reviewed official terms confirm redeeming wallet value for cash at an Airtel Money dealer, but do not document the ordinary customer's USSD/menu sequence. The steps on Airtel's [Lipa Kwa Simu page](https://www.airtel.co.tz/LIPA-KWA-SIMU-MITANDAO-YOTE) apply to a merchant account and must not be presented as the regular-wallet cash-out flow. Direct the customer to Airtel's official [contact page](https://www.airtel.co.tz/contact-us) for current instructions instead of guessing a code.
