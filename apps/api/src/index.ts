import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { listProjects, getProject, createProject, updateProject } from "./handlers/projects.js";
import { listTasks, createTask, updateTask } from "./handlers/tasks.js";
import { listMembers, addMember, deleteMember } from "./handlers/team.js";
import { 
  register, login, verifyOTP, logout, getMe, 
  listUsers, approveUser, updateUserRole, deleteUser,
  googleAuthUrl, googleCallback
} from "./handlers/auth.js";
import { listMessages, createMessage, deleteMessage } from "./handlers/discussions.js";

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;
  const pathParams = event.pathParameters ?? {};
  const body = event.body ?? "{}";
  const headers = event.headers ?? {};
  const token = headers.authorization?.replace("Bearer ", "") ?? "";
  const queryParams = event.queryStringParameters ?? {};

  try {
    // ===== AUTH ROUTES =====
    if (method === "POST" && path === "/auth/register") {
      return await register({ body });
    }
    if (method === "POST" && path === "/auth/login") {
      return await login({ body });
    }
    if (method === "POST" && path === "/auth/verify-otp") {
      return await verifyOTP({ body });
    }
    if (method === "POST" && path === "/auth/logout") {
      return await logout(token);
    }
    if (method === "GET" && path === "/auth/me") {
      return await getMe(token);
    }
    if (method === "GET" && path === "/auth/google") {
      return googleAuthUrl();
    }
    if (method === "GET" && path === "/auth/google/callback") {
      return await googleCallback(queryParams.code ?? "");
    }


    // ===== USERS ROUTES =====
    if (method === "GET" && path === "/users") {
      return await listUsers();
    }
    if (method === "DELETE" && path.startsWith("/users/") && pathParams.userId) {
      return await deleteUser(pathParams.userId);
    }
    if (method === "PATCH" && path.includes("/approve") && pathParams.userId) {
      const data = JSON.parse(body);
      return await approveUser(pathParams.userId, data.role);
    }
    if (method === "PATCH" && path.includes("/role") && pathParams.userId) {
      const data = JSON.parse(body);
      return await updateUserRole(pathParams.userId, data.role);
    }

    // ===== PROJECT ROUTES =====
    if (method === "GET" && path === "/projects") {
      return await listProjects();
    }
    if (method === "POST" && path === "/projects") {
      return await createProject({ body });
    }
    if (method === "GET" && pathParams.projectId && !path.includes("/tasks")) {
      return await getProject(pathParams.projectId);
    }
    if (method === "PATCH" && pathParams.projectId && !pathParams.taskId && !path.includes("/users")) {
      return await updateProject(pathParams.projectId, { body });
    }
    if (method === "GET" && pathParams.projectId && path.includes("/tasks")) {
      return await listTasks(pathParams.projectId);
    }

    // ===== TASK ROUTES =====
    if (method === "POST" && path === "/tasks") {
      return await createTask({ body });
    }
    if (method === "PATCH" && pathParams.projectId && pathParams.taskId) {
      return await updateTask(pathParams.projectId, pathParams.taskId, { body });
    }


    // ===== TEAM ROUTES =====
    if (method === "GET" && path === "/team") {
      return await listMembers();
    }
    if (method === "POST" && path === "/team") {
      return await addMember({ body });
    }
    if (method === "DELETE" && path.startsWith("/team/") && pathParams.memberId) {
      return await deleteMember(pathParams.memberId);
    }

    // ===== DISCUSSIONS ROUTES =====
    if (method === "GET" && path === "/discussions") {
      return await listMessages();
    }
    if (method === "POST" && path === "/discussions") {
      return await createMessage({ body });
    }
    if (method === "DELETE" && path.startsWith("/discussions/") && pathParams.messageId) {
      return await deleteMessage(pathParams.messageId);
    }

    return { statusCode: 404, body: JSON.stringify({ error: "Not found" }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal server error" }) };
  }
}