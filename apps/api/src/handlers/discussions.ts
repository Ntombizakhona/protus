import { ScanCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../lib/ddb.js";
import { randomUUID } from "crypto";

const table = process.env.DISCUSSIONS_TABLE!;

interface Message {
  messageId: string;
  projectId: string | null;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
}

export async function listMessages(projectId?: string) {
  const params: any = { TableName: table };
  
  if (projectId) {
    params.FilterExpression = "projectId = :pid";
    params.ExpressionAttributeValues = { ":pid": projectId };
  }
  
  const res = await ddb.send(new ScanCommand(params));
  const messages = (res.Items ?? []) as Message[];
  
  // Sort by createdAt descending (newest first)
  messages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
  return { statusCode: 200, body: JSON.stringify(messages) };
}

export async function createMessage(event: { body: string }) {
  const body = JSON.parse(event.body);
  
  if (!body.content || !body.userId || !body.userName) {
    return { statusCode: 400, body: JSON.stringify({ error: "content, userId, and userName are required" }) };
  }
  
  const message: Message = {
    messageId: randomUUID(),
    projectId: body.projectId || null,
    userId: body.userId,
    userName: body.userName,
    content: body.content,
    createdAt: new Date().toISOString(),
  };
  
  await ddb.send(new PutCommand({ TableName: table, Item: message }));
  
  return { statusCode: 201, body: JSON.stringify(message) };
}

export async function deleteMessage(messageId: string) {
  await ddb.send(new DeleteCommand({ TableName: table, Key: { messageId } }));
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
}
