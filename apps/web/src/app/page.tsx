"use client";

import { useEffect, useState } from "react";
import "./globals.css";

interface User {
  userId: string;
  email: string;
  name: string;
  role: string;
  status: string;
  token?: string;
  lastLogin?: string;
}

interface Project {
  projectId: string;
  name: string;
  status: string;
  owner: string | null;
}

interface Task {
  taskId: string;
  projectId: string;
  title: string;
  status: string;
  priority: string;
  assignee: string | null;
  dueDate: string | null;
}

interface TeamMember {
  memberId: string;
  name: string;
  email: string;
  role: string;
}

interface Message {
  messageId: string;
  projectId: string | null;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
}

const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4001";

export default function Home() {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register" | "otp">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");

  // App state
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("medium");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("Contributor");
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [viewingProfile, setViewingProfile] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [activeView, setActiveView] = useState<"dashboard" | "projects" | "tasks" | "team" | "settings" | "employees" | "discussions" | "calendar">("dashboard");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [notifications, setNotifications] = useState({ email: true, push: false, taskUpdates: true, projectUpdates: true });
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [profile, setProfile] = useState({ name: "User", email: "user@example.com", avatar: "", linkedin: "", github: "", twitter: "" });

  const isAdmin = user?.role === "Admin";
  const canCompleteTasks = true; // All employees can mark tasks as done
  const canCloseProject = isAdmin; // Only admins can close projects

  function formatLastLogin(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  // Check for existing session on mount
  useEffect(() => {
    // Check for Google OAuth callback token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get("token");
    const urlError = urlParams.get("error");
    
    if (urlError) {
      if (urlError === "pending_approval") {
        setAuthError("Account created! Waiting for admin approval.");
      } else {
        setAuthError("Google sign-in failed. Please try again.");
      }
      window.history.replaceState({}, "", window.location.pathname);
      setAuthLoading(false);
      return;
    }
    
    if (urlToken) {
      localStorage.setItem("protus_token", urlToken);
      window.history.replaceState({}, "", window.location.pathname);
      fetchMe(urlToken);
      return;
    }
    
    const token = localStorage.getItem("protus_token");
    if (token) {
      fetchMe(token);
    } else {
      setAuthLoading(false);
    }
    // Load saved theme
    const savedTheme = localStorage.getItem("protus_theme") as "light" | "dark" | null;
    if (savedTheme) {
      setTheme(savedTheme);
    }
    // Load saved profile
    const savedProfile = localStorage.getItem("protus_profile");
    if (savedProfile) {
      try {
        const parsed = JSON.parse(savedProfile);
        setProfile(prev => ({ ...prev, ...parsed }));
      } catch (e) {}
    }
  }, []);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("protus_theme", theme);
  }, [theme]);

  useEffect(() => {
    if (user) {
      fetchProjects();
      fetchAllTasks();
      fetchMessages();
      fetchUsers(); // All users can view profiles
      if (isAdmin) {
        fetchTeam();
      }
    }
  }, [user]);

  useEffect(() => {
    if (selectedProject) fetchTasks(selectedProject);
    else setTasks([]);
  }, [selectedProject]);

  async function fetchMe(token: string) {
    try {
      const res = await fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser({ ...data, token });
        setProfile(prev => ({ ...prev, name: data.name, email: data.email }));
      } else {
        localStorage.removeItem("protus_token");
      }
    } catch (err) {
      console.error("Failed to fetch user:", err);
    }
    setAuthLoading(false);
  }

  async function handleLogin() {
    setAuthError("");
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || "Login failed");
        return;
      }
      if (data.requiresOTP) {
        setPendingUserId(data.userId);
        setAuthMode("otp");
        setAuthError("Check your email for the OTP code (check API console for local dev)");
      } else {
        localStorage.setItem("protus_token", data.token);
        setUser(data);
        setProfile(prev => ({ ...prev, name: data.name, email: data.email }));
      }
    } catch (err) {
      setAuthError("Connection failed");
    }
  }

  async function handleVerifyOTP() {
    setAuthError("");
    if (!pendingUserId || !otpCode) {
      setAuthError("Please enter the OTP code");
      return;
    }
    try {
      const res = await fetch(`${API}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: pendingUserId, otp: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || "Invalid OTP");
        return;
      }
      localStorage.setItem("protus_token", data.token);
      setUser(data);
      setProfile(prev => ({ ...prev, name: data.name, email: data.email }));
      setOtpCode("");
      setPendingUserId(null);
    } catch (err) {
      setAuthError("Connection failed");
    }
  }

  async function handleRegister() {
    setAuthError("");
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail, password: authPassword, name: authName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || "Registration failed");
        return;
      }
      if (data.status === "pending") {
        setAuthError("Account created! Waiting for admin approval.");
        setAuthMode("login");
      } else {
        // First user becomes admin and is auto-logged in
        localStorage.setItem("protus_token", data.token || "");
        setUser(data);
      }
    } catch (err) {
      setAuthError("Connection failed");
    }
  }

  async function handleLogout() {
    const token = localStorage.getItem("protus_token");
    if (token) {
      try {
        await fetch(`${API}/auth/logout`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}` 
          },
        });
      } catch (err) {
        console.error("Logout error:", err);
      }
    }
    localStorage.removeItem("protus_token");
    setUser(null);
    setProjects([]);
    setTasks([]);
    setAllTasks([]);
    setTeam([]);
    setUsers([]);
    setSelectedProject(null);
    setActiveView("dashboard");
    setAuthMode("login");
    setAuthEmail("");
    setAuthPassword("");
    setOtpCode("");
    setPendingUserId(null);
  }

  async function fetchProjects() {
    try {
      const res = await fetch(`${API}/projects`);
      const data = await res.json();
      setProjects(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError("Unable to connect to API");
      setProjects([]);
    }
  }

  async function fetchTasks(projectId: string) {
    try {
      const res = await fetch(`${API}/projects/${projectId}/tasks`);
      const data = await res.json();
      setTasks(Array.isArray(data) ? data : []);
    } catch (err) {
      setTasks([]);
    }
  }

  async function fetchAllTasks() {
    // Fetch tasks from all projects for the current user
    try {
      const projectsRes = await fetch(`${API}/projects`);
      const projectsData = await projectsRes.json();
      const allProjects = Array.isArray(projectsData) ? projectsData : [];
      
      const allTasksArr: Task[] = [];
      for (const project of allProjects) {
        const res = await fetch(`${API}/projects/${project.projectId}/tasks`);
        const data = await res.json();
        if (Array.isArray(data)) {
          allTasksArr.push(...data);
        }
      }
      setAllTasks(allTasksArr);
    } catch (err) {
      setAllTasks([]);
    }
  }

  async function fetchTeam() {
    try {
      const res = await fetch(`${API}/team`);
      const data = await res.json();
      setTeam(Array.isArray(data) ? data : []);
    } catch (err) {
      setTeam([]);
    }
  }

  async function fetchUsers() {
    try {
      const res = await fetch(`${API}/users`);
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setUsers([]);
    }
  }

  async function fetchMessages() {
    try {
      const res = await fetch(`${API}/discussions`);
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
    } catch (err) {
      setMessages([]);
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || !user) return;
    await fetch(`${API}/discussions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: newMessage,
        userId: user.userId,
        userName: user.name,
        projectId: null,
      }),
    });
    setNewMessage("");
    fetchMessages();
  }

  async function deleteMessageById(messageId: string) {
    await fetch(`${API}/discussions/${messageId}`, { method: "DELETE" });
    fetchMessages();
  }

  async function createProject() {
    if (!newProjectName.trim()) return;
    await fetch(`${API}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newProjectName }),
    });
    setNewProjectName("");
    setShowModal(false);
    fetchProjects();
  }

  async function closeProject(projectId: string) {
    if (!canCloseProject) {
      alert("Only admins can close projects");
      return;
    }
    if (!confirm("Are you sure you want to close this project?")) return;
    await fetch(`${API}/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    fetchProjects();
  }

  async function createTask() {
    if (!newTaskTitle.trim() || !selectedProject) return;
    await fetch(`${API}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: selectedProject,
        title: newTaskTitle,
        priority: newTaskPriority,
        assignee: newTaskAssignee || null,
        dueDate: newTaskDueDate || null,
      }),
    });
    setNewTaskTitle("");
    setNewTaskPriority("medium");
    setNewTaskAssignee("");
    setNewTaskDueDate("");
    fetchTasks(selectedProject);
  }

  async function updateTaskStatus(projectId: string, taskId: string, status: string) {
    // Only admin can mark as done
    if (status === "done" && !canCompleteTasks) {
      alert("Only admins can mark tasks as complete");
      return;
    }
    await fetch(`${API}/tasks/${projectId}/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchTasks(projectId);
  }

  async function addTeamMember() {
    if (!newMemberName.trim() || !newMemberEmail.trim()) return;
    await fetch(`${API}/team`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newMemberName, email: newMemberEmail, role: newMemberRole }),
    });
    setNewMemberName("");
    setNewMemberEmail("");
    setNewMemberRole("Contributor");
    setShowTeamModal(false);
    fetchTeam();
  }

  async function removeTeamMember(memberId: string) {
    await fetch(`${API}/team/${memberId}`, { method: "DELETE" });
    fetchTeam();
  }

  async function approveUser(userId: string, role: string) {
    await fetch(`${API}/users/${userId}/approve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    fetchUsers();
  }

  async function updateUserRole(userId: string, role: string) {
    await fetch(`${API}/users/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    fetchUsers();
  }

  async function deleteUserAccount(userId: string) {
    if (!confirm("Are you sure you want to delete this user?")) return;
    await fetch(`${API}/users/${userId}`, { method: "DELETE" });
    fetchUsers();
  }

  const selectedProjectData = projects.find((p) => p.projectId === selectedProject);
  const todoCount = tasks.filter((t) => t.status === "todo").length;
  const inProgressCount = tasks.filter((t) => t.status === "in-progress").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const pendingUsers = users.filter((u) => u.status === "pending");
  const myTasks = allTasks.filter((t) => t.assignee === user?.email || t.assignee === user?.name);
  const myProjectIds = [...new Set(myTasks.map(t => t.projectId))];
  const myProjects = projects.filter(p => myProjectIds.includes(p.projectId));

  if (authLoading) {
    return (
      <div className="auth-loading">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  // Login/Register Screen
  if (!user) {
    return (
      <div className="auth-container">
        <div className="auth-bg-right">TUS</div>
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-logo">📋</div>
            <h1>Protus</h1>
            <p>Project Management</p>
          </div>

          {authMode !== "otp" && (
            <div className="auth-tabs">
              <button className={`auth-tab ${authMode === "login" ? "active" : ""}`} onClick={() => { setAuthMode("login"); setAuthError(""); }}>
                Login
              </button>
              <button className={`auth-tab ${authMode === "register" ? "active" : ""}`} onClick={() => { setAuthMode("register"); setAuthError(""); }}>
                Register
              </button>
            </div>
          )}

          {authError && <div className="auth-error">{authError}</div>}

          {authMode === "otp" ? (
            <div className="auth-form">
              <div className="auth-field">
                <label>Enter OTP Code</label>
                <input
                  type="text"
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && handleVerifyOTP()}
                  autoFocus
                  style={{ textAlign: "center", fontSize: 24, letterSpacing: 8 }}
                />
              </div>
              <button className="auth-submit" onClick={handleVerifyOTP}>
                Verify OTP
              </button>
              <button className="auth-back" onClick={() => { setAuthMode("login"); setOtpCode(""); setPendingUserId(null); setAuthError(""); }}>
                ← Back to Login
              </button>
            </div>
          ) : (
            <div className="auth-form">
              {authMode === "register" && (
                <div className="auth-field">
                  <label>Name</label>
                  <input
                    type="text"
                    placeholder="Your name"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                  />
                </div>
              )}
              <div className="auth-field">
                <label>Email</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
              </div>
              <div className="auth-field">
                <label>Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (authMode === "login" ? handleLogin() : handleRegister())}
                />
              </div>
              <button className="auth-submit" onClick={authMode === "login" ? handleLogin : handleRegister}>
                {authMode === "login" ? "Sign In" : "Create Account"}
              </button>
              
              <div className="auth-divider">
                <span>or</span>
              </div>
              
              <button className="auth-google" onClick={() => window.location.href = `${API}/auth/google`}>
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
            </div>
          )}

          <p className="auth-hint">
            {authMode === "otp" ? "Check your email for the verification code" : 
             authMode === "login" ? "First user becomes admin automatically" : "New accounts require admin approval"}
          </p>
        </div>
      </div>
    );
  }

  // Main App
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">📋</div>
            <span className="sidebar-logo-text">Protus</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-section-title">Main</div>
            <div className={`nav-item ${activeView === "dashboard" ? "active" : ""}`} onClick={() => setActiveView("dashboard")}>
              <span className="nav-item-icon">📊</span>
              <span>Dashboard</span>
            </div>
            <div className={`nav-item ${activeView === "projects" ? "active" : ""}`} onClick={() => setActiveView("projects")}>
              <span className="nav-item-icon">📁</span>
              <span>Projects</span>
              <span className="nav-item-badge">{isAdmin ? projects.length : myProjects.length}</span>
            </div>
            <div className={`nav-item ${activeView === "tasks" ? "active" : ""}`} onClick={() => setActiveView("tasks")}>
              <span className="nav-item-icon">✅</span>
              <span>My Tasks</span>
              <span className="nav-item-badge">{myTasks.length}</span>
            </div>
            <div className={`nav-item ${activeView === "calendar" ? "active" : ""}`} onClick={() => setActiveView("calendar")}>
              <span className="nav-item-icon">📅</span>
              <span>Calendar</span>
            </div>
            <div className={`nav-item ${activeView === "discussions" ? "active" : ""}`} onClick={() => setActiveView("discussions")}>
              <span className="nav-item-icon">💬</span>
              <span>Discussions</span>
              <span className="nav-item-badge">{messages.length}</span>
            </div>
          </div>
          {isAdmin && (
            <div className="nav-section">
              <div className="nav-section-title">Management</div>
              <div className={`nav-item ${activeView === "team" ? "active" : ""}`} onClick={() => setActiveView("team")}>
                <span className="nav-item-icon">👥</span>
                <span>Team</span>
                <span className="nav-item-badge">{team.length}</span>
              </div>
              <div className={`nav-item ${activeView === "employees" ? "active" : ""}`} onClick={() => setActiveView("employees")}>
                <span className="nav-item-icon">🔐</span>
                <span>Employees</span>
                {pendingUsers.length > 0 && <span className="nav-item-badge warning">{pendingUsers.length}</span>}
              </div>
            </div>
          )}
          <div className="nav-section">
            <div className="nav-section-title">Account</div>
            <div className={`nav-item ${activeView === "settings" ? "active" : ""}`} onClick={() => setActiveView("settings")}>
              <span className="nav-item-icon">⚙️</span>
              <span>Settings</span>
            </div>
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{user.name.charAt(0).toUpperCase()}</div>
            <div className="user-details">
              <div className="user-name">{user.name}</div>
              <div className="user-role">{user.role}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <h1 className="topbar-title">
            {activeView === "dashboard" && "Dashboard"}
            {activeView === "projects" && "Projects"}
            {activeView === "tasks" && "Tasks"}
            {activeView === "team" && "Team"}
            {activeView === "employees" && "Employee Management"}
            {activeView === "discussions" && "Discussions"}
            {activeView === "calendar" && "Calendar"}
            {activeView === "settings" && "Settings"}
          </h1>
          <div className="topbar-actions">
            <button className="notification-bell" title="Notifications">
              🔔
              {pendingUsers.length > 0 && <span className="notification-badge">{pendingUsers.length}</span>}
            </button>
            {activeView === "team" && isAdmin && (
              <button className="btn" onClick={() => setShowTeamModal(true)}>+ Add Member</button>
            )}
            {(activeView === "dashboard" || activeView === "projects") && isAdmin && (
              <button className="btn" onClick={() => setShowModal(true)}>+ New Project</button>
            )}
          </div>
        </header>

        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Create New Project</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
              </div>
              <div className="modal-body">
                <label className="form-label">Project Name</label>
                <input type="text" className="input" placeholder="Enter project name..." value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createProject()} autoFocus />
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn" onClick={createProject}>Create Project</button>
              </div>
            </div>
          </div>
        )}

        {showTeamModal && (
          <div className="modal-overlay" onClick={() => setShowTeamModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Add Team Member</h2>
                <button className="modal-close" onClick={() => setShowTeamModal(false)}>×</button>
              </div>
              <div className="modal-body">
                <label className="form-label">Name</label>
                <input type="text" className="input" placeholder="Enter name..." value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)} style={{ marginBottom: 16 }} autoFocus />
                <label className="form-label">Email</label>
                <input type="email" className="input" placeholder="Enter email..." value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)} style={{ marginBottom: 16 }} />
                <label className="form-label">Role</label>
                <select className="select" value={newMemberRole} onChange={(e) => setNewMemberRole(e.target.value)} style={{ width: "100%" }}>
                  <option value="Admin">Admin</option>
                  <option value="Project Manager">Project Manager</option>
                  <option value="Contributor">Contributor</option>
                  <option value="Viewer">Viewer</option>
                </select>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowTeamModal(false)}>Cancel</button>
                <button className="btn" onClick={addTeamMember}>Add Member</button>
              </div>
            </div>
          </div>
        )}

        {viewingProfile && (
          <div className="modal-overlay" onClick={() => setViewingProfile(null)}>
            <div className="modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Profile</h2>
                <button className="modal-close" onClick={() => setViewingProfile(null)}>×</button>
              </div>
              <div className="modal-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                  <div style={{ 
                    width: 80, height: 80, borderRadius: '50%', background: 'var(--accent)', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: 'white', fontWeight: 600 
                  }}>
                    {viewingProfile.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 600 }}>{viewingProfile.name}</div>
                    <div style={{ color: 'var(--text-secondary)' }}>{viewingProfile.email}</div>
                    <span className={`status-badge ${viewingProfile.role === "Admin" ? "status-active" : "status-pending"}`} style={{ marginTop: 8 }}>{viewingProfile.role}</span>
                  </div>
                </div>
                
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 12 }}>🔗 Social Links</div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" style={{ padding: '8px 16px', background: 'var(--bg-input)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', textDecoration: 'none', fontSize: 13, transition: 'background 0.15s' }} onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseOut={(e) => e.currentTarget.style.background = 'var(--bg-input)'}>🔗 LinkedIn</a>
                    <a href="https://github.com" target="_blank" rel="noopener noreferrer" style={{ padding: '8px 16px', background: 'var(--bg-input)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', textDecoration: 'none', fontSize: 13, transition: 'background 0.15s' }} onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseOut={(e) => e.currentTarget.style.background = 'var(--bg-input)'}>💻 GitHub</a>
                    <a href="https://x.com" target="_blank" rel="noopener noreferrer" style={{ padding: '8px 16px', background: 'var(--bg-input)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', textDecoration: 'none', fontSize: 13, transition: 'background 0.15s' }} onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseOut={(e) => e.currentTarget.style.background = 'var(--bg-input)'}>𝕏 Twitter</a>
                  </div>
                </div>

                {isAdmin && (
                  <>
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginBottom: 16 }}>
                      <div style={{ fontWeight: 600, marginBottom: 12 }}>📊 Activity</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Last Login</span>
                        <span>{viewingProfile.lastLogin ? formatLastLogin(viewingProfile.lastLogin) : 'Never'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Status</span>
                        <span className={`status-badge ${viewingProfile.status === "active" ? "status-active" : "status-pending"}`}>{viewingProfile.status}</span>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                      <div style={{ fontWeight: 600, marginBottom: 12 }}>📁 Assigned Projects</div>
                      {(() => {
                        const userTasks = allTasks.filter(t => t.assignee === viewingProfile.email || t.assignee === viewingProfile.name);
                        const userProjectIds = [...new Set(userTasks.map(t => t.projectId))];
                        const userProjects = projects.filter(p => userProjectIds.includes(p.projectId));
                        return userProjects.length === 0 ? (
                          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No projects assigned</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {userProjects.map(p => (
                              <div key={p.projectId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-input)', borderRadius: 'var(--radius)' }}>
                                <span>{p.name}</span>
                                <span className={`status-badge status-${p.status === "closed" ? "closed" : p.status === "active" ? "active" : "pending"}`}>{p.status}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setViewingProfile(null)}>Close</button>
              </div>
            </div>
          </div>
        )}

        <div className="content">
          {error && <div className="error-banner">⚠️ {error}</div>}

          {/* Dashboard View */}
          {activeView === "dashboard" && (
            <>
              <div className="stats-grid">
                <div className="stat-card stat-blue"><div className="stat-banner"></div><div className="stat-label">Active Projects</div><div className="stat-value">{isAdmin ? projects.filter(p => p.status === "active").length : myProjects.filter(p => p.status === "active").length}</div></div>
                <div className="stat-card stat-orange"><div className="stat-banner"></div><div className="stat-label">Closed Projects</div><div className="stat-value">{isAdmin ? projects.filter(p => p.status === "closed").length : myProjects.filter(p => p.status === "closed").length}</div></div>
                <div className="stat-card stat-purple"><div className="stat-banner"></div><div className="stat-label">In Progress</div><div className="stat-value">{isAdmin ? inProgressCount : myTasks.filter(t => t.status === "in-progress").length}</div></div>
                <div className="stat-card stat-green"><div className="stat-banner"></div><div className="stat-label">Completed Tasks</div><div className="stat-value">{isAdmin ? doneCount : myTasks.filter(t => t.status === "done").length}</div>{(isAdmin ? doneCount : myTasks.filter(t => t.status === "done").length) > 0 && <div className="stat-change">✓ On track</div>}</div>
              </div>
              <div className="grid-2">
                <div className="card">
                  <div className="card-header"><h2 className="card-title">{isAdmin ? "Projects" : "My Projects"}</h2></div>
                  <div className="card-body">
                    {isAdmin && (
                      <div className="input-group" style={{ marginBottom: 20 }}>
                        <input type="text" className="input" placeholder="Enter project name..." value={newProjectName}
                          onChange={(e) => setNewProjectName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createProject()} />
                        <button className="btn" onClick={createProject}>Add</button>
                      </div>
                    )}
                    {(isAdmin ? projects : myProjects).length === 0 ? (
                      <div className="empty-state">
                        <div className="empty-state-icon">📁</div>
                        <div className="empty-state-title">{isAdmin ? "No projects yet" : "No projects assigned"}</div>
                        <p className="empty-state-text">{isAdmin ? "Create your first project." : "You have no tasks assigned yet."}</p>
                      </div>
                    ) : (
                      <table className="table">
                        <thead><tr><th>Project Name</th><th>Status</th></tr></thead>
                        <tbody>
                          {(isAdmin ? projects : myProjects).map((p) => (
                            <tr key={p.projectId} className={`project-row ${selectedProject === p.projectId ? "selected" : ""}`}
                              onClick={() => setSelectedProject(p.projectId)}>
                              <td><div className="project-name">{p.name}</div><div className="project-id">{p.projectId.slice(0, 8)}</div></td>
                              <td><span className={`status-badge status-${p.status === "closed" ? "closed" : p.status === "active" ? "active" : "pending"}`}><span style={{ fontSize: 8 }}>●</span>{p.status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <h2 className="card-title">{selectedProjectData ? `Tasks — ${selectedProjectData.name}` : "Tasks"}</h2>
                    {selectedProject && <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{isAdmin ? tasks.length : tasks.filter(t => t.assignee === user?.email || t.assignee === user?.name).length} tasks</span>}
                  </div>
                  {selectedProject ? (
                    <>
                      {isAdmin && (
                        <div className="card-body" style={{ paddingBottom: 0 }}>
                          <div className="input-group">
                            <input type="text" className="input" placeholder="Enter task title..." value={newTaskTitle}
                              onChange={(e) => setNewTaskTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createTask()} />
                            <select className="select" value={newTaskPriority} onChange={(e) => setNewTaskPriority(e.target.value)}>
                              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                            </select>
                            <select className="select" value={newTaskAssignee} onChange={(e) => setNewTaskAssignee(e.target.value)}>
                              <option value="">Unassigned</option>
                              {users.filter(u => u.status === "active").map(u => <option key={u.userId} value={u.email}>{u.name}</option>)}
                            </select>
                            <input type="date" className="input" style={{ maxWidth: 150 }} value={newTaskDueDate} onChange={(e) => setNewTaskDueDate(e.target.value)} title="Due date" />
                            <button className="btn btn-yellow" onClick={createTask}>Add Task</button>
                          </div>
                        </div>
                      )}
                      {(isAdmin ? tasks : tasks.filter(t => t.assignee === user?.email || t.assignee === user?.name)).length === 0 ? (
                        <div className="empty-state"><div className="empty-state-icon">✅</div><div className="empty-state-title">{isAdmin ? "No tasks yet" : "No tasks assigned"}</div></div>
                      ) : (
                        <div className="task-list">
                          {(isAdmin ? tasks : tasks.filter(t => t.assignee === user?.email || t.assignee === user?.name)).map((t) => (
                            <div key={t.taskId} className="task-item">
                              <div className={`task-checkbox ${t.status === "done" ? "checked" : ""}`}
                                onClick={() => updateTaskStatus(t.projectId, t.taskId, t.status === "done" ? "todo" : "done")}>
                                {t.status === "done" && "✓"}
                              </div>
                              <div className="task-content">
                                <div className={`task-title ${t.status === "done" ? "completed" : ""}`}>{t.title}</div>
                                <div className="task-meta">
                                  <span className={`priority-${t.priority}`}>{t.priority} priority</span>
                                  {t.assignee && <span> • Assigned to: {t.assignee}</span>}
                                  {t.dueDate && <span> • 📅 {new Date(t.dueDate!).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</span>}
                                </div>
                              </div>
                              <select className="select" value={t.status} onChange={(e) => updateTaskStatus(t.projectId, t.taskId, e.target.value)}>
                                <option value="todo">To Do</option><option value="in-progress">In Progress</option>
                                <option value="done">Done</option>
                              </select>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="empty-state"><div className="empty-state-icon">👈</div><div className="empty-state-title">Select a project</div></div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Projects View */}
          {activeView === "projects" && (
            <div className="card">
              <div className="card-header"><h2 className="card-title">{isAdmin ? "All Projects" : "My Projects"}</h2></div>
              <div className="card-body">
                {isAdmin && (
                  <div className="input-group" style={{ marginBottom: 20 }}>
                    <input type="text" className="input" placeholder="Enter project name..." value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createProject()} />
                    <button className="btn" onClick={createProject}>Add Project</button>
                  </div>
                )}
                {(isAdmin ? projects : myProjects).length === 0 ? (
                  <div className="empty-state"><div className="empty-state-icon">📁</div><div className="empty-state-title">{isAdmin ? "No projects yet" : "No projects assigned to you"}</div></div>
                ) : (
                  <table className="table">
                    <thead><tr><th>Project Name</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                      {(isAdmin ? projects : myProjects).map((p) => (
                        <tr key={p.projectId} className="project-row">
                          <td onClick={() => { setSelectedProject(p.projectId); setActiveView("tasks"); }}><div className="project-name">{p.name}</div><div className="project-id">{p.projectId.slice(0, 8)}</div></td>
                          <td><span className={`status-badge status-${p.status === "closed" ? "closed" : p.status === "active" ? "active" : "pending"}`}><span style={{ fontSize: 8 }}>●</span>{p.status}</span></td>
                          <td>
                            <div className="action-buttons">
                              <button className="btn-link" onClick={() => { setSelectedProject(p.projectId); setActiveView("tasks"); }}>View Tasks</button>
                              {canCloseProject && p.status !== "closed" && (
                                <button className="btn-close" onClick={(e) => { e.stopPropagation(); closeProject(p.projectId); }}>Close</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Tasks View */}
          {activeView === "tasks" && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">{isAdmin ? "All Tasks" : "My Tasks"}</h2>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <select className="select-yellow" value={selectedProject || ""} onChange={(e) => setSelectedProject(e.target.value || null)}>
                    <option value="">Select a project...</option>
                    {(isAdmin ? projects : myProjects).map((p) => <option key={p.projectId} value={p.projectId}>{p.name}</option>)}
                  </select>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{isAdmin ? tasks.length : myTasks.filter(t => t.projectId === selectedProject).length} tasks</span>
                </div>
              </div>
              {selectedProject ? (
                <>
                  {isAdmin && (
                    <div className="card-body" style={{ paddingBottom: 0 }}>
                      <div className="input-group">
                        <input type="text" className="input" placeholder="Enter task title..." value={newTaskTitle}
                          onChange={(e) => setNewTaskTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createTask()} />
                        <select className="select" value={newTaskPriority} onChange={(e) => setNewTaskPriority(e.target.value)}>
                          <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                        </select>
                        <select className="select" value={newTaskAssignee} onChange={(e) => setNewTaskAssignee(e.target.value)}>
                          <option value="">Unassigned</option>
                          {users.filter(u => u.status === "active").map(u => <option key={u.userId} value={u.email}>{u.name}</option>)}
                        </select>
                        <input type="date" className="input" style={{ maxWidth: 150 }} value={newTaskDueDate} onChange={(e) => setNewTaskDueDate(e.target.value)} title="Due date" />
                        <button className="btn btn-yellow" onClick={createTask}>Add Task</button>
                      </div>
                    </div>
                  )}
                  {tasks.length === 0 ? (
                    <div className="empty-state"><div className="empty-state-icon">✅</div><div className="empty-state-title">{isAdmin ? "No tasks yet" : "No tasks assigned to you"}</div></div>
                  ) : (
                    <div className="task-list">
                      {(isAdmin ? tasks : tasks.filter(t => t.assignee === user?.email || t.assignee === user?.name)).map((t) => (
                        <div key={t.taskId} className="task-item">
                          <div className={`task-checkbox ${t.status === "done" ? "checked" : ""}`}
                            onClick={() => canCompleteTasks && updateTaskStatus(t.projectId, t.taskId, t.status === "done" ? "todo" : "done")}>
                            {t.status === "done" && "✓"}
                          </div>
                          <div className="task-content">
                            <div className={`task-title ${t.status === "done" ? "completed" : ""}`}>{t.title}</div>
                            <div className="task-meta"><span className={`priority-${t.priority}`}>{t.priority} priority</span>{t.assignee && <span> • {t.assignee}</span>}{t.dueDate && <span> • 📅 {new Date(t.dueDate!).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</span>}</div>
                          </div>
                          <select className="select" value={t.status} onChange={(e) => updateTaskStatus(t.projectId, t.taskId, e.target.value)}>
                            <option value="todo">To Do</option><option value="in-progress">In Progress</option>
                            {canCompleteTasks && <option value="done">Done</option>}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-state"><div className="empty-state-icon">📁</div><div className="empty-state-title">Select a project</div></div>
              )}
            </div>
          )}

          {/* Team View */}
          {activeView === "team" && (
            <div className="card">
              <div className="card-header"><h2 className="card-title">Team Members</h2><span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{team.length} members</span></div>
              <div className="card-body">
                {team.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">👥</div><div className="empty-state-title">No team members yet</div>
                    {isAdmin && <button className="btn" style={{ marginTop: 16 }} onClick={() => setShowTeamModal(true)}>+ Add First Member</button>}
                  </div>
                ) : (
                  <table className="table">
                    <thead><tr><th>Name</th><th>Email</th><th>Role</th>{isAdmin && <th>Actions</th>}</tr></thead>
                    <tbody>
                      {team.map((m) => (
                        <tr key={m.memberId}>
                          <td><div className="project-name">{m.name}</div></td>
                          <td>{m.email}</td>
                          <td><span className={`status-badge ${m.role === "Admin" ? "status-active" : "status-pending"}`}>{m.role}</span></td>
                          {isAdmin && <td><button className="btn-delete" onClick={() => removeTeamMember(m.memberId)}>Remove</button></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Employees View (Admin Only) */}
          {activeView === "employees" && isAdmin && (
            <div className="card">
              <div className="card-header"><h2 className="card-title">Employee Management</h2></div>
              <div className="card-body">
                {pendingUsers.length > 0 && (
                  <div className="pending-section">
                    <h3 style={{ marginBottom: 12, color: "var(--warning)" }}>⏳ Pending Approval ({pendingUsers.length})</h3>
                    <table className="table">
                      <thead><tr><th>Name</th><th>Email</th><th>Actions</th></tr></thead>
                      <tbody>
                        {pendingUsers.map((u) => (
                          <tr key={u.userId}>
                            <td>{u.name}</td><td>{u.email}</td>
                            <td>
                              <select className="select" style={{ marginRight: 8 }} defaultValue="Contributor" id={`role-${u.userId}`}>
                                <option value="Admin">Admin</option><option value="Project Manager">Project Manager</option>
                                <option value="Contributor">Contributor</option><option value="Viewer">Viewer</option>
                              </select>
                              <button className="btn" onClick={() => approveUser(u.userId, (document.getElementById(`role-${u.userId}`) as HTMLSelectElement).value)}>Approve</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <h3 style={{ marginTop: 24, marginBottom: 12 }}>Active Employees</h3>
                <table className="table">
                  <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last Login</th><th>Actions</th></tr></thead>
                  <tbody>
                    {users.filter(u => u.status === "active").map((u) => (
                      <tr key={u.userId}>
                        <td><button className="btn-link" style={{ padding: 0, fontWeight: 500 }} onClick={() => setViewingProfile(u)}>{u.name}</button></td><td>{u.email}</td>
                        <td>
                          <select className="select" value={u.role} onChange={(e) => updateUserRole(u.userId, e.target.value)} disabled={u.userId === user?.userId}>
                            <option value="Admin">Admin</option><option value="Project Manager">Project Manager</option>
                            <option value="Contributor">Contributor</option><option value="Viewer">Viewer</option>
                          </select>
                        </td>
                        <td className="last-login">{u.lastLogin ? formatLastLogin(u.lastLogin) : "Never"}</td>
                        <td>{u.userId !== user?.userId && <button className="btn-delete" onClick={() => deleteUserAccount(u.userId)}>Delete</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Discussions View */}
          {activeView === "discussions" && (
            <div className="card discussions-card">
              <div className="card-header">
                <h2 className="card-title">Team Discussions</h2>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{messages.length} messages</span>
              </div>
              <div className="card-body">
                <div className="message-input">
                  <input
                    type="text"
                    className="input"
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  />
                  <button className="btn" onClick={sendMessage}>Send</button>
                </div>
                <div className="messages-list">
                  {messages.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon">💬</div>
                      <div className="empty-state-title">No messages yet</div>
                      <p className="empty-state-text">Start a conversation with your team!</p>
                    </div>
                  ) : (
                    messages.map((m) => (
                      <div key={m.messageId} className={`message ${m.userId === user?.userId ? "own" : ""}`}>
                        <div className="message-header">
                          <span className="message-author" style={{ cursor: 'pointer' }} onClick={() => {
                            const msgUser = users.find(u => u.userId === m.userId);
                            if (msgUser) setViewingProfile(msgUser);
                          }}>{m.userName}</span>
                          <span className="message-time">{formatLastLogin(m.createdAt)}</span>
                          {(isAdmin || m.userId === user?.userId) && (
                            <button className="message-delete" onClick={() => deleteMessageById(m.messageId)}>×</button>
                          )}
                        </div>
                        <div className="message-content">{m.content}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Calendar View */}
          {activeView === "calendar" && (() => {
            const year = calendarMonth.getFullYear();
            const month = calendarMonth.getMonth();
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const today = new Date();
            const days = [];
            for (let i = 0; i < firstDay; i++) days.push(null);
            for (let i = 1; i <= daysInMonth; i++) days.push(i);
            
            const tasksWithDue = (isAdmin ? allTasks : myTasks).filter(t => t.dueDate);
            const getTasksForDay = (day: number) => {
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              return tasksWithDue.filter(t => t.dueDate?.startsWith(dateStr));
            };
            
            const upcomingTasks = tasksWithDue
              .filter(t => t.status !== "done" && new Date(t.dueDate!) >= new Date(today.toDateString()))
              .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
              .slice(0, 5);
            
            const overdueTasks = tasksWithDue
              .filter(t => t.status !== "done" && new Date(t.dueDate!) < new Date(today.toDateString()));
            
            return (
              <div className="calendar-container">
                <div className="calendar-grid">
                  <div className="card">
                    <div className="card-header">
                      <button className="btn btn-secondary" onClick={() => setCalendarMonth(new Date(year, month - 1))}>←</button>
                      <h2 className="card-title">{calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
                      <button className="btn btn-secondary" onClick={() => setCalendarMonth(new Date(year, month + 1))}>→</button>
                    </div>
                    <div className="card-body">
                      <div className="calendar">
                        <div className="calendar-header">
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                            <div key={d} className="calendar-day-name">{d}</div>
                          ))}
                        </div>
                        <div className="calendar-days">
                          {days.map((day, i) => {
                            const dayTasks = day ? getTasksForDay(day) : [];
                            const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                            return (
                              <div key={i} className={`calendar-day ${!day ? 'empty' : ''} ${isToday ? 'today' : ''}`}>
                                {day && (
                                  <>
                                    <span className="day-number">{day}</span>
                                    {dayTasks.length > 0 && (
                                      <div className="day-tasks">
                                        {dayTasks.slice(0, 2).map(t => (
                                          <div key={t.taskId} className={`day-task ${t.status === 'done' ? 'done' : ''} priority-${t.priority}`} title={t.title}>
                                            {t.title.slice(0, 15)}{t.title.length > 15 ? '...' : ''}
                                          </div>
                                        ))}
                                        {dayTasks.length > 2 && <div className="day-task-more">+{dayTasks.length - 2} more</div>}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="calendar-sidebar">
                    {overdueTasks.length > 0 && (
                      <div className="card" style={{ marginBottom: 16 }}>
                        <div className="card-header"><h2 className="card-title" style={{ color: 'var(--danger)' }}>⚠️ Overdue</h2></div>
                        <div className="card-body">
                          {overdueTasks.map(t => (
                            <div key={t.taskId} className="upcoming-task overdue">
                              <div className="upcoming-task-title">{t.title}</div>
                              <div className="upcoming-task-date">{new Date(t.dueDate!).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="card">
                      <div className="card-header"><h2 className="card-title">📌 Upcoming Deadlines</h2></div>
                      <div className="card-body">
                        {upcomingTasks.length === 0 ? (
                          <div className="empty-state" style={{ padding: 20 }}>
                            <div className="empty-state-title">No upcoming deadlines</div>
                          </div>
                        ) : (
                          upcomingTasks.map(t => (
                            <div key={t.taskId} className="upcoming-task">
                              <div className="upcoming-task-title">{t.title}</div>
                              <div className="upcoming-task-date">{new Date(t.dueDate!).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Settings View */}
          {activeView === "settings" && (
            <div className="settings-grid">
              <div className="card">
                <div className="card-header"><h2 className="card-title">👤 Profile</h2></div>
                <div className="card-body">
                  <div className="settings-row" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                    <label style={{ cursor: 'pointer', position: 'relative' }}>
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => setProfile({ ...profile, avatar: ev.target?.result as string });
                          reader.readAsDataURL(file);
                        }
                      }} />
                      <div className="profile-avatar-large" style={{ 
                        width: 80, height: 80, borderRadius: '50%', background: profile.avatar ? `url(${profile.avatar}) center/cover` : 'var(--accent)', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: 'white', fontWeight: 600,
                        cursor: 'pointer', transition: 'opacity 0.15s'
                      }}>
                        {!profile.avatar && user.name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ position: 'absolute', bottom: 0, right: 0, background: 'var(--bg-card)', border: '2px solid var(--border)', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>📷</div>
                    </label>
                    <div>
                      <div style={{ fontWeight: 500, marginBottom: 4 }}>Click to upload photo</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>JPG, PNG or GIF. Max 2MB.</div>
                    </div>
                  </div>
                  <div className="settings-row"><label className="form-label">Display Name</label><input type="text" className="input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></div>
                  <div className="settings-row"><label className="form-label">Email Address</label><input type="email" className="input" value={profile.email} disabled style={{ background: "#f3f4f6" }} /></div>
                  <div className="settings-row"><label className="form-label">Role</label><input type="text" className="input" value={user.role} disabled style={{ background: "#f3f4f6" }} /></div>
                  <div className="settings-row" style={{ marginTop: 16 }}>
                    <button className="btn" onClick={() => { localStorage.setItem('protus_profile', JSON.stringify(profile)); alert('Profile saved!'); }}>💾 Save Profile</button>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="card-header"><h2 className="card-title">🔗 Social Links</h2></div>
                <div className="card-body">
                  <div className="settings-row">
                    <label className="form-label">LinkedIn</label>
                    <div className="input-group"><span style={{ padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRight: 'none', borderRadius: 'var(--radius) 0 0 var(--radius)' }}>🔗</span><input type="text" className="input" style={{ borderRadius: '0 var(--radius) var(--radius) 0' }} placeholder="linkedin.com/in/username" value={profile.linkedin} onChange={(e) => setProfile({ ...profile, linkedin: e.target.value })} /></div>
                  </div>
                  <div className="settings-row">
                    <label className="form-label">GitHub</label>
                    <div className="input-group"><span style={{ padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRight: 'none', borderRadius: 'var(--radius) 0 0 var(--radius)' }}>💻</span><input type="text" className="input" style={{ borderRadius: '0 var(--radius) var(--radius) 0' }} placeholder="github.com/username" value={profile.github} onChange={(e) => setProfile({ ...profile, github: e.target.value })} /></div>
                  </div>
                  <div className="settings-row">
                    <label className="form-label">X (Twitter)</label>
                    <div className="input-group"><span style={{ padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRight: 'none', borderRadius: 'var(--radius) 0 0 var(--radius)' }}>𝕏</span><input type="text" className="input" style={{ borderRadius: '0 var(--radius) var(--radius) 0' }} placeholder="x.com/username" value={profile.twitter} onChange={(e) => setProfile({ ...profile, twitter: e.target.value })} /></div>
                  </div>
                  <div className="settings-row" style={{ marginTop: 16 }}>
                    <button className="btn" onClick={() => { localStorage.setItem('protus_profile', JSON.stringify(profile)); alert('Social links saved!'); }}>💾 Save Links</button>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="card-header"><h2 className="card-title">🎨 Appearance</h2></div>
                <div className="card-body">
                  <div className="settings-row"><label className="form-label">Theme</label>
                    <div className="theme-toggle">
                      <button className={`theme-btn ${theme === "light" ? "active" : ""}`} onClick={() => setTheme("light")}>☀️ Light</button>
                      <button className={`theme-btn ${theme === "dark" ? "active" : ""}`} onClick={() => setTheme("dark")}>🌙 Dark</button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="card-header"><h2 className="card-title">🔔 Notifications</h2></div>
                <div className="card-body">
                  <div className="settings-toggle-row"><div><div className="settings-toggle-label">Email Notifications</div><div className="settings-toggle-desc">Receive updates via email</div></div>
                    <label className="toggle"><input type="checkbox" checked={notifications.email} onChange={(e) => setNotifications({ ...notifications, email: e.target.checked })} /><span className="toggle-slider"></span></label></div>
                  <div className="settings-toggle-row"><div><div className="settings-toggle-label">Task Updates</div><div className="settings-toggle-desc">When tasks are modified</div></div>
                    <label className="toggle"><input type="checkbox" checked={notifications.taskUpdates} onChange={(e) => setNotifications({ ...notifications, taskUpdates: e.target.checked })} /><span className="toggle-slider"></span></label></div>
                </div>
              </div>
              <div className="card">
                <div className="card-header"><h2 className="card-title">📦 Data</h2></div>
                <div className="card-body">
                  <button className="btn btn-secondary" onClick={() => {
                    const data = { projects, tasks, team };
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = url; a.download = "protus-export.json"; a.click();
                  }}>📥 Export Data</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
