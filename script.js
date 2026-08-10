let supabaseClient = null;
let currentUser = null;
let currentRole = null;

let allStudents = [];
let visibleStudents = [];
let directoryStudents = [];

let selectedSection = null;
let pendingDeleteId = null;

const cfg = window.APP_CONFIG || {};

const sectionHome = document.getElementById("sectionHome");
const leaderboardView = document.getElementById("leaderboardView");
const backToSectionsButton = document.getElementById("backToSectionsButton");

const currentViewLabel = document.getElementById("currentViewLabel");
const currentViewTitle = document.getElementById("currentViewTitle");
const printTitle = document.getElementById("printTitle");
const rankLegendText = document.getElementById("rankLegendText");

const tableBody = document.getElementById("studentTableBody");
const messageElement = document.getElementById("message");
const searchInput = document.getElementById("searchInput");

const adminLoginButton = document.getElementById("adminLoginButton");
const adminLogoutButton = document.getElementById("adminLogoutButton");
const homeAdminLogoutButton = document.getElementById("homeAdminLogoutButton");
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

const homeAddProfileButton = document.getElementById("homeAddProfileButton");
const homeSyncNowButton = document.getElementById("homeSyncNowButton");
const homeManageStudentsButton = document.getElementById("homeManageStudentsButton");

const profileModal = document.getElementById("profileModal");
const profileForm = document.getElementById("profileForm");
const closeProfileModal = document.getElementById("closeProfileModal");
const editingStudentId = document.getElementById("editingStudentId");
const registerNumberInput = document.getElementById("registerNumber");
const studentNameInput = document.getElementById("studentName");
const usernameInput = document.getElementById("leetcodeUsername");
const studentSectionInput = document.getElementById("studentSection");
const generatedLink = document.getElementById("generatedLink");
const formMessage = document.getElementById("formMessage");
const saveProfileButton = document.getElementById("saveProfileButton");

const manageStudentsModal = document.getElementById("manageStudentsModal");
const closeManageStudents = document.getElementById("closeManageStudents");
const manageStudentsBody = document.getElementById("manageStudentsBody");
const manageSearch = document.getElementById("manageSearch");
const manageCount = document.getElementById("manageCount");
const manageSectionFilter = document.getElementById("manageSectionFilter");

const deleteModal = document.getElementById("deleteModal");
const deleteDescription = document.getElementById("deleteDescription");
const deleteMessage = document.getElementById("deleteMessage");
const cancelDeleteButton = document.getElementById("cancelDeleteButton");
const confirmDeleteButton = document.getElementById("confirmDeleteButton");

const SECTION_NAMES = [
  "ECE A",
  "ECE B",
  "ECE C",
  "ECE D",
  "ECE E",
  "ECE F"
];

const exportColumns = [
  "Overall Rank",
  "Section Rank",
  "Section",
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

  supabaseClient = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY
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
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }

      row.push(value);

      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }

      row = [];
      value = "";
    } else {
      value += char;
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
      headers.map((header, index) => [
        header,
        (cells[index] ?? "").trim()
      ])
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


function updateSectionCounts() {
  const counts = {
    "ECE A": 0,
    "ECE B": 0,
    "ECE C": 0,
    "ECE D": 0,
    "ECE E": 0,
    "ECE F": 0
  };

  allStudents.forEach((student) => {
    if (counts[student.Section] !== undefined) {
      counts[student.Section] += 1;
    }
  });

  document.getElementById("countECEA").textContent = counts["ECE A"];
  document.getElementById("countECEB").textContent = counts["ECE B"];
  document.getElementById("countECEC").textContent = counts["ECE C"];
  document.getElementById("countECED").textContent = counts["ECE D"];
  document.getElementById("countECEE").textContent = counts["ECE E"];
  document.getElementById("countECEF").textContent = counts["ECE F"];
  document.getElementById("countOverall").textContent = allStudents.length;
}


function updateLastUpdated() {
  const updatedAt =
    allStudents.map((student) => student["Updated At"]).find(Boolean)
    || "Waiting for tracker";

  document.getElementById("lastUpdated").textContent = updatedAt;
  document.getElementById("printUpdatedAt").textContent =
    `Last updated: ${updatedAt}`;
}


function getCurrentViewStudents() {
  if (selectedSection === "OVERALL") {
    return [...allStudents];
  }

  return allStudents.filter(
    (student) => student.Section === selectedSection
  );
}


function getDisplayRank(student) {
  if (selectedSection === "OVERALL") {
    return student["Overall Rank"];
  }

  return student["Section Rank"];
}


function sortForDisplay(students) {
  return [...students].sort((a, b) =>
    String(a["Register Number"] || "").localeCompare(
      String(b["Register Number"] || ""),
      undefined,
      { numeric: true }
    )
  );
}


function renderStudents(students) {
  students = sortForDisplay(students);
  visibleStudents = students;

  const overall = selectedSection === "OVERALL";
  const columnCount = overall ? 14 : 13;

  document.querySelectorAll(".overall-only").forEach((element) => {
    element.hidden = !overall;
  });

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
    const rank = getDisplayRank(student);

    const sectionCell = overall
      ? `<td><span class="section-pill">${escapeHTML(student.Section)}</span></td>`
      : "";

    const status = student.Status || "";

    const statusClass =
      status === "Success"
        ? "status-success"
        : status === "Pending"
          ? "status-pending"
          : "status-error";

    return `
      <tr style="animation-delay:${Math.min(index * 25, 300)}ms">
        <td>
          <span class="rank-badge ${rankClass(rank)}">
            ${escapeHTML(rank || "–")}
          </span>
        </td>

        ${sectionCell}

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
  let students = getCurrentViewStudents();

  if (query) {
    students = students.filter((student) =>
      [
        student["Student Name"],
        student["Register Number"],
        student["LeetCode Username"],
        student["Last Problem"]
      ].some((value) =>
        String(value || "").toLowerCase().includes(query)
      )
    );
  }

  renderStudents(students);

  messageElement.textContent =
    `${students.length} student(s) shown`;
}


function openSection(section) {
  selectedSection = section;
  searchInput.value = "";

  sectionHome.hidden = true;
  leaderboardView.hidden = false;

  if (section === "OVERALL") {
    currentViewLabel.textContent = "DEPARTMENT";
    currentViewTitle.textContent = "Overall ECE Leaderboard";
    printTitle.textContent = "Overall ECE LeetCode Leaderboard";
    rankLegendText.textContent = "Overall Rank";
  } else {
    currentViewLabel.textContent = "SECTION";
    currentViewTitle.textContent = `${section} Leaderboard`;
    printTitle.textContent = `${section} LeetCode Leaderboard`;
    rankLegendText.textContent = "Section Rank";
  }

  applySearch();
}


function showSectionHome() {
  selectedSection = null;
  leaderboardView.hidden = true;
  sectionHome.hidden = false;
  searchInput.value = "";
}


async function loadData() {
  const response = await fetch(
    `LiveData.csv?time=${Date.now()}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(`LiveData.csv HTTP ${response.status}`);
  }

  allStudents = parseCSV(await response.text());

  updateSectionCounts();
  updateLastUpdated();

  if (selectedSection) {
    applySearch();
  }
}


async function fetchAdminRole(user) {
  const { data, error } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (error || data?.role !== "admin") {
    throw new Error(
      "This account is not authorized as an administrator."
    );
  }

  return "admin";
}


function openAdminLogin() {
  adminLoginMessage.textContent = "";
  adminLoginModal.hidden = false;
}


function closeAdminLoginModal() {
  adminLoginModal.hidden = true;
}


async function handleAdminLogin(event) {
  event.preventDefault();

  adminSignInButton.disabled = true;
  adminSignInButton.textContent = "Checking...";

  try {
    const { data, error } =
      await supabaseClient.auth.signInWithPassword({
        email: adminEmail.value.trim(),
        password: adminPassword.value
      });

    if (error) throw error;

    const role = await fetchAdminRole(data.user);

    currentUser = data.user;
    currentRole = role;

    adminPassword.value = "";

    closeAdminLoginModal();
    updateAdminUI();
  } catch (error) {
    await supabaseClient.auth.signOut().catch(() => {});

    currentUser = null;
    currentRole = null;
    updateAdminUI();

    adminLoginMessage.textContent = error.message;
    adminLoginMessage.className = "form-message error";
  } finally {
    adminSignInButton.disabled = false;
    adminSignInButton.textContent = "Login";
  }
}


async function restoreAdminSession() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (!session?.user) {
    updateAdminUI();
    return;
  }

  try {
    currentRole = await fetchAdminRole(session.user);
    currentUser = session.user;
  } catch {
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

  updateAdminUI();
}


async function loadRegisteredStudents() {
  if (!isAdmin()) {
    throw new Error("Administrator access required.");
  }

  const { data, error } = await supabaseClient
    .from("students")
    .select(
      "id,register_number,student_name,leetcode_username,section,created_at"
    )
    .order("section", { ascending: true })
    .order("register_number", { ascending: true });

  if (error) throw error;

  directoryStudents = data || [];
  return directoryStudents;
}


function getFilteredManagedStudents() {
  const section = manageSectionFilter.value;
  const query = manageSearch.value.trim().toLowerCase();

  return directoryStudents.filter((student) => {
    const sectionMatches =
      section === "ALL" || student.section === section;

    const textMatches =
      !query
      || [
        student.register_number,
        student.student_name,
        student.leetcode_username,
        student.section
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);

    return sectionMatches && textMatches;
  });
}


function renderManageStudents() {
  const students = getFilteredManagedStudents();

  manageCount.textContent =
    `${students.length} student${students.length === 1 ? "" : "s"}`;

  if (!students.length) {
    manageStudentsBody.innerHTML = `
      <tr>
        <td colspan="5" class="loading-row">No students found.</td>
      </tr>
    `;
    return;
  }

  manageStudentsBody.innerHTML = students.map((student) => `
    <tr>
      <td><span class="section-pill">${escapeHTML(student.section)}</span></td>

      <td>${escapeHTML(student.register_number)}</td>

      <td>${escapeHTML(student.student_name)}</td>

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
  if (!isAdmin()) return;

  manageStudentsModal.hidden = false;

  await loadRegisteredStudents();

  if (selectedSection && selectedSection !== "OVERALL") {
    manageSectionFilter.value = selectedSection;
  } else {
    manageSectionFilter.value = "ALL";
  }

  manageSearch.value = "";
  renderManageStudents();
}


function closeManageStudentsModal() {
  manageStudentsModal.hidden = true;
}


function resetProfileForm() {
  profileForm.reset();
  editingStudentId.value = "";
  formMessage.textContent = "";
  generatedLink.textContent = "https://leetcode.com/u/username/";
}


function openAddModal() {
  if (!isAdmin()) return;

  resetProfileForm();

  if (selectedSection && selectedSection !== "OVERALL") {
    studentSectionInput.value = selectedSection;
  }

  document.getElementById("profileModalTitle").textContent =
    "Add LeetCode Profile";

  saveProfileButton.textContent = "Add User";
  profileModal.hidden = false;
  document.body.classList.add("modal-open");
}


function openEditModal(studentId) {
  const student = directoryStudents.find(
    (item) => String(item.id) === String(studentId)
  );

  if (!student) return;

  resetProfileForm();

  editingStudentId.value = student.id;
  registerNumberInput.value = student.register_number;
  studentNameInput.value = student.student_name;
  usernameInput.value = student.leetcode_username;
  studentSectionInput.value = student.section;

  generatedLink.textContent =
    `https://leetcode.com/u/${student.leetcode_username}/`;

  document.getElementById("profileModalTitle").textContent =
    "Edit LeetCode Profile";

  saveProfileButton.textContent = "Save Changes";

  manageStudentsModal.hidden = true;
  profileModal.hidden = false;
  document.body.classList.add("modal-open");
}


function closeProfile() {
    profileModal.hidden = true;
    document.body.classList.remove("modal-open");
}

async function saveProfile(event) {
  event.preventDefault();

  if (!isAdmin()) return;

  const id = editingStudentId.value.trim();

  const payload = {
    register_number: registerNumberInput.value.trim(),
    student_name: studentNameInput.value.trim(),
    leetcode_username: usernameInput.value.trim(),
    section: studentSectionInput.value
  };

  saveProfileButton.disabled = true;

  try {
    let result;

    if (id) {
      result = await supabaseClient
        .from("students")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
    } else {
      result = await supabaseClient
        .from("students")
        .insert(payload)
        .select()
        .single();
    }

    if (result.error) throw result.error;

    formMessage.textContent =
      id ? "Profile updated successfully." : "Profile added successfully.";

    formMessage.className = "form-message success";

    await loadData();

    setTimeout(closeProfile, 700);
  } catch (error) {
    formMessage.textContent = error.message;
    formMessage.className = "form-message error";
  } finally {
    saveProfileButton.disabled = false;
    saveProfileButton.textContent = id ? "Save Changes" : "Add User";
  }
}


function openDeleteModal(studentId) {
  const student = directoryStudents.find(
    (item) => String(item.id) === String(studentId)
  );

  if (!student) return;

  pendingDeleteId = student.id;

  deleteDescription.textContent =
    `Delete ${student.student_name} (${student.section})?`;

  deleteModal.hidden = false;
}


function closeDelete() {
  deleteModal.hidden = true;
  pendingDeleteId = null;
}


async function confirmDelete() {
  if (!isAdmin() || pendingDeleteId === null) return;

  confirmDeleteButton.disabled = true;

  try {
    const { error } = await supabaseClient
      .from("students")
      .delete()
      .eq("id", pendingDeleteId);

    if (error) throw error;

    closeDelete();

    await loadRegisteredStudents();
    renderManageStudents();
    await loadData();
  } catch (error) {
    deleteMessage.textContent = error.message;
    deleteMessage.className = "form-message error";
  } finally {
    confirmDeleteButton.disabled = false;
  }
}


async function triggerLeetCodeSync() {
  if (!isAdmin()) return;

  const buttons = [syncNowButton, homeSyncNowButton].filter(Boolean);

  buttons.forEach((button) => {
    button.disabled = true;
    button.textContent = "Syncing...";
  });

  try {
    const { data, error } =
      await supabaseClient.functions.invoke(
        "super-action",
        {
          body: { source: "admin-sync-button" }
        }
      );

    if (error) throw error;

    if (messageElement) {
      messageElement.textContent =
        "LeetCode sync started. GitHub Actions is checking all profiles.";
    }

    console.log(data);
  } catch (error) {
    if (messageElement) {
      messageElement.textContent =
        `Unable to start sync: ${error.message}`;
    }
  } finally {
    setTimeout(() => {
      buttons.forEach((button) => {
        button.disabled = false;
        button.textContent = "↻ Sync Now";
      });
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
  const rows = [
    exportColumns,
    ...visibleStudents.map((student) =>
      exportColumns.map((column) => student[column] ?? "")
    )
  ];

  const blob = new Blob(
    [
      "\uFEFF"
      + rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")
    ],
    { type: "text/csv;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  const fileName =
    selectedSection === "OVERALL"
      ? "ECE_Overall_Leaderboard.csv"
      : `${selectedSection.replace(" ", "_")}_Leaderboard.csv`;

  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);
}


function downloadPDF() {
  window.print();
}


async function initialize() {
  createClient();
  await loadData();
  await restoreAdminSession();
  updateAdminUI();
}


document.querySelectorAll("[data-section]").forEach((button) => {
  button.addEventListener("click", () => {
    openSection(button.dataset.section);
  });
});

backToSectionsButton.addEventListener("click", showSectionHome);

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
homeAdminLogoutButton.addEventListener("click", adminLogout);

closeAdminLogin.addEventListener("click", closeAdminLoginModal);

adminLoginModal
  .querySelectorAll("[data-close-admin-login]")
  .forEach((element) =>
    element.addEventListener("click", closeAdminLoginModal)
  );

toggleAdminPassword.addEventListener("click", () => {
  const showing = adminPassword.type === "text";
  adminPassword.type = showing ? "password" : "text";
  toggleAdminPassword.textContent = showing ? "Show" : "Hide";
});

addProfileButton.addEventListener("click", openAddModal);
homeAddProfileButton.addEventListener("click", openAddModal);

syncNowButton.addEventListener("click", triggerLeetCodeSync);
homeSyncNowButton.addEventListener("click", triggerLeetCodeSync);

manageStudentsButton.addEventListener("click", openManageStudents);
homeManageStudentsButton.addEventListener("click", openManageStudents);

closeManageStudents.addEventListener("click", closeManageStudentsModal);

manageStudentsModal
  .querySelectorAll("[data-close-manage]")
  .forEach((element) =>
    element.addEventListener("click", closeManageStudentsModal)
  );

manageSearch.addEventListener("input", renderManageStudents);
manageSectionFilter.addEventListener("change", renderManageStudents);

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
  if (event.key !== "Escape") return;

  adminLoginModal.hidden = true;
  profileModal.hidden = true;
  manageStudentsModal.hidden = true;
  deleteModal.hidden = true;
});

initialize();

setInterval(() => {
  if (!document.hidden) {
    loadData().catch(console.error);
  }
}, 30000);
