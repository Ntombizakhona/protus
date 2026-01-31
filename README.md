# 🛡️ Protus

AWS-Native IT Project Management Tool

## Quick Start

```bash
# Install dependencies
pnpm install

# Start DynamoDB Local
pnpm db:up

# Create local tables (run once)
aws dynamodb create-table --table-name ProjectsLocal --attribute-definitions AttributeName=projectId,AttributeType=S --key-schema AttributeName=projectId,KeyType=HASH --billing-mode PAY_PER_REQUEST --endpoint-url http://localhost:8000

aws dynamodb create-table --table-name TasksLocal --attribute-definitions AttributeName=projectId,AttributeType=S AttributeName=taskId,AttributeType=S --key-schema AttributeName=projectId,KeyType=HASH AttributeName=taskId,KeyType=RANGE --billing-mode PAY_PER_REQUEST --endpoint-url http://localhost:8000

# Run API
pnpm api:dev

# Run Frontend (in another terminal)
pnpm web:dev
```

## AWS Deployment

```bash
pnpm --filter @protus/api build
pnpm cdk:bootstrap
pnpm cdk:deploy
```

## Architecture

- Frontend: Next.js on AWS Amplify
- Backend: API Gateway + Lambda
- Database: DynamoDB
- Auth: Amazon Cognito
- IaC: AWS CDK
