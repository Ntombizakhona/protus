import { config } from "dotenv";
config({ path: ".env.local" });
import http from "node:http";
import { listProjects, getProject, createProject, updateProject } from "./handlers/projects.js";
import { listTasks, createTask, updateTask } from "./handlers/tasks.js";
import { listMembers, addMember, deleteMember } from "./handlers/team.js";
import { register, login, verifyOTP, getMe, listUsers, approveUser, updateUserRole, deleteUser, logout, validateToken, googleAuthUrl, googleCallback } from "./handlers/auth.js";
import { listMessages, createMessage, deleteMessage } from "./handlers/discussions.js";

const PORT = parseInt(process.env.API_LOCAL_PORT ?? "4001");

function parseUrl(url: string) {
  // Strip query parameters before parsing path
  const pathOnly = url.split("?")[0];
  const parts = pathOnly.split("/").filter(Boolean);
  return { parts, path: "/" + parts.join("/") };
}

http
  .createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      const event = { body };
      const { parts } = parseUrl(req.url ?? "/");
      let out = { statusCode: 404, body: JSON.stringify({ error: "Not found" }) };

      try {
        // GET /projects
        if (req.method === "GET" && parts[0] === "projects" && !parts[1]) {
          out = await listProjects();
        }
        // POST /projects
        else if (req.method === "POST" && parts[0] === "projects" && !parts[1]) {
          out = await createProject(event);
        }
        // GET /projects/:id
        else if (req.method === "GET" && parts[0] === "projects" && parts[1] && !parts[2]) {
          out = await getProject(parts[1]);
        }
        // PATCH /projects/:id
        else if (req.method === "PATCH" && parts[0] === "projects" && parts[1] && !parts[2]) {
          out = await updateProject(parts[1], event);
        }
        // GET /projects/:id/tasks
        else if (req.method === "GET" && parts[0] === "projects" && parts[1] && parts[2] === "tasks") {
          out = await listTasks(parts[1]);
        }
        // POST /tasks
        else if (req.method === "POST" && parts[0] === "tasks" && !parts[1]) {
          out = await createTask(event);
        }
        // PATCH /tasks/:projectId/:taskId
        else if (req.method === "PATCH" && parts[0] === "tasks" && parts[1] && parts[2]) {
          out = await updateTask(parts[1], parts[2], event);
        }
        // GET /team
        else if (req.method === "GET" && parts[0] === "team" && !parts[1]) {
          out = await listMembers();
        }
        // POST /team
        else if (req.method === "POST" && parts[0] === "team" && !parts[1]) {
          out = await addMember(event);
        }
        // DELETE /team/:memberId
        else if (req.method === "DELETE" && parts[0] === "team" && parts[1]) {
          out = await deleteMember(parts[1]);
        }
        // POST /auth/register
        else if (req.method === "POST" && parts[0] === "auth" && parts[1] === "register") {
          out = await register(event);
        }
        // POST /auth/login
        else if (req.method === "POST" && parts[0] === "auth" && parts[1] === "login") {
          out = await login(event);
        }
        // POST /auth/verify-otp
        else if (req.method === "POST" && parts[0] === "auth" && parts[1] === "verify-otp") {
          out = await verifyOTP(event);
        }
        // GET /auth/google - Start Google OAuth
        else if (req.method === "GET" && parts[0] === "auth" && parts[1] === "google" && !parts[2]) {
          out = googleAuthUrl();
        }
        // GET /auth/google/callback - Google OAuth callback
        else if (req.method === "GET" && parts[0] === "auth" && parts[1] === "google" && parts[2] === "callback") {
          const url = new URL(req.url ?? "", `http://localhost:${PORT}`);
          const code = url.searchParams.get("code") ?? "";
          out = await googleCallback(code);
        }
        // GET /auth/me
        else if (req.method === "GET" && parts[0] === "auth" && parts[1] === "me") {
          const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
          out = await getMe(token);
        }
        // POST /auth/logout
        else if (req.method === "POST" && parts[0] === "auth" && parts[1] === "logout") {
          const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
          out = await logout(token);
        }
        // GET /users (admin only)
        else if (req.method === "GET" && parts[0] === "users" && !parts[1]) {
          out = await listUsers();
        }
        // PATCH /users/:userId/approve
        else if (req.method === "PATCH" && parts[0] === "users" && parts[1] && parts[2] === "approve") {
          const body = JSON.parse(event.body);
          out = await approveUser(parts[1], body.role);
        }
        // PATCH /users/:userId/role
        else if (req.method === "PATCH" && parts[0] === "users" && parts[1] && parts[2] === "role") {
          const body = JSON.parse(event.body);
          out = await updateUserRole(parts[1], body.role);
        }
        // DELETE /users/:userId
        else if (req.method === "DELETE" && parts[0] === "users" && parts[1]) {
          out = await deleteUser(parts[1]);
        }
        // GET /discussions
        else if (req.method === "GET" && parts[0] === "discussions" && !parts[1]) {
          const url = new URL(req.url ?? "", `http://localhost:${PORT}`);
          const projectId = url.searchParams.get("projectId") ?? undefined;
          out = await listMessages(projectId);
        }
        // POST /discussions
        else if (req.method === "POST" && parts[0] === "discussions" && !parts[1]) {
          out = await createMessage(event);
        }
        // DELETE /discussions/:messageId
        else if (req.method === "DELETE" && parts[0] === "discussions" && parts[1]) {
          out = await deleteMessage(parts[1]);
        }
      } catch (err) {
        console.error(err);
        out = { statusCode: 500, body: JSON.stringify({ error: "Internal server error" }) };
      }

      // Handle redirects (302) with Location header
      if (out.statusCode === 302 && (out as any).headers?.Location) {
        res.writeHead(302, { Location: (out as any).headers.Location });
        res.end();
      } else {
        res.writeHead(out.statusCode, { "Content-Type": "application/json" });
        res.end(out.body);
      }
    });
  })
  .listen(PORT, () => console.log(`Protus API running on :${PORT}`));
