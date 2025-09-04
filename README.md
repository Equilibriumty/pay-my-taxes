# pay-my-taxes

A simple script that calculates your income from your Monobank account and creates an invoice for paying taxes.

## Environment variables

- `MONOBANK_API_TOKEN` - your Monobank API token
- `PERIOD_IN_MONTHS` - the period in months to calculate income for (defaults to a regular tax quarter - 3 months)

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run src/main.ts
```

This project was created using `bun init` in bun v1.2.21. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.


## TODO

- [X] Add caching via Redis
- [x] Refactor Redis into its own service
- [] Add unit tests
- [] Think about how to implement correct calculation by using historical currency rates
- [] Add ability to create invoices to pay the taxes