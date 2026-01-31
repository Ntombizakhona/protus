import { QueryCommand, PutCommand, UpdateCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../lib/ddb.js";
import { randomUUID } from "crypto";

const table = process.env.TASKS_TABLE!;
const usersTable = process.env.USERS_TABLE!;
const projectsTable = process.env.PROJECTS_TABLE!;

export async function listTasks(projectId: string) {
  const res = await ddb.send(
    new QueryCommand({
      TableName: table,
      KeyConditionExpression: "projectId = :pid",
      ExpressionAttributeValues: { ":pid": projectId },
    })
  );
  return { statusCode: 200, body: JSON.stringify(res.Items ?? []) };
}

export async function createTask(event: { body: string }) {
  const body = JSON.parse(event.body);
  if (!body.projectId || !body.title) {
    return { statusCode: 400, body: JSON.stringify({ error: "projectId and title are required" }) };
  }
  const now = new Date().toISOString();
  const item = {
    projectId: body.projectId,
    taskId: randomUUID(),
    title: body.title,
    status: body.status ?? "todo",
    assignee: body.assignee ?? null,
    priority: body.priority ?? "medium",
    dueDate: body.dueDate ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await ddb.send(new PutCommand({ TableName: table, Item: item }));
  return { statusCode: 201, body: JSON.stringify(item) };
}

async function checkAllTasksCompleted(projectId: string): Promise<boolean> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: table,
      KeyConditionExpression: "projectId = :pid",
      ExpressionAttributeValues: { ":pid": projectId },
    })
  );
  
  const tasks = res.Items ?? [];
  if (tasks.length === 0) return false;
  
  return tasks.every(task => task.status === "done");
}

async function getProjectName(projectId: string): Promise<string> {
  const { GetCommand } = await import("@aws-sdk/lib-dynamodb");
  const res = await ddb.send(new GetCommand({ 
    TableName: projectsTable, 
    Key: { projectId } 
  }));
  return res.Item?.name ?? "Unknown Project";
}

async function notifyAdminsProjectComplete(projectId: string, projectName: string) {
  // Get all admin users
  const res = await ddb.send(new ScanCommand({
    TableName: usersTable,
    FilterExpression: "#role = :admin AND #status = :active",
    ExpressionAttributeNames: { "#role": "role", "#status": "status" },
    ExpressionAttributeValues: { ":admin": "Admin", ":active": "active" },
  }));
  
  const admins = res.Items ?? [];
  
  // In production, send email via AWS SES
  // For local dev, log to console
  console.log(`\n========================================`);
  console.log(`🎉 PROJECT COMPLETE: ${projectName}`);
  console.log(`Project ID: ${projectId}`);
  console.log(`All tasks have been marked as done!`);
  console.log(`\nNotifying admins:`);
  admins.forEach(admin => {
    console.log(`  - ${admin.name} (${admin.email})`);
  });
  console.log(`\nAdmin can now mark this project as closed.`);
  console.log(`========================================\n`);
  
  // TODO: In production, use AWS SES to send actual emails
  // Example:
  // import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
  // const ses = new SESClient({});
  // for (const admin of admins) {
  //   await ses.send(new SendEmailCommand({
  //     Source: "noreply@protus.app",
  //     Destination: { ToAddresses: [admin.email] },
  //     Message: {
  //       Subject: { Data: `Project Complete: ${projectName}` },
  //       Body: { Text: { Data: `All tasks in "${projectName}" are done. You can now close the project.` } }
  //     }
  //   }));
  // }
}

export async function updateTask(projectId: string, taskId: string, event: { body: string }) {
  const body = JSON.parse(event.body);
  const now = new Date().toISOString();
  const updates: string[] = ["#updatedAt = :updatedAt"];
  const names: Record<string, string> = { "#updatedAt": "updatedAt" };
  const values: Record<string, unknown> = { ":updatedAt": now };

  if (body.title) {
    updates.push("#title = :title");
    names["#title"] = "title";
    values[":title"] = body.title;
  }
  if (body.status) {
    updates.push("#status = :status");
    names["#status"] = "status";
    values[":status"] = body.status;
  }
  if (body.assignee !== undefined) {
    updates.push("#assignee = :assignee");
    names["#assignee"] = "assignee";
    values[":assignee"] = body.assignee;
  }
  if (body.priority) {
    updates.push("#priority = :priority");
    names["#priority"] = "priority";
    values[":priority"] = body.priority;
  }
  if (body.dueDate !== undefined) {
    updates.push("#dueDate = :dueDate");
    names["#dueDate"] = "dueDate";
    values[":dueDate"] = body.dueDate;
  }

  await ddb.send(
    new UpdateCommand({
      TableName: table,
      Key: { projectId, taskId },
      UpdateExpression: `SET ${updates.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );

  // Check if task was marked as done and all tasks are now complete
  if (body.status === "done") {
    const allComplete = await checkAllTasksCompleted(projectId);
    if (allComplete) {
      const projectName = await getProjectName(projectId);
      await notifyAdminsProjectComplete(projectId, projectName);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
}
