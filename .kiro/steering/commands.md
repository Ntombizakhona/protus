# Commands – Protus

## Setup
```bash
pnpm install
```

## Local Development
```bash
pnpm db:up          # Start DynamoDB Local
pnpm api:dev        # Run API locally
pnpm web:dev        # Run frontend locally
```

## Build
```bash
pnpm --filter @protus/api build
```

## AWS Deployment
```bash
pnpm cdk:bootstrap  # One-time per account
pnpm cdk:deploy     # Deploy infrastructure
pnpm cdk:destroy    # Tear down infrastructure
```
