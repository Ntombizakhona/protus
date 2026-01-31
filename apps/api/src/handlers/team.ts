import { ScanCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../lib/ddb.js";
import { randomUUID } from "crypto";

const table = process.env.TEAM_TABLE!;

export async function listMembers() {
  const res = await ddb.send(new ScanCommand({ TableName: table }));
  return { statusCode: 200, body: JSON.stringify(res.Items ?? []) };
}

export async function addMember(event: { body: string }) {
  const body = JSON.parse(event.body);
  if (!body.name || !body.email) {
    return { statusCode: 400, body: JSON.stringify({ error: "name and email are required" }) };
  }
  const now = new Date().toISOString();
  const item = {
    memberId: randomUUID(),
    name: body.name,
    email: body.email,
    role: body.role ?? "Contributor",
    createdAt: now,
  };
  await ddb.send(new PutCommand({ TableName: table, Item: item }));
  return { statusCode: 201, body: JSON.stringify(item) };
}

export async function deleteMember(memberId: string) {
  await ddb.send(new DeleteCommand({ TableName: table, Key: { memberId } }));
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
}
