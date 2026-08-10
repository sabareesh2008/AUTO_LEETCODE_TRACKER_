let supabaseClient = null;
let currentUser = null;
let currentRole = null;

let allStudents = [];
let visibleStudents = [];
let directoryStudents = [];

let historyRows = [];
let dailyActivityRows = [];
let profileDataLoaded = false;

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
const homeFacultyAnalyticsButton = document.getElementById("homeFacultyAnalyticsButton");
const facultyAnalyticsButton = document.getElementById("facultyAnalyticsButton");

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



function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
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




function calculateSectionChampionship() {
  const results = SECTION_NAMES.map((section) => {
    const students = allStudents.filter(
      (student) =>
        String(student.Section || "").trim().toUpperCase()
        === section.toUpperCase()
    );

    const last30 = students.reduce(
      (sum, student) =>
        sum + toNumber(student["Last 30 Days"]),
      0
    );

    const last7 = students.reduce(
      (sum, student) =>
        sum + toNumber(student["Last 7 Days"]),
      0
    );

    const activeStudents = students.filter(
      (student) =>
        toNumber(student["Last 30 Days"]) > 0
    ).length;

    const average =
      students.length > 0
        ? last30 / students.length
        : 0;

    return {
      section,
      studentCount: students.length,
      last30,
      last7,
      activeStudents,
      average
    };
  });

  return results.sort((a, b) => {
    return (
      b.last30 - a.last30
      || b.last7 - a.last7
      || b.activeStudents - a.activeStudents
      || b.average - a.average
      || a.section.localeCompare(b.section)
    );
  });
}

function championshipRankLabel(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

function renderSectionChampionship() {
  const ranking = calculateSectionChampionship();

  const championBox = document.getElementById(
    "championshipChampion"
  );

  const hasAnyStudents = ranking.some(
    (item) => item.studentCount > 0
  );

  if (!hasAnyStudents) {
    championBox.innerHTML = `
      <span>Current Champion</span>
      <strong>No section data yet</strong>
    `;
  } else {
    const champion = ranking[0];

    championBox.innerHTML = `
      <span>Current Champion</span>
      <strong>🏆 ${escapeHTML(champion.section)}</strong>
      <small>${champion.last30} problems in 30 days</small>
    `;
  }

  const rankGrid = document.getElementById(
    "championshipRankGrid"
  );

  rankGrid.innerHTML = ranking.map((item, index) => {
    const rank = index + 1;

    return `
      <button
        type="button"
        class="championship-section-rank-card rank-card-${rank}"
        data-championship-section="${escapeHTML(item.section)}"
      >
        <div class="championship-rank-top">
          <span class="championship-rank-number">
            ${championshipRankLabel(rank)}
          </span>

          <span class="championship-section-name">
            ${escapeHTML(item.section)}
          </span>
        </div>

        <div class="championship-rank-metrics">
          <div>
            <span>30 Days</span>
            <strong>${item.last30}</strong>
          </div>

          <div>
            <span>7 Days</span>
            <strong>${item.last7}</strong>
          </div>

          <div>
            <span>Active</span>
            <strong>${item.activeStudents}</strong>
          </div>

          <div>
            <span>Students</span>
            <strong>${item.studentCount}</strong>
          </div>
        </div>

        <div class="championship-rank-average">
          Avg / Student:
          <strong>${item.average.toFixed(1)}</strong>
        </div>
      </button>
    `;
  }).join("");
}

document
  .getElementById("championshipCard")
  .addEventListener("click", (event) => {
    const card = event.target.closest(
      "[data-championship-section]"
    );

    if (!card) {
      return;
    }

    const section =
      card.dataset.championshipSection;

    openSection(section);
  });

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

  renderSectionChampionship();
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
          <button
            class="student-name student-profile-link"
            type="button"
            data-profile-register="${escapeHTML(student["Register Number"])}"
            title="Open student progress profile"
          >
            ${escapeHTML(student["Student Name"])} ↗
          </button>

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

  // Allow History.csv / DailyActivity.csv to refresh after tracker updates.
  profileDataLoaded = false;

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




// ============================================================
// ADMIN FACULTY ANALYTICS DASHBOARD
// ============================================================

const facultyAnalyticsModal =
  document.getElementById("facultyAnalyticsModal");

const closeFacultyAnalyticsButton =
  document.getElementById("closeFacultyAnalytics");

const analyticsSectionFilter =
  document.getElementById("analyticsSectionFilter");

function getAnalyticsStudents() {
  const section = analyticsSectionFilter.value;

  if (section === "ALL") {
    return [...allStudents];
  }

  return allStudents.filter(
    (student) =>
      normalizeSection(student.Section) === section
  );
}

function renderAnalyticsKpis(students) {
  const total = students.length;

  const activeToday = students.filter(
    (student) => toNumber(student["Solved Today"]) > 0
  ).length;

  const active7 = students.filter(
    (student) => toNumber(student["Last 7 Days"]) > 0
  ).length;

  const inactive7 = Math.max(0, total - active7);

  const total30 = students.reduce(
    (sum, student) =>
      sum + toNumber(student["Last 30 Days"]),
    0
  );

  const average30 =
    total > 0 ? total30 / total : 0;

  document.getElementById("analyticsTotalStudents").textContent =
    total;

  document.getElementById("analyticsActiveToday").textContent =
    activeToday;

  document.getElementById("analyticsActive7Days").textContent =
    active7;

  document.getElementById("analyticsInactive7Days").textContent =
    inactive7;

  document.getElementById("analytics30DaySolves").textContent =
    total30;

  document.getElementById("analyticsAverage30").textContent =
    average30.toFixed(1);
}

function renderAnalyticsSectionBars() {
  const rows = SECTION_NAMES.map((section) => {
    const students = allStudents.filter(
      (student) =>
        normalizeSection(student.Section) === section
    );

    const value = students.reduce(
      (sum, student) =>
        sum + toNumber(student["Last 30 Days"]),
      0
    );

    return {
      label: section,
      value
    };
  });

  const maximum = Math.max(
    1,
    ...rows.map((row) => row.value)
  );

  document.getElementById("analyticsSectionBars").innerHTML =
    rows.map((row) => `
      <div class="analytics-bar-row">
        <span>${escapeHTML(row.label)}</span>

        <div class="analytics-bar-track">
          <span
            class="analytics-bar-fill"
            style="width:${row.value ? Math.max(4, row.value / maximum * 100) : 0}%"
          ></span>
        </div>

        <strong>${row.value}</strong>
      </div>
    `).join("");
}

function renderAnalyticsDifficulty(students) {
  const totals = [
    {
      label: "Easy",
      value: students.reduce(
        (sum, student) => sum + toNumber(student.Easy),
        0
      )
    },
    {
      label: "Medium",
      value: students.reduce(
        (sum, student) => sum + toNumber(student.Medium),
        0
      )
    },
    {
      label: "Hard",
      value: students.reduce(
        (sum, student) => sum + toNumber(student.Hard),
        0
      )
    }
  ];

  const maximum = Math.max(
    1,
    ...totals.map((item) => item.value)
  );

  document.getElementById("analyticsDifficultyBars").innerHTML =
    totals.map((item) => `
      <div class="analytics-bar-row">
        <span>${item.label}</span>

        <div class="analytics-bar-track">
          <span
            class="analytics-bar-fill analytics-${item.label.toLowerCase()}"
            style="width:${item.value ? Math.max(4, item.value / maximum * 100) : 0}%"
          ></span>
        </div>

        <strong>${item.value}</strong>
      </div>
    `).join("");
}

function renderAnalyticsTopStudents(students) {
  const rows = [...students]
    .sort((a, b) =>
      toNumber(b["Last 30 Days"]) - toNumber(a["Last 30 Days"])
      || toNumber(b["Last 7 Days"]) - toNumber(a["Last 7 Days"])
      || toNumber(b["Problems Solved"]) - toNumber(a["Problems Solved"])
      || String(a["Student Name"]).localeCompare(String(b["Student Name"]))
    )
    .slice(0, 10);

  const body =
    document.getElementById("analyticsTopStudents");

  if (!rows.length) {
    body.innerHTML = `
      <tr>
        <td colspan="6" class="analytics-empty">
          No students in this scope.
        </td>
      </tr>
    `;
    return;
  }

  body.innerHTML = rows.map((student, index) => `
    <tr>
      <td><strong>#${index + 1}</strong></td>

      <td>
        <button
          type="button"
          class="analytics-student-link"
          data-analytics-profile="${escapeHTML(student["Register Number"])}"
        >
          ${escapeHTML(student["Student Name"])}
        </button>
      </td>

      <td>${escapeHTML(student.Section)}</td>
      <td><strong>${toNumber(student["Last 30 Days"])}</strong></td>
      <td>${toNumber(student["Last 7 Days"])}</td>
      <td>${toNumber(student["Problems Solved"])}</td>
    </tr>
  `).join("");
}

function renderAnalyticsInactiveStudents(students) {
  const rows = [...students]
    .filter(
      (student) =>
        toNumber(student["Last 7 Days"]) === 0
    )
    .sort((a, b) =>
      toNumber(a["Last 30 Days"]) - toNumber(b["Last 30 Days"])
      || String(a["Student Name"]).localeCompare(String(b["Student Name"]))
    )
    .slice(0, 20);

  const body =
    document.getElementById("analyticsInactiveStudents");

  if (!rows.length) {
    body.innerHTML = `
      <tr>
        <td colspan="5" class="analytics-empty">
          No inactive students in this scope.
        </td>
      </tr>
    `;
    return;
  }

  body.innerHTML = rows.map((student) => `
    <tr>
      <td>
        <button
          type="button"
          class="analytics-student-link"
          data-analytics-profile="${escapeHTML(student["Register Number"])}"
        >
          ${escapeHTML(student["Student Name"])}
        </button>
      </td>

      <td>${escapeHTML(student.Section)}</td>
      <td>${toNumber(student["Last 7 Days"])}</td>
      <td>${toNumber(student["Last 30 Days"])}</td>
      <td>${escapeHTML(student["Last Solved"] || "–")}</td>
    </tr>
  `).join("");
}

function renderAnalyticsSectionSummary() {
  const body =
    document.getElementById("analyticsSectionSummary");

  body.innerHTML = SECTION_NAMES.map((section) => {
    const students = allStudents.filter(
      (student) =>
        normalizeSection(student.Section) === section
    );

    const total30 = students.reduce(
      (sum, student) =>
        sum + toNumber(student["Last 30 Days"]),
      0
    );

    const activeToday = students.filter(
      (student) =>
        toNumber(student["Solved Today"]) > 0
    ).length;

    const active7 = students.filter(
      (student) =>
        toNumber(student["Last 7 Days"]) > 0
    ).length;

    const average =
      students.length > 0
        ? total30 / students.length
        : 0;

    return `
      <tr>
        <td><strong>${escapeHTML(section)}</strong></td>
        <td>${students.length}</td>
        <td>${activeToday}</td>
        <td>${active7}</td>
        <td>${total30}</td>
        <td>${average.toFixed(1)}</td>
      </tr>
    `;
  }).join("");
}

function renderFacultyAnalytics() {
  const students = getAnalyticsStudents();

  const section =
    analyticsSectionFilter.value;

  document.getElementById("analyticsScopeLabel").textContent =
    section === "ALL"
      ? "All Sections"
      : section;

  renderAnalyticsKpis(students);
  renderAnalyticsSectionBars();
  renderAnalyticsDifficulty(students);
  renderAnalyticsTopStudents(students);
  renderAnalyticsInactiveStudents(students);
  renderAnalyticsSectionSummary();
}

function openFacultyAnalytics() {
  if (!isAdmin()) {
    return;
  }

  if (
    selectedSection
    && selectedSection !== "OVERALL"
  ) {
    analyticsSectionFilter.value =
      selectedSection;
  } else {
    analyticsSectionFilter.value =
      "ALL";
  }

  renderFacultyAnalytics();

  facultyAnalyticsModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeFacultyAnalytics() {
  facultyAnalyticsModal.hidden = true;

  const anotherModalOpen = [
    adminLoginModal,
    profileModal,
    manageStudentsModal,
    deleteModal,
    studentProfileModal
  ].some(
    (modal) =>
      modal && !modal.hidden
  );

  if (!anotherModalOpen) {
    document.body.classList.remove(
      "modal-open"
    );
  }
}

facultyAnalyticsButton.addEventListener(
  "click",
  openFacultyAnalytics
);

homeFacultyAnalyticsButton.addEventListener(
  "click",
  openFacultyAnalytics
);

closeFacultyAnalyticsButton.addEventListener(
  "click",
  closeFacultyAnalytics
);

facultyAnalyticsModal
  .querySelectorAll("[data-close-faculty-analytics]")
  .forEach((element) =>
    element.addEventListener(
      "click",
      closeFacultyAnalytics
    )
  );

analyticsSectionFilter.addEventListener(
  "change",
  renderFacultyAnalytics
);

facultyAnalyticsModal.addEventListener(
  "click",
  (event) => {
    const button =
      event.target.closest(
        "[data-analytics-profile]"
      );

    if (!button) {
      return;
    }

    closeFacultyAnalytics();

    openStudentProfile(
      button.dataset.analyticsProfile
    );
  }
);

// ============================================================
// PUBLIC STUDENT PROGRESS PROFILE
// ============================================================

const studentProfileModal = document.getElementById("studentProfileModal");
const closeStudentProfileButton = document.getElementById("closeStudentProfile");

function profileNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatProfileDate(value) {
  if (!value) return "–";

  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString(
    undefined,
    { month: "short", day: "numeric" }
  );
}

async function loadProfileData() {
  if (profileDataLoaded) return;

  const cacheBust = Date.now();

  const [historyResponse, activityResponse] = await Promise.all([
    fetch(`History.csv?time=${cacheBust}`, { cache: "no-store" }),
    fetch(`DailyActivity.csv?time=${cacheBust}`, { cache: "no-store" })
  ]);

  if (historyResponse.ok) {
    historyRows = parseCSV(await historyResponse.text());
  } else {
    historyRows = [];
  }

  if (activityResponse.ok) {
    dailyActivityRows = parseCSV(await activityResponse.text());
  } else {
    dailyActivityRows = [];
  }

  profileDataLoaded = true;
}

function renderDifficultyChart(student) {
  const values = [
    ["Easy", profileNumber(student.Easy)],
    ["Medium", profileNumber(student.Medium)],
    ["Hard", profileNumber(student.Hard)]
  ];

  const maximum = Math.max(1, ...values.map((item) => item[1]));

  document.getElementById("profileDifficultyChart").innerHTML =
    values.map(([label, value]) => {
      const width = Math.max(0, Math.min(100, (value / maximum) * 100));

      return `
        <div class="difficulty-row">
          <div class="difficulty-label">
            <span>${label}</span>
            <strong>${value}</strong>
          </div>

          <div class="difficulty-track">
            <span
              class="difficulty-fill difficulty-${label.toLowerCase()}"
              style="width:${width}%"
            ></span>
          </div>
        </div>
      `;
    }).join("");
}

function renderProgressChart(registerNumber, student) {
  const rows = historyRows
    .filter(
      (row) => String(row["Register Number"]) === String(registerNumber)
    )
    .map((row) => ({
      date: row.Date,
      total: profileNumber(row["Problems Solved"])
    }))
    .filter((row) => row.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  // One point per day. If the current LiveData value is newer, include it.
  const byDate = new Map();

  rows.forEach((row) => {
    byDate.set(String(row.date).slice(0, 10), row.total);
  });

  const updatedDate =
    String(student["Updated At"] || "").slice(0, 10);

  if (updatedDate) {
    byDate.set(
      updatedDate,
      profileNumber(student["Problems Solved"])
    );
  }

  const points = [...byDate.entries()]
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  const container = document.getElementById("profileProgressChart");
  const range = document.getElementById("profileHistoryRange");

  if (!points.length) {
    range.textContent = "";
    container.innerHTML = `
      <div class="profile-empty-chart">
        Progress history will appear after tracker snapshots are collected.
      </div>
    `;
    return;
  }

  range.textContent =
    points.length === 1
      ? formatProfileDate(points[0].date)
      : `${formatProfileDate(points[0].date)} – ${formatProfileDate(points[points.length - 1].date)}`;

  if (points.length === 1) {
    container.innerHTML = `
      <div class="single-progress-point">
        <span>${formatProfileDate(points[0].date)}</span>
        <strong>${points[0].total}</strong>
        <small>Total problems solved</small>
      </div>
    `;
    return;
  }

  const width = 760;
  const height = 260;
  const paddingLeft = 48;
  const paddingRight = 22;
  const paddingTop = 24;
  const paddingBottom = 46;

  const totals = points.map((point) => point.total);
  let minValue = Math.min(...totals);
  let maxValue = Math.max(...totals);

  if (minValue === maxValue) {
    minValue = Math.max(0, minValue - 1);
    maxValue += 1;
  }

  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const xFor = (index) =>
    paddingLeft + (index / (points.length - 1)) * plotWidth;

  const yFor = (value) =>
    paddingTop
    + ((maxValue - value) / (maxValue - minValue)) * plotHeight;

  const polyline = points
    .map((point, index) => `${xFor(index)},${yFor(point.total)}`)
    .join(" ");

  const gridValues = [
    maxValue,
    Math.round((maxValue + minValue) / 2),
    minValue
  ];

  const grid = gridValues.map((value) => {
    const y = yFor(value);

    return `
      <line
        x1="${paddingLeft}"
        y1="${y}"
        x2="${width - paddingRight}"
        y2="${y}"
        class="profile-grid-line"
      />
      <text
        x="${paddingLeft - 10}"
        y="${y + 4}"
        text-anchor="end"
        class="profile-axis-text"
      >${value}</text>
    `;
  }).join("");

  const circles = points.map((point, index) => `
    <circle
      cx="${xFor(index)}"
      cy="${yFor(point.total)}"
      r="5"
      class="profile-line-point"
    >
      <title>${formatProfileDate(point.date)}: ${point.total} solved</title>
    </circle>
  `).join("");

  const labelIndexes = [...new Set([
    0,
    Math.floor((points.length - 1) / 2),
    points.length - 1
  ])];

  const labels = labelIndexes.map((index) => `
    <text
      x="${xFor(index)}"
      y="${height - 14}"
      text-anchor="middle"
      class="profile-axis-text"
    >${formatProfileDate(points[index].date)}</text>
  `).join("");

  container.innerHTML = `
    <svg
      class="profile-progress-svg"
      viewBox="0 0 ${width} ${height}"
      role="img"
      aria-label="Problems solved over time"
    >
      ${grid}

      <polyline
        points="${polyline}"
        class="profile-line-path"
      ></polyline>

      ${circles}
      ${labels}
    </svg>
  `;
}

function renderDailyActivity(registerNumber) {
  const rows = dailyActivityRows
    .filter(
      (row) => String(row["Register Number"]) === String(registerNumber)
    )
    .map((row) => ({
      date: row.Date,
      solved: profileNumber(row["Solved That Day"])
    }))
    .filter((row) => row.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-14);

  const container = document.getElementById("profileDailyActivity");

  if (!rows.length) {
    container.innerHTML = `
      <div class="profile-empty-chart">
        Daily activity will appear as completed-day data is collected.
      </div>
    `;
    return;
  }

  const maximum = Math.max(1, ...rows.map((row) => row.solved));

  container.innerHTML = rows.map((row) => {
    const width =
      row.solved === 0
        ? 0
        : Math.max(7, (row.solved / maximum) * 100);

    return `
      <div class="activity-row">
        <span class="activity-date">${formatProfileDate(row.date)}</span>

        <div class="activity-track">
          <span
            class="activity-fill"
            style="width:${width}%"
          ></span>
        </div>

        <strong>${row.solved}</strong>
      </div>
    `;
  }).join("");
}

async function openStudentProfile(registerNumber) {
  const student = allStudents.find(
    (item) =>
      String(item["Register Number"]) === String(registerNumber)
  );

  if (!student) return;

  studentProfileModal.hidden = false;
  document.body.classList.add("modal-open");

  const initials = String(student["Student Name"] || "S")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  document.getElementById("studentAvatar").textContent = initials || "S";
  document.getElementById("studentProfileName").textContent =
    student["Student Name"] || "Student";
  document.getElementById("profileRegisterNumber").textContent =
    student["Register Number"] || "–";
  document.getElementById("profileUsername").textContent =
    `@${student["LeetCode Username"] || "username"}`;
  document.getElementById("profileSection").textContent =
    student.Section || "ECE";
  document.getElementById("profileStatus").textContent =
    student.Status || "Unknown";

  document.getElementById("profileSectionRank").textContent =
    `#${student["Section Rank"] || "–"}`;
  document.getElementById("profileOverallRank").textContent =
    `#${student["Overall Rank"] || "–"}`;

  document.getElementById("profileTotalSolved").textContent =
    student["Problems Solved"] || "0";
  document.getElementById("profile30Days").textContent =
    student["Last 30 Days"] || "0";
  document.getElementById("profile7Days").textContent =
    student["Last 7 Days"] || "0";
  document.getElementById("profileToday").textContent =
    student["Solved Today"] || "0";

  document.getElementById("profileLastProblem").textContent =
    student["Last Problem"] || "–";
  document.getElementById("profileLastSolved").textContent =
    student["Last Solved"] || "–";

  const leetCodeLink = document.getElementById("profileLeetCodeLink");
  leetCodeLink.href =
    student["LeetCode Link"]
    || `https://leetcode.com/u/${encodeURIComponent(student["LeetCode Username"] || "")}/`;

  renderDifficultyChart(student);

  document.getElementById("profileProgressChart").innerHTML =
    `<div class="profile-empty-chart">Loading progress...</div>`;

  document.getElementById("profileDailyActivity").innerHTML =
    `<div class="profile-empty-chart">Loading activity...</div>`;

  try {
    await loadProfileData();
    renderProgressChart(registerNumber, student);
    renderDailyActivity(registerNumber);
  } catch (error) {
    console.error(error);

    document.getElementById("profileProgressChart").innerHTML =
      `<div class="profile-empty-chart">Unable to load History.csv.</div>`;

    document.getElementById("profileDailyActivity").innerHTML =
      `<div class="profile-empty-chart">Unable to load DailyActivity.csv.</div>`;
  }
}

function closeStudentProfile() {
  studentProfileModal.hidden = true;

  // Keep scrolling locked only if another modal is still open.
  const anotherModalOpen = [
    adminLoginModal,
    profileModal,
    manageStudentsModal,
    deleteModal
  ].some((modal) => modal && !modal.hidden);

  if (!anotherModalOpen) {
    document.body.classList.remove("modal-open");
  }
}

tableBody.addEventListener("click", (event) => {
  const profileButton = event.target.closest("[data-profile-register]");

  if (!profileButton) return;

  openStudentProfile(profileButton.dataset.profileRegister);
});

closeStudentProfileButton.addEventListener("click", closeStudentProfile);

studentProfileModal
  .querySelectorAll("[data-close-student-profile]")
  .forEach((element) =>
    element.addEventListener("click", closeStudentProfile)
  );


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
  studentProfileModal.hidden = true;
  facultyAnalyticsModal.hidden = true;
  document.body.classList.remove("modal-open");
});

initialize();

setInterval(() => {
  if (!document.hidden) {
    loadData().catch(console.error);
  }
}, 30000);
