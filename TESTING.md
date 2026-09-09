# Testing

Run `npm ci`, `npm run coverage`, then `npm run build`.

`npm test` runs the original Tape integration fixtures and focused regression
tests. The runner executes JavaScript directly without a shell pipeline. Its
regression checks verify that assertion failures and uncaught exceptions both
return a failing process status.

`npm run coverage` uses c8 to collect both production modules, including
unexecuted source. Per-file minimums are 90% lines/statements, 95% functions and
80% branches. Reports in `coverage` include LCOV and a JSON summary. A missed
threshold fails the command. Add regressions before fixes and do not lower the
thresholds to accommodate failures.

`npm run build` uses webpack and runs a standalone browser-bundle smoke check.
The smoke check loads the built script without Node's `require`, checks the
browser API and generates a real cURL snippet. `npm run build:debug` builds an
unminified bundle with source maps. CI runs coverage and the production build.

The suite covers request generation for Swagger/OpenAPI, URL and parameter
serialization, explicit value precedence, payload overrides, reference
immutability, credentials, output metadata, targets and error propagation.
The browser bundle exposes request generation plus `getResponseSample`,
`httpStatusCodes`, and `OpenAPISampler`. Built-bundle checks exercise these
globals without Node's `require`.

Endpoint values support the legacy flat query map or grouped `queryParameters`,
`pathParameters`, `headers` and `payloads` maps. Path values are encoded for a
valid HAR URL. Missing path samples retain encoded placeholders such as `%7Bid%7D`.
Generation failures are thrown to the caller instead of returning partial output.
