let supabaseClient = null;
let currentUser = null;
let currentRole = null;

let allStudents = [];
let visibleStudents = [];
let directoryStudents = [];
let pendingDeleteId = null;

const cfg = window.APP_CONFIG || {};

const tableBody = document.getElementById("studentTableBody");
const messageElement = document.getElementById("message");
const searchInput = document.getElementById("searchInput");

const adminLoginButton = document.getElementById("adminLoginButton");
const adminLogoutButton = document.getElementById("adminLogoutButton");
const adminSessionCard = document.getElementById("adminSessionCard");
const sessionEmail = document.getElementById("sessionEmail");
const accessNote = document.getElementById("accessNote");

const adminLoginModal = document.getElementById("adminLoginModal");
const adminLoginForm = document.getElementById("adminLoginForm");
const adminEmail = document.getElementById("adminEmail");
const adminPassword = document.getElementById("adminPassword");
const adminSignInButton = document.getElementById("adminSignInButton");
const adminLoginMessage = document.getElementById("adminLoginMessage");
const closeAdminLogin = document.getElementById("closeAdminLogin");
const toggleAdminPassword = document.getElementById("toggleAdminPassword");

const addProfileButton = document.getElementById("addProfileButton");
const syncNowButton = document.getElementById("syncNowButton");
const manageStudentsButton = document.getElementById("manageStudentsButton");

const profileModal = document.getElementById("profileModal");
const profileForm = document.getElementById("profileForm");
const closeProfileModal = document.getElementById("closeProfileModal");
const editingStudentId = document.getElementById("editingStudentId");
const registerNumberInput = document.getElementById("registerNumber");
const studentNameInput = document.getElementById("studentName");
const usernameInput = document.getElementById("leetcodeUsername");
const generatedLink = document.getElementById("generatedLink");
const formMessage = document.getElementById("formMessage");
const saveProfileButton = document.getElementById("saveProfileButton");

const manageStudentsModal = document.getElementById("manageStudentsModal");
const closeManageStudents = document.getElementById("closeManageStudents");
const manageStudentsBody = document.getElementById("manageStudentsBody");
const manageSearch = document.getElementById("manageSearch");
const manageCount = document.getElementById("manageCount");

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
      "Supabase is not configured. Put your Project URL and publishable key in config.js."
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


function isAdmin() {
  return currentRole === "admin";
}


function updateAdminUI() {
  document.querySelectorAll(".admin-only").forEach((element) => {
    element.hidden = !isAdmin();
  });

  adminLoginButton.hidden = isAdmin();
  adminSessionCard.hidden = !isAdmin();

  if (isAdmin()) {
    sessionEmail.textContent = currentUser?.email || "Administrator";
    accessNote.textContent =
      "Admin Mode · Add, Sync and Manage Students enabled.";
  } else {
    accessNote.textContent =
      "Public view · No login required";
  }
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


function updateLastUpdated(students) {
  const updatedAt = students
    .map((student) => student["Updated At"])
    .find(Boolean)
    || "Waiting for tracker";

  document.getElementById("lastUpdated").textContent = updatedAt;
  document.getElementById("printUpdatedAt").textContent =
    `Last updated: ${updatedAt}`;
}


function renderStudents(students) {
  // Always display students by Register Number
students = [...students].sort((a, b) => {
    return String(a["Register Number"] || "")
        .localeCompare(
            String(b["Register Number"] || ""),
            undefined,
            { numeric: true }
        );
});
  visibleStudents = students;

  if (!students.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="13" class="loading-row">
          No matching students found.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = students.map((student, index) => {
    const status = student.Status || "";
    const statusClass =
      status === "Success"
        ? "status-success"
        : status === "Pending"
          ? "status-pending"
          : "status-error";

    return `
      <tr style="animation-delay:${Math.min(index * 30, 360)}ms">
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
            ${escapeHTML(status || "Unknown")}
          </span>
        </td>
      </tr>
    `;
  }).join("");
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
        student["LeetCode Username"],
        student["Last Problem"]
      ].some((value) =>
        String(value || "").toLowerCase().includes(query)
      )
    )
  );
}


async function loadData() {
  try {
    const response = await fetch(
      `LiveData.csv?time=${Date.now()}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(`LiveData.csv HTTP ${response.status}`);
    }

    allStudents = parseCSV(await response.text());
// Always display leaderboard by Register Number
allStudents.sort((a, b) =>
    String(a["Register Number"]).localeCompare(
        String(b["Register Number"]),
        undefined,
        { numeric: true }
    )
);

    updateLastUpdated(allStudents);
    applySearch();

    messageElement.textContent =
      `${allStudents.length} student profile(s) · leaderboard auto-refreshes`;
  } catch (error) {
    console.error(error);

    tableBody.innerHTML = `
      <tr>
        <td colspan="13" class="loading-row">
          Unable to load leaderboard.
        </td>
      </tr>
    `;

    messageElement.textContent =
      `Unable to load dashboard: ${error.message}`;
  }
}


async function fetchAdminRole(user) {
  const { data, error } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (error) {
    throw new Error(
      "This account does not have an application role."
    );
  }

  if (data?.role !== "admin") {
    throw new Error(
      "This account is not authorized as an administrator."
    );
  }

  return "admin";
}


function openAdminLogin() {
  adminLoginMessage.textContent = "";
  adminLoginMessage.className = "form-message";
  adminLoginModal.hidden = false;

  setTimeout(() => adminEmail.focus(), 0);
}


function closeAdminLoginModal() {
  adminLoginModal.hidden = true;
}


async function handleAdminLogin(event) {
  event.preventDefault();

  adminSignInButton.disabled = true;
  adminSignInButton.textContent = "Checking...";
  adminLoginMessage.textContent = "Authenticating administrator...";
  adminLoginMessage.className = "form-message";

  try {
    const { data, error } =
      await supabaseClient.auth.signInWithPassword({
        email: adminEmail.value.trim(),
        password: adminPassword.value
      });

    if (error) {
      throw error;
    }

    if (!data.user) {
      throw new Error("Unable to load account.");
    }

    const role = await fetchAdminRole(data.user);

    currentUser = data.user;
    currentRole = role;

    adminPassword.value = "";
    closeAdminLoginModal();
    updateAdminUI();

    messageElement.textContent =
      "Administrator mode enabled.";
  } catch (error) {
    await supabaseClient.auth.signOut().catch(() => {});

    currentUser = null;
    currentRole = null;
    updateAdminUI();

    adminLoginMessage.textContent =
      error.message || "Admin login failed.";
    adminLoginMessage.className = "form-message error";
  } finally {
    adminSignInButton.disabled = false;
    adminSignInButton.textContent = "Login";
  }
}


async function restoreAdminSession() {
  const {
    data: { session },
    error
  } = await supabaseClient.auth.getSession();

  if (error || !session?.user) {
    updateAdminUI();
    return;
  }

  try {
    const role = await fetchAdminRole(session.user);

    currentUser = session.user;
    currentRole = role;
  } catch (error) {
    await supabaseClient.auth.signOut();
    currentUser = null;
    currentRole = null;
  }

  updateAdminUI();
}


async function adminLogout() {
  await supabaseClient.auth.signOut();

  currentUser = null;
  currentRole = null;
  directoryStudents = [];

  manageStudentsModal.hidden = true;
  profileModal.hidden = true;

  updateAdminUI();

  messageElement.textContent =
    "Admin logged out. Public leaderboard remains available.";
}


async function loadRegisteredStudents() {
  if (!isAdmin()) {
    throw new Error("Administrator access required.");
  }

  const { data, error } = await supabaseClient
    .from("students")
    .select(
      "id,register_number,student_name,leetcode_username,created_at"
    )
    .order("student_name", { ascending: true });

  if (error) {
    throw error;
  }

  directoryStudents = data || [];
  return directoryStudents;
}


function renderManageStudents(students) {
  manageCount.textContent =
    `${students.length} student${students.length === 1 ? "" : "s"}`;

  if (!students.length) {
    manageStudentsBody.innerHTML = `
      <tr>
        <td colspan="4" class="loading-row">
          No students found.
        </td>
      </tr>
    `;
    return;
  }

  manageStudentsBody.innerHTML = students.map((student) => `
    <tr>
      <td class="numeric">
        ${escapeHTML(student.register_number)}
      </td>

      <td>
        <span class="student-name">
          ${escapeHTML(student.student_name)}
        </span>
      </td>

      <td>
        <a
          class="profile-link"
          href="https://leetcode.com/u/${encodeURIComponent(student.leetcode_username)}/"
          target="_blank"
          rel="noopener noreferrer"
        >
          ${escapeHTML(student.leetcode_username)}
        </a>
      </td>

      <td>
        <button
          class="row-action edit-action"
          type="button"
          data-manage-edit="${escapeHTML(student.id)}"
        >
          Edit
        </button>

        <button
          class="row-action delete-action"
          type="button"
          data-manage-delete="${escapeHTML(student.id)}"
        >
          Delete
        </button>
      </td>
    </tr>
  `).join("");
}


async function openManageStudents() {
  if (!isAdmin()) {
    return;
  }

  manageStudentsModal.hidden = false;
  manageStudentsBody.innerHTML = `
    <tr>
      <td colspan="4" class="loading-row">
        Loading students...
      </td>
    </tr>
  `;

  try {
    const students = await loadRegisteredStudents();
    manageSearch.value = "";
    renderManageStudents(students);
  } catch (error) {
    manageStudentsBody.innerHTML = `
      <tr>
        <td colspan="4" class="loading-row">
          ${escapeHTML(error.message)}
        </td>
      </tr>
    `;
  }
}


function closeManageStudentsModal() {
  manageStudentsModal.hidden = true;
}


function filterManageStudents() {
  const query = manageSearch.value.trim().toLowerCase();

  if (!query) {
    renderManageStudents(directoryStudents);
    return;
  }

  renderManageStudents(
    directoryStudents.filter((student) =>
      [
        student.register_number,
        student.student_name,
        student.leetcode_username
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
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

  setTimeout(() => registerNumberInput.focus(), 0);
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
      "Unable to find that student.";
    return;
  }

  resetProfileForm();

  editingStudentId.value = student.id;
  registerNumberInput.value = student.register_number;
  studentNameInput.value = student.student_name;
  usernameInput.value = student.leetcode_username;

  generatedLink.textContent =
    `https://leetcode.com/u/${student.leetcode_username}/`;

  document.getElementById("profileModalTitle").textContent =
    "Edit LeetCode Profile";

  saveProfileButton.textContent = "Save Changes";

  manageStudentsModal.hidden = true;
  profileModal.hidden = false;
}


function closeProfile() {
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
    registerNumberInput.value.trim();

  const student_name =
    studentNameInput.value.trim();

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
      ? "Profile updated successfully."
      : "Profile added successfully.";

    formMessage.className = "form-message success";

    await loadData();

    setTimeout(() => {
      closeProfile();
    }, 700);
  } catch (error) {
    formMessage.textContent =
      error.message || "Unable to save profile.";

    formMessage.className = "form-message error";
  } finally {
    saveProfileButton.disabled = false;
    saveProfileButton.textContent =
      id ? "Save Changes" : "Add User";
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

  deleteDescription.textContent =
    `Delete ${student.student_name} (${student.leetcode_username})?`;

  deleteMessage.textContent = "";
  deleteMessage.className = "form-message";

  deleteModal.hidden = false;
}


function closeDelete() {
  deleteModal.hidden = true;
  pendingDeleteId = null;
}


async function confirmDelete() {
  if (!isAdmin() || pendingDeleteId === null) {
    return;
  }

  confirmDeleteButton.disabled = true;
  confirmDeleteButton.textContent = "Deleting...";

  try {
    const { error } = await supabaseClient
      .from("students")
      .delete()
      .eq("id", pendingDeleteId);

    if (error) {
      throw error;
    }

    closeDelete();

    await loadRegisteredStudents();
    renderManageStudents(directoryStudents);
    await loadData();

    messageElement.textContent =
      "Profile deleted successfully.";
  } catch (error) {
    deleteMessage.textContent =
      error.message || "Unable to delete profile.";

    deleteMessage.className = "form-message error";
  } finally {
    confirmDeleteButton.disabled = false;
    confirmDeleteButton.textContent = "Delete Profile";
  }
}


async function triggerLeetCodeSync() {
  if (!isAdmin()) {
    return;
  }

  syncNowButton.disabled = true;
  syncNowButton.textContent = "Syncing...";

  messageElement.textContent =
    "Starting cloud LeetCode sync...";

  try {
    const { data, error } =
      await supabaseClient.functions.invoke(
        "super-action",
        {
          body: {
            source: "admin-sync-button"
          }
        }
      );

    if (error) {
      throw error;
    }

    messageElement.textContent =
      "LeetCode sync started. GitHub Actions is checking all profiles.";

    console.log("Sync response:", data);
  } catch (error) {
    console.error(error);

    messageElement.textContent =
      `Unable to start LeetCode sync: ${error.message}`;
  } finally {
    setTimeout(() => {
      syncNowButton.disabled = false;
      syncNowButton.textContent = "↻ Sync Now";
    }, 4000);
  }
}


function csvEscape(value) {
  const text = String(value ?? "");

  return /[",\n]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}


function downloadCSV() {
  if (!visibleStudents.length) {
    return;
  }

  const rows = [
    exportColumns,
    ...visibleStudents.map(
      (student) =>
        exportColumns.map(
          (column) => student[column] ?? ""
        )
    )
  ];

  const blob = new Blob(
    [
      "\uFEFF"
      + rows
        .map((row) => row.map(csvEscape).join(","))
        .join("\r\n")
    ],
    {
      type: "text/csv;charset=utf-8"
    }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "LeetCode_Leaderboard.csv";

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}


function downloadPDF() {
  window.print();
}


async function initialize() {
  try {
    createClient();

    // The public leaderboard loads immediately without authentication.
    await loadData();

    // If an admin session already exists, restore Admin Mode.
    await restoreAdminSession();

    updateAdminUI();
  } catch (error) {
    console.error(error);
    messageElement.textContent = error.message;
  }
}


searchInput.addEventListener("input", applySearch);

document
  .getElementById("downloadCsvButton")
  .addEventListener("click", downloadCSV);

document
  .getElementById("downloadPdfButton")
  .addEventListener("click", downloadPDF);

adminLoginButton.addEventListener("click", openAdminLogin);
adminLoginForm.addEventListener("submit", handleAdminLogin);
adminLogoutButton.addEventListener("click", adminLogout);

closeAdminLogin.addEventListener("click", closeAdminLoginModal);

adminLoginModal
  .querySelectorAll("[data-close-admin-login]")
  .forEach((element) =>
    element.addEventListener("click", closeAdminLoginModal)
  );

toggleAdminPassword.addEventListener("click", () => {
  const visible = adminPassword.type === "text";

  adminPassword.type = visible ? "password" : "text";
  toggleAdminPassword.textContent = visible ? "Show" : "Hide";
});

addProfileButton.addEventListener("click", openAddModal);
syncNowButton.addEventListener("click", triggerLeetCodeSync);
manageStudentsButton.addEventListener("click", openManageStudents);

closeManageStudents.addEventListener("click", closeManageStudentsModal);

manageStudentsModal
  .querySelectorAll("[data-close-manage]")
  .forEach((element) =>
    element.addEventListener("click", closeManageStudentsModal)
  );

manageSearch.addEventListener("input", filterManageStudents);

manageStudentsBody.addEventListener("click", (event) => {
  const editButton =
    event.target.closest("[data-manage-edit]");

  if (editButton) {
    openEditModal(editButton.dataset.manageEdit);
    return;
  }

  const deleteButton =
    event.target.closest("[data-manage-delete]");

  if (deleteButton) {
    openDeleteModal(deleteButton.dataset.manageDelete);
  }
});

closeProfileModal.addEventListener("click", closeProfile);

profileModal
  .querySelectorAll("[data-close-profile]")
  .forEach((element) =>
    element.addEventListener("click", closeProfile)
  );

profileForm.addEventListener("submit", saveProfile);

usernameInput.addEventListener("input", () => {
  generatedLink.textContent =
    `https://leetcode.com/u/${usernameInput.value.trim() || "username"}/`;
});

cancelDeleteButton.addEventListener("click", closeDelete);

deleteModal
  .querySelectorAll("[data-close-delete]")
  .forEach((element) =>
    element.addEventListener("click", closeDelete)
  );

confirmDeleteButton.addEventListener("click", confirmDelete);

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (!adminLoginModal.hidden) {
    closeAdminLoginModal();
  }

  if (!profileModal.hidden) {
    closeProfile();
  }

  if (!manageStudentsModal.hidden) {
    closeManageStudentsModal();
  }

  if (!deleteModal.hidden) {
    closeDelete();
  }
});

initialize();

// Public data refresh only. This does NOT trigger GitHub Actions.
setInterval(() => {
  if (!document.hidden) {
    loadData();
  }
}, 30000);
