import { ScanCommand, PutCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../lib/ddb.js";
import { randomUUID, randomInt, createHash } from "crypto";

const table = process.env.USERS_TABLE!;
const SESSION_DURATION_DAYS = 30; // Sessions last 30 days

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

function generateOTP(): string {
  return randomInt(100000, 999999).toString();
}

function getSessionExpiry(): string {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + SESSION_DURATION_DAYS);
  return expiry.toISOString();
}

export async function register(event: { body: string }) {
  const body = JSON.parse(event.body);
  if (!body.email || !body.password || !body.name) {
    return { statusCode: 400, body: JSON.stringify({ error: "email, password, and name are required" }) };
  }

  const existing = await ddb.send(new ScanCommand({
    TableName: table,
    FilterExpression: "email = :email",
    ExpressionAttributeValues: { ":email": body.email },
  }));

  if (existing.Items && existing.Items.length > 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "User already exists" }) };
  }

  const allUsers = await ddb.send(new ScanCommand({ TableName: table }));
  const isFirstUser = !allUsers.Items || allUsers.Items.length === 0;

  const now = new Date().toISOString();
  const user = {
    userId: randomUUID(),
    email: body.email,
    name: body.name,
    password: hashPassword(body.password),
    role: isFirstUser ? "Admin" : "Pending",
    status: isFirstUser ? "active" : "pending",
    createdAt: now,
  };

  await ddb.send(new PutCommand({ TableName: table, Item: user }));

  const { password: _, ...safeUser } = user;
  return { statusCode: 201, body: JSON.stringify(safeUser) };
}

// Step 1: Validate credentials and send OTP
export async function login(event: { body: string }) {
  const body = JSON.parse(event.body);
  if (!body.email || !body.password) {
    return { statusCode: 400, body: JSON.stringify({ error: "email and password are required" }) };
  }

  const result = await ddb.send(new ScanCommand({
    TableName: table,
    FilterExpression: "email = :email",
    ExpressionAttributeValues: { ":email": body.email },
  }));

  if (!result.Items || result.Items.length === 0) {
    return { statusCode: 401, body: JSON.stringify({ error: "Invalid credentials" }) };
  }

  const user = result.Items[0];
  if (user.password !== hashPassword(body.password)) {
    return { statusCode: 401, body: JSON.stringify({ error: "Invalid credentials" }) };
  }

  if (user.status !== "active") {
    return { statusCode: 403, body: JSON.stringify({ error: "Account pending approval" }) };
  }

  // Generate OTP and store it with expiry (5 minutes)
  const otp = generateOTP();
  const otpExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  await ddb.send(new UpdateCommand({
    TableName: table,
    Key: { userId: user.userId },
    UpdateExpression: "SET otp = :otp, otpExpiry = :otpExpiry",
    ExpressionAttributeValues: { ":otp": otp, ":otpExpiry": otpExpiry },
  }));

  // In production, send email via SES. For local dev, log to console
  console.log(`\n========================================`);
  console.log(`OTP for ${user.email}: ${otp}`);
  console.log(`========================================\n`);

  return { 
    statusCode: 200, 
    body: JSON.stringify({ 
      requiresOTP: true, 
      userId: user.userId,
      message: "OTP sent to your email" 
    }) 
  };
}

// Step 2: Verify OTP and complete login
export async function verifyOTP(event: { body: string }) {
  const body = JSON.parse(event.body);
  if (!body.userId || !body.otp) {
    return { statusCode: 400, body: JSON.stringify({ error: "userId and otp are required" }) };
  }

  const result = await ddb.send(new ScanCommand({
    TableName: table,
    FilterExpression: "userId = :userId",
    ExpressionAttributeValues: { ":userId": body.userId },
  }));

  if (!result.Items || result.Items.length === 0) {
    return { statusCode: 401, body: JSON.stringify({ error: "Invalid user" }) };
  }

  const user = result.Items[0];

  // Check OTP
  if (!user.otp || user.otp !== body.otp) {
    return { statusCode: 401, body: JSON.stringify({ error: "Invalid OTP" }) };
  }

  // Check OTP expiry
  if (new Date(user.otpExpiry) < new Date()) {
    return { statusCode: 401, body: JSON.stringify({ error: "OTP expired" }) };
  }

  // Generate session token with expiry
  const token = randomUUID();
  const tokenExpiry = getSessionExpiry();
  const lastLogin = new Date().toISOString();

  await ddb.send(new UpdateCommand({
    TableName: table,
    Key: { userId: user.userId },
    UpdateExpression: "SET #token = :token, tokenExpiry = :tokenExpiry, lastLogin = :lastLogin REMOVE otp, otpExpiry",
    ExpressionAttributeNames: { "#token": "token" },
    ExpressionAttributeValues: { ":token": token, ":tokenExpiry": tokenExpiry, ":lastLogin": lastLogin },
  }));

  const { password: _, otp: __, otpExpiry: ___, ...safeUser } = user;
  return { statusCode: 200, body: JSON.stringify({ ...safeUser, token }) };
}

export async function validateToken(token: string) {
  const result = await ddb.send(new ScanCommand({
    TableName: table,
    FilterExpression: "#token = :token",
    ExpressionAttributeNames: { "#token": "token" },
    ExpressionAttributeValues: { ":token": token },
  }));

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  const user = result.Items[0];

  // Check token expiry
  if (user.tokenExpiry && new Date(user.tokenExpiry) < new Date()) {
    // Token expired, remove it
    await ddb.send(new UpdateCommand({
      TableName: table,
      Key: { userId: user.userId },
      UpdateExpression: "REMOVE #token, tokenExpiry",
      ExpressionAttributeNames: { "#token": "token" },
    }));
    return null;
  }

  const { password: _, token: __, otp: ___, otpExpiry: ____, ...safeUser } = user;
  return safeUser;
}

export async function getMe(token: string) {
  const user = await validateToken(token);
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: "Invalid token" }) };
  }
  return { statusCode: 200, body: JSON.stringify(user) };
}

export async function listUsers() {
  const result = await ddb.send(new ScanCommand({ TableName: table }));
  const users = (result.Items ?? []).map(({ password, token, otp, otpExpiry, tokenExpiry, ...user }) => user);
  return { statusCode: 200, body: JSON.stringify(users) };
}

export async function approveUser(userId: string, role: string) {
  await ddb.send(new UpdateCommand({
    TableName: table,
    Key: { userId },
    UpdateExpression: "SET #role = :role, #status = :status",
    ExpressionAttributeNames: { "#role": "role", "#status": "status" },
    ExpressionAttributeValues: { ":role": role, ":status": "active" },
  }));
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
}

export async function updateUserRole(userId: string, role: string) {
  await ddb.send(new UpdateCommand({
    TableName: table,
    Key: { userId },
    UpdateExpression: "SET #role = :role",
    ExpressionAttributeNames: { "#role": "role" },
    ExpressionAttributeValues: { ":role": role },
  }));
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
}

export async function deleteUser(userId: string) {
  await ddb.send(new DeleteCommand({ TableName: table, Key: { userId } }));
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
}

export async function logout(token: string) {
  const user = await validateToken(token);
  if (!user) {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }
  
  await ddb.send(new UpdateCommand({
    TableName: table,
    Key: { userId: user.userId },
    UpdateExpression: "REMOVE #token, tokenExpiry",
    ExpressionAttributeNames: { "#token": "token" },
  }));
  
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
}


// Google OAuth Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:4001/auth/google/callback";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

export function googleAuthUrl() {
  if (!GOOGLE_CLIENT_ID) {
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: "Google OAuth not configured. Set GOOGLE_CLIENT_ID in .env.local" }) 
    };
  }
  
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
  });
  
  return {
    statusCode: 302,
    headers: { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` },
    body: "",
  };
}

export async function googleCallback(code: string) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return { statusCode: 500, body: JSON.stringify({ error: "Google OAuth not configured" }) };
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      return { statusCode: 302, headers: { Location: `${FRONTEND_URL}?error=google_auth_failed` }, body: "" };
    }

    // Get user info
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const googleUser = await userRes.json();

    // Check if user exists
    const existing = await ddb.send(new ScanCommand({
      TableName: table,
      FilterExpression: "email = :email",
      ExpressionAttributeValues: { ":email": googleUser.email },
    }));

    let user;
    if (existing.Items && existing.Items.length > 0) {
      user = existing.Items[0];
      if (user.status !== "active") {
        return { statusCode: 302, headers: { Location: `${FRONTEND_URL}?error=pending_approval` }, body: "" };
      }
    } else {
      // Create new user
      const allUsers = await ddb.send(new ScanCommand({ TableName: table }));
      const isFirstUser = !allUsers.Items || allUsers.Items.length === 0;

      user = {
        userId: randomUUID(),
        email: googleUser.email,
        name: googleUser.name || googleUser.email.split("@")[0],
        password: "", // No password for Google users
        role: isFirstUser ? "Admin" : "Pending",
        status: isFirstUser ? "active" : "pending",
        googleId: googleUser.id,
        createdAt: new Date().toISOString(),
      };

      await ddb.send(new PutCommand({ TableName: table, Item: user }));

      if (!isFirstUser) {
        return { statusCode: 302, headers: { Location: `${FRONTEND_URL}?error=pending_approval` }, body: "" };
      }
    }

    // Generate session token (skip OTP for Google SSO)
    const token = randomUUID();
    const tokenExpiry = getSessionExpiry();
    const lastLogin = new Date().toISOString();

    await ddb.send(new UpdateCommand({
      TableName: table,
      Key: { userId: user.userId },
      UpdateExpression: "SET #token = :token, tokenExpiry = :tokenExpiry, lastLogin = :lastLogin",
      ExpressionAttributeNames: { "#token": "token" },
      ExpressionAttributeValues: { ":token": token, ":tokenExpiry": tokenExpiry, ":lastLogin": lastLogin },
    }));

    // Redirect to frontend with token
    return { 
      statusCode: 302, 
      headers: { Location: `${FRONTEND_URL}?token=${token}` }, 
      body: "" 
    };
  } catch (err) {
    console.error("Google OAuth error:", err);
    return { statusCode: 302, headers: { Location: `${FRONTEND_URL}?error=google_auth_failed` }, body: "" };
  }
}
