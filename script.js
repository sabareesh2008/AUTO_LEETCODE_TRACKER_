let supabaseClient = null;
let currentUser = null;
let currentRole = null;

let directoryStudents = [];
let allStudents = [];
let visibleStudents = [];

let pendingDeleteId = null;

const cfg = window.APP_CONFIG || {};

const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const loginForm = document.getElementById("loginForm");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");
const togglePasswordButton = document.getElementById("togglePasswordButton");

const sessionEmail = document.getElementById("sessionEmail");
const roleBadge = document.getElementById("roleBadge");
const accessNote = document.getElementById("accessNote");
const logoutButton = document.getElementById("logoutButton");

const tableBody = document.getElementById("studentTableBody");
const messageElement = document.getElementById("message");
const searchInput = document.getElementById("searchInput");

const profileModal = document.getElementById("profileModal");
const addProfileButton = document.getElementById("addProfileButton");
const closeProfileModal = document.getElementById("closeProfileModal");
const profileForm = document.getElementById("profileForm");
const formMessage = document.getElementById("formMessage");
const usernameInput = document.getElementById("leetcodeUsername");
const generatedLink = document.getElementById("generatedLink");
const saveProfileButton = document.getElementById("saveProfileButton");
const editingStudentId = document.getElementById("editingStudentId");

const deleteModal = document.getElementById("deleteModal");
const deleteDescription = document.getElementById("deleteDescription");
const deleteMessage = document.getElementById("deleteMessage");
const cancelDeleteButton = document.getElementById("cancelDeleteButton");
const confirmDeleteButton = document.getElementById("confirmDeleteButton");

const exportColumns = [
  "Rank",
  "Register Number",
  "Student Name",
  "LeetCode Username",
  "LeetCode Link",
  "Last 30 Days",
  "Last 7 Days",
  "Solved Today",
  "Problems Solved",
  "Total Submissions",
  "Easy",
  "Medium",
  "Hard",
  "Last Problem",
  "Last Solved",
  "Status",
  "Updated At"
];


function configured() {
  return Boolean(
    cfg.SUPABASE_URL
    && cfg.SUPABASE_ANON_KEY
    && !cfg.SUPABASE_URL.startsWith("PASTE_")
    && !cfg.SUPABASE_ANON_KEY.startsWith("PASTE_")
  );
}


function createClient() {
  if (!configured()) {
    throw new Error(
      "Supabase is not configured. Add your Project URL and publishable key to config.js."
    );
  }

  if (!window.supabase?.createClient) {
    throw new Error("Supabase JavaScript library failed to load.");
  }

  supabaseClient = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
}


function parseCSV(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    const next = text[i + 1];

    if (character === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if (
      (character === "\n" || character === "\r")
      && !quoted
    ) {
      if (character === "\r" && next === "\n") {
        i += 1;
      }

      row.push(value);

      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }

      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value !== "" || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map(
    (header) => header.replace(/^\uFEFF/, "").trim()
  );

  return rows.slice(1).map((cells) =>
    Object.fromEntries(
      headers.map(
        (header, index) => [
          header,
          (cells[index] ?? "").trim()
        ]
      )
    )
  );
}


function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function rankClass(rank) {
  const value = Number(rank);

  if (value === 1) return "rank-1";
  if (value === 2) return "rank-2";
  if (value === 3) return "rank-3";

  return "";
}


function isAdmin() {
  return currentRole === "admin";
}


function showLogin(message = "") {
  currentUser = null;
  currentRole = null;
  appView.hidden = true;
  loginView.hidden = false;

  loginMessage.textContent = message;
  loginMessage.className = message
    ? "form-message error"
    : "form-message";
}


function showApp() {
  loginView.hidden = true;
  appView.hidden = false;

  sessionEmail.textContent = currentUser?.email || "Signed in";

  if (isAdmin()) {
    roleBadge.textContent = "Administrator";
    roleBadge.className = "role-badge role-admin";
    accessNote.textContent =
      "Administrator access · Add, edit and delete profiles enabled.";
  } else {
    roleBadge.textContent = "Public Viewer";
    roleBadge.className = "role-badge role-public";
    accessNote.textContent =
      "Public access · View, search and download only.";
  }

  document.querySelectorAll(".admin-only").forEach((element) => {
    element.hidden = !isAdmin();
  });
}


async function fetchMyRole() {
  const { data, error } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", currentUser.id)
    .single();

  if (error) {
    throw new Error(
      "Your account does not have an assigned application role."
    );
  }

  if (!["admin", "public"].includes(data?.role)) {
    throw new Error("Invalid application role.");
  }

  return data.role;
}


async function enterApp(user) {
  currentUser = user;
  currentRole = await fetchMyRole();
  showApp();
  await loadData();
}


async function handleLogin(event) {
  event.preventDefault();

  loginButton.disabled = true;
  loginButton.textContent = "Signing in...";
  loginMessage.textContent = "Checking account...";
  loginMessage.className = "form-message";

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: loginEmail.value.trim(),
      password: loginPassword.value
    });

    if (error) {
      throw error;
    }

    if (!data.user) {
      throw new Error("Unable to load your account.");
    }

    await enterApp(data.user);

    loginMessage.textContent = "";
    loginPassword.value = "";
  } catch (error) {
    await supabaseClient.auth.signOut().catch(() => {});
    showLogin(error.message || "Login failed.");
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Sign In";
  }
}


async function logout() {
  logoutButton.disabled = true;

  try {
    await supabaseClient.auth.signOut();
  } finally {
    logoutButton.disabled = false;
    searchInput.value = "";
    directoryStudents = [];
    allStudents = [];
    visibleStudents = [];
    showLogin();
  }
}


async function restoreSession() {
  const {
    data: { session },
    error
  } = await supabaseClient.auth.getSession();

  if (error || !session?.user) {
    showLogin();
    return;
  }

  try {
    await enterApp(session.user);
  } catch (roleError) {
    await supabaseClient.auth.signOut();
    showLogin(roleError.message);
  }
}


async function fetchRegisteredStudents() {
  const { data, error } = await supabaseClient
    .from("students")
    .select(
      "id,register_number,student_name,leetcode_username,created_at"
    )
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Student directory: ${error.message}`);
  }

  return data || [];
}


function makePendingRow(student, liveRow = null) {
  const username = student.leetcode_username;

  return {
    Rank: liveRow?.Rank || "",
    "Register Number": student.register_number,
    "Student Name": student.student_name,
    "LeetCode Username": username,
    "LeetCode Link":
      `https://leetcode.com/u/${encodeURIComponent(username)}/`,
    "Last 30 Days": "",
    "Last 7 Days": "",
    "Solved Today": "",
    "Problems Solved": "",
    "Total Submissions": "",
    Easy: "",
    Medium: "",
    Hard: "",
    "Last Problem": "",
    "Last Solved": "",
    Status: "Pending",
    "Updated At": "",
    __id: student.id
  };
}


function mergeLiveWithDirectory(live, registered) {
  const liveByRegister = new Map(
    live.map((row) => [
      String(row["Register Number"] || "").trim(),
      row
    ])
  );

  return registered.map((student) => {
    const registerNumber = String(student.register_number || "").trim();
    const liveRow = liveByRegister.get(registerNumber);

    if (!liveRow) {
      return makePendingRow(student);
    }

    const sameUsername =
      String(liveRow["LeetCode Username"] || "").toLowerCase()
      === String(student.leetcode_username || "").toLowerCase();

    if (!sameUsername) {
      return makePendingRow(student, liveRow);
    }

    return {
      ...liveRow,
      "Register Number": student.register_number,
      "Student Name": student.student_name,
      "LeetCode Username": student.leetcode_username,
      "LeetCode Link":
        `https://leetcode.com/u/${encodeURIComponent(student.leetcode_username)}/`,
      __id: student.id
    };
  });
}


function updateLastUpdated(students) {
  const updated = students
    .map((student) => student["Updated At"])
    .filter(Boolean)[0]
    || "Waiting for cloud tracker";

  document.getElementById("lastUpdated").textContent = updated;
  document.getElementById("printUpdatedAt").textContent =
    `Last updated: ${updated}`;
}


function renderStudents(students) {
  visibleStudents = students;

  const columnCount = isAdmin() ? 14 : 13;

  if (!students.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="${columnCount}" class="loading-row">
          No matching students found.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = students.map((student, index) => {
    const status = student.Status || "Pending";
    const statusClass =
      status === "Success"
        ? "status-success"
        : status === "Pending"
          ? "status-pending"
          : "status-error";

    const adminActions = isAdmin()
      ? `
        <td class="admin-actions-cell">
          <div class="row-actions">
            <button
              type="button"
              class="row-action edit-action"
              data-action="edit"
              data-student-id="${escapeHTML(student.__id)}"
              title="Edit profile"
            >
              Edit
            </button>

            <button
              type="button"
              class="row-action delete-action"
              data-action="delete"
              data-student-id="${escapeHTML(student.__id)}"
              title="Delete profile"
            >
              Delete
            </button>
          </div>
        </td>
      `
      : "";

    return `
      <tr style="animation-delay:${Math.min(index * 35, 420)}ms">
        <td>
          <span class="rank-badge ${rankClass(student.Rank)}">
            ${escapeHTML(student.Rank || "–")}
          </span>
        </td>

        <td class="student-cell">
          <span class="student-name">
            ${escapeHTML(student["Student Name"])}
          </span>
          <span class="register-number">
            ${escapeHTML(student["Register Number"])}
          </span>
        </td>

        <td>
          <a
            class="profile-link"
            href="${escapeHTML(student["LeetCode Link"])}"
            target="_blank"
            rel="noopener noreferrer"
          >
            ${escapeHTML(student["LeetCode Username"])}
          </a>
        </td>

        <td>
          <span class="month-score">
            ${escapeHTML(student["Last 30 Days"] || "–")}
          </span>
        </td>

        <td class="numeric">${escapeHTML(student["Last 7 Days"] || "–")}</td>
        <td class="numeric">${escapeHTML(student["Solved Today"] || "–")}</td>
        <td class="numeric">${escapeHTML(student["Problems Solved"] || "–")}</td>
        <td class="numeric">${escapeHTML(student.Easy || "–")}</td>
        <td class="numeric">${escapeHTML(student.Medium || "–")}</td>
        <td class="numeric">${escapeHTML(student.Hard || "–")}</td>
        <td>${escapeHTML(student["Last Problem"] || "–")}</td>
        <td>${escapeHTML(student["Last Solved"] || "–")}</td>

        <td>
          <span class="status ${statusClass}">
            ${escapeHTML(status)}
          </span>
        </td>

        ${adminActions}
      </tr>
    `;
  }).join("");
}


async function loadData() {
  if (!currentUser) {
    return;
  }

  try {
    const [csvResponse, registered] = await Promise.all([
      fetch(`LiveData.csv?time=${Date.now()}`, {
        cache: "no-store"
      }),
      fetchRegisteredStudents()
    ]);

    if (!csvResponse.ok) {
      throw new Error(`LiveData.csv HTTP ${csvResponse.status}`);
    }

    const live = parseCSV(await csvResponse.text());

    directoryStudents = registered;
    allStudents = mergeLiveWithDirectory(live, registered);

    updateLastUpdated(live);
    applySearch();

    messageElement.textContent =
      `${registered.length} managed profile(s) · auto-refreshing`;
  } catch (error) {
    console.error(error);
    messageElement.textContent =
      `Unable to load dashboard: ${error.message}`;
  }
}


function applySearch() {
  const query = searchInput.value.trim().toLowerCase();

  if (!query) {
    renderStudents(allStudents);
    return;
  }

  renderStudents(
    allStudents.filter((student) =>
      [
        student["Student Name"],
        student["Register Number"],
        student["LeetCode Username"]
      ].some((value) =>
        String(value || "").toLowerCase().includes(query)
      )
    )
  );
}


function resetProfileForm() {
  profileForm.reset();
  editingStudentId.value = "";
  formMessage.textContent = "";
  formMessage.className = "form-message";
  generatedLink.textContent = "https://leetcode.com/u/username/";
}


function openAddModal() {
  if (!isAdmin()) {
    return;
  }

  resetProfileForm();
  document.getElementById("profileModalTitle").textContent =
    "Add LeetCode Profile";
  saveProfileButton.textContent = "Add User";

  profileModal.hidden = false;
  document.getElementById("registerNumber").focus();
}


function openEditModal(studentId) {
  if (!isAdmin()) {
    return;
  }

  const student = directoryStudents.find(
    (item) => String(item.id) === String(studentId)
  );

  if (!student) {
    messageElement.textContent =
      "Unable to find that student in the current directory.";
    return;
  }

  resetProfileForm();

  editingStudentId.value = student.id;
  document.getElementById("registerNumber").value =
    student.register_number;
  document.getElementById("studentName").value =
    student.student_name;
  usernameInput.value = student.leetcode_username;
  generatedLink.textContent =
    `https://leetcode.com/u/${student.leetcode_username}/`;

  document.getElementById("profileModalTitle").textContent =
    "Edit LeetCode Profile";
  saveProfileButton.textContent = "Save Changes";

  profileModal.hidden = false;
}


function hideProfileModal() {
  profileModal.hidden = true;
}


async function saveProfile(event) {
  event.preventDefault();

  if (!isAdmin()) {
    formMessage.textContent = "Administrator access required.";
    formMessage.className = "form-message error";
    return;
  }

  const id = editingStudentId.value.trim();
  const register_number =
    document.getElementById("registerNumber").value.trim();
  const student_name =
    document.getElementById("studentName").value.trim();
  const leetcode_username =
    usernameInput.value.trim();

  if (!/^[A-Za-z0-9_-]{1,50}$/.test(leetcode_username)) {
    formMessage.textContent =
      "Use only letters, numbers, _ or - in the LeetCode username.";
    formMessage.className = "form-message error";
    return;
  }

  saveProfileButton.disabled = true;
  saveProfileButton.textContent = id ? "Saving..." : "Adding...";
  formMessage.textContent =
    id ? "Updating profile..." : "Adding profile...";
  formMessage.className = "form-message";

  try {
    let result;

    if (id) {
      result = await supabaseClient
        .from("students")
        .update({
          register_number,
          student_name,
          leetcode_username
        })
        .eq("id", id)
        .select()
        .single();
    } else {
      result = await supabaseClient
        .from("students")
        .insert({
          register_number,
          student_name,
          leetcode_username
        })
        .select()
        .single();
    }

    if (result.error) {
      if (result.error.code === "23505") {
        throw new Error(
          "Register number or LeetCode username already exists."
        );
      }

      throw result.error;
    }

    formMessage.textContent = id
      ? "Profile updated. Cloud LeetCode refresh has been triggered."
      : "Profile added. Cloud LeetCode refresh has been triggered.";

    formMessage.className = "form-message success";

    await loadData();

    setTimeout(hideProfileModal, 900);
  } catch (error) {
    formMessage.textContent = error.message || "Unable to save profile.";
    formMessage.className = "form-message error";
  } finally {
    saveProfileButton.disabled = false;
    saveProfileButton.textContent = id ? "Save Changes" : "Add User";
  }
}


function openDeleteModal(studentId) {
  if (!isAdmin()) {
    return;
  }

  const student = directoryStudents.find(
    (item) => String(item.id) === String(studentId)
  );

  if (!student) {
    return;
  }

  pendingDeleteId = student.id;
  deleteMessage.textContent = "";
  deleteMessage.className = "form-message";

  deleteDescription.textContent =
    `Delete ${student.student_name} (${student.leetcode_username})? `
    + "The cloud tracker will regenerate the leaderboard after deletion.";

  deleteModal.hidden = false;
}


function closeDeleteModal() {
  deleteModal.hidden = true;
  pendingDeleteId = null;
}


async function confirmDelete() {
  if (!isAdmin() || pendingDeleteId === null) {
    return;
  }

  confirmDeleteButton.disabled = true;
  confirmDeleteButton.textContent = "Deleting...";
  deleteMessage.textContent = "Removing profile...";

  try {
    const { error } = await supabaseClient
      .from("students")
      .delete()
      .eq("id", pendingDeleteId);

    if (error) {
      throw error;
    }

    closeDeleteModal();
    await loadData();

    messageElement.textContent =
      "Profile deleted. Cloud leaderboard refresh has been triggered.";
  } catch (error) {
    deleteMessage.textContent =
      error.message || "Unable to delete profile.";
    deleteMessage.className = "form-message error";
  } finally {
    confirmDeleteButton.disabled = false;
    confirmDeleteButton.textContent = "Delete Profile";
  }
}


function handleTableAction(event) {
  const button = event.target.closest("[data-action]");

  if (!button || !isAdmin()) {
    return;
  }

  const studentId = button.dataset.studentId;
  const action = button.dataset.action;

  if (action === "edit") {
    openEditModal(studentId);
  }

  if (action === "delete") {
    openDeleteModal(studentId);
  }
}


function csvEscape(value) {
  const text = String(value ?? "");

  return /[",\n]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}


function exportRows() {
  return visibleStudents.map(
    (student) =>
      exportColumns.map(
        (column) => student[column] ?? ""
      )
  );
}


function downloadBlob(content, type, name) {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");

  link.href = URL.createObjectURL(blob);
  link.download = name;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(
    () => URL.revokeObjectURL(link.href),
    1000
  );
}


function downloadCSV() {
  const rows = [
    exportColumns,
    ...exportRows()
  ];

  downloadBlob(
    "\uFEFF"
      + rows
        .map((row) => row.map(csvEscape).join(","))
        .join("\r\n"),
    "text/csv;charset=utf-8",
    "LeetCode_Leaderboard.csv"
  );
}


function downloadExcel() {
  window.location.href =
    `Students.xlsx?time=${Date.now()}`;
}


function downloadPDF() {
  window.print();
}


async function initialize() {
  try {
    createClient();
    await restoreSession();
  } catch (error) {
    showLogin(error.message);
  }
}


loginForm.addEventListener("submit", handleLogin);

togglePasswordButton.addEventListener("click", () => {
  const showing = loginPassword.type === "text";

  loginPassword.type = showing ? "password" : "text";
  togglePasswordButton.textContent = showing ? "Show" : "Hide";
  togglePasswordButton.setAttribute(
    "aria-label",
    showing ? "Show password" : "Hide password"
  );
});

logoutButton.addEventListener("click", logout);

searchInput.addEventListener("input", applySearch);

addProfileButton.addEventListener("click", openAddModal);
closeProfileModal.addEventListener("click", hideProfileModal);

profileModal
  .querySelectorAll("[data-close-modal]")
  .forEach((element) =>
    element.addEventListener("click", hideProfileModal)
  );

profileForm.addEventListener("submit", saveProfile);

usernameInput.addEventListener("input", () => {
  const username = usernameInput.value.trim();

  generatedLink.textContent =
    `https://leetcode.com/u/${username || "username"}/`;
});

tableBody.addEventListener("click", handleTableAction);

cancelDeleteButton.addEventListener("click", closeDeleteModal);

deleteModal
  .querySelectorAll("[data-close-delete]")
  .forEach((element) =>
    element.addEventListener("click", closeDeleteModal)
  );

confirmDeleteButton.addEventListener("click", confirmDelete);

document
  .getElementById("downloadCsvButton")
  .addEventListener("click", downloadCSV);

document
  .getElementById("downloadExcelButton")
  .addEventListener("click", downloadExcel);

document
  .getElementById("downloadPdfButton")
  .addEventListener("click", downloadPDF);

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (!profileModal.hidden) {
    hideProfileModal();
  }

  if (!deleteModal.hidden) {
    closeDeleteModal();
  }
});

initialize();

setInterval(() => {
  if (currentUser && !document.hidden) {
    loadData();
  }
}, 30000);
