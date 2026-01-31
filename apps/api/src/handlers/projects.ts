import { ScanCommand, PutCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../lib/ddb.js";
import { randomUUID } from "crypto";

const table = process.env.PROJECTS_TABLE!;

export async function listProjects() {
  const res = await ddb.send(new ScanCommand({ TableName: table }));
  return { statusCode: 200, body: JSON.stringify(res.Items ?? []) };
}

export async function getProject(projectId: string) {
  const res = await ddb.send(
    new GetCommand({ TableName: table, Key: { projectId } })
  );
  if (!res.Item) {
    return { statusCode: 404, body: JSON.stringify({ error: "Project not found" }) };
  }
  return { statusCode: 200, body: JSON.stringify(res.Item) };
}

export async function createProject(event: { body: string }) {
  const body = JSON.parse(event.body);
  if (!body.name) {
    return { statusCode: 400, body: JSON.stringify({ error: "name is required" }) };
  }
  const now = new Date().toISOString();
  const item = {
    projectId: randomUUID(),
    name: body.name,
    owner: body.owner ?? null,
    status: body.status ?? "active",
    createdAt: now,
    updatedAt: now,
  };
  await ddb.send(new PutCommand({ TableName: table, Item: item }));
  return { statusCode: 201, body: JSON.stringify(item) };
}

export async function updateProject(projectId: string, event: { body: string }) {
  const body = JSON.parse(event.body);
  const now = new Date().toISOString();
  const updates: string[] = ["#updatedAt = :updatedAt"];
  const names: Record<string, string> = { "#updatedAt": "updatedAt" };
  const values: Record<string, unknown> = { ":updatedAt": now };

  if (body.name) {
    updates.push("#name = :name");
    names["#name"] = "name";
    values[":name"] = body.name;
  }
  if (body.status) {
    updates.push("#status = :status");
    names["#status"] = "status";
    values[":status"] = body.status;
  }
  if (body.owner !== undefined) {
    updates.push("#owner = :owner");
    names["#owner"] = "owner";
    values[":owner"] = body.owner;
  }

  await ddb.send(
    new UpdateCommand({
      TableName: table,
      Key: { projectId },
      UpdateExpression: `SET ${updates.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
}
