# Architecture – Protus

## Three-Tier Cloud Architecture

### Presentation Layer
- Next.js web application
- Hosted on AWS Amplify

### Application Layer
- API Gateway (HTTP API)
- AWS Lambda (Node.js 20)

### Data Layer
- Amazon DynamoDB

### Authentication
- Amazon Cognito User Pools

## Data Model

### Projects Table
- Partition Key: projectId (String)
- Attributes: name, owner, status, createdAt, updatedAt

### Tasks Table
- Partition Key: projectId (String)
- Sort Key: taskId (String)
- Attributes: title, status, assignee, priority, createdAt, updatedAt

## API Routes
- GET /projects
- POST /projects
- GET /projects/{projectId}
- PATCH /projects/{projectId}
- GET /projects/{projectId}/tasks
- POST /tasks
- PATCH /tasks/{taskId}
