// ===========================
// STAFF MANAGEMENT JS
// ===========================
const db = window.supabaseClient;

let currentStaffId = null;       // for view/edit modal
let editingPaymentId = null;     // for payment edit

// ===========================
// AUTH GUARD + INIT
// ===========================
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const { data: { user }, error: authError } = await db.auth.getUser();

    if (authError || !user) {
      window.location.href = "login.html";
      return;
    }

    const SESSION_TIMEOUT = 1000 * 60 * 60 * 6;
    const loginTime = localStorage.getItem("loginTime");

    if (!loginTime) {
      localStorage.setItem("loginTime", Date.now());
    } else {
      if (Date.now() - Number(loginTime) > SESSION_TIMEOUT) {
        await db.auth.signOut();
        sessionStorage.clear();
        localStorage.removeItem("loginTime");
        window.location.href = "login.html";
        return;
      }
    }

    const { data: profile, error: roleError } = await db
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .single();

    if (roleError || !profile?.role) {
      window.location.href = "login.html";
      return;
    }

    const role = profile.role;
    window.currentRole = role;
    sessionStorage.setItem("role", role);
    sessionStorage.setItem("full_name", profile.full_name || "");

    localStorage.setItem("loginTime", Date.now());

    // Only mudeer, assistant_mudeer, bursar, registrar allowed
    const allowed = ["mudeer", "assistant_mudeer"];
    if (!allowed.includes(role)) {
      alert(t("Access Denied"));
      window.location.href = "login.html";
      return;
    }

    applyStaffPagePermissions(role);
    setDashboardGreeting();
    updateUnreadCounter();

    await loadStaff();
    await loadStaffStats();

    // Search & filter listeners
    document.getElementById("searchStaff")?.addEventListener("input", filterStaffTable);
    document.getElementById("filterRole")?.addEventListener("change", filterStaffTable);
    document.getElementById("filterStatus")?.addEventListener("change", filterStaffTable);

    // Logout
    document.getElementById("logoutBtn")?.addEventListener("click", async () => {
      await db.auth.signOut();
      sessionStorage.clear();
      localStorage.removeItem("loginTime");
      window.location.href = "login.html";
    });

    // Default payment year to current
    const payYearEl = document.getElementById("payYear");
    if (payYearEl) payYearEl.value = new Date().getFullYear();

    // Default payment month to current
    const payMonthEl = document.getElementById("payMonth");
    if (payMonthEl) payMonthEl.value = new Date().getMonth() + 1;

  } catch (err) {
    console.error("Staff page init error:", err);
  }
});

// ===========================
// ROLE PERMISSIONS
// ===========================
function applyStaffPagePermissions(role) {
  // Only mudeer/assistant can add, edit, delete staff
  const canManage = ["mudeer", "assistant_mudeer"].includes(role);
  // Bursar can manage payments only
  const canPay = ["mudeer", "assistant_mudeer", "bursar"].includes(role);

  document.querySelectorAll(".admin-only").forEach(el => {
    el.style.display = canManage ? "" : "none";
  });

  document.querySelectorAll(".pay-only").forEach(el => {
    el.style.display = canPay ? "" : "none";
  });
}

// ===========================
// UTILITIES (match admin-dashboard.js exactly)
// ===========================
function showToast(msg) {
  const toast = document.getElementById("admin-toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function setLoading(btn, loading = true) {
  if (!btn) return;
  btn.disabled = loading;
  btn.dataset.text ||= btn.innerHTML;
  btn.innerHTML = loading
    ? `<i class="fa-solid fa-spinner fa-spin"></i> ${t("Please wait...")}`
    : btn.dataset.text;
}

function formatRole(role) {
  const map = {
    mudeer: t("Director"),
    assistant_mudeer: t("Asst. Director"),
    h_o_d: t("Head of Dept."),
    bursar: t("Bursar"),
    registrar: t("Registrar"),
    teacher: t("Teacher")
  };

  return map[role] || role;
}

function getRoleTag(role) {
  const map = {
    mudeer: `#${t("Director")}`,
    assistant_mudeer: `#${t("Asst. Director")}`,
    h_o_d: `#${t("Head of Dept.")}`,
    bursar: `#${t("Bursar")}`,
    registrar: `#${t("Registrar")}`,
    teacher: `#${t("Teacher")}`
  };

  return map[role] || `#${t("Staff")}`;
}

function getRoleBadgeClass(role) {
  const map = {
    mudeer: "badge-success",
    assistant_mudeer: "badge-info",
    h_o_d: "badge-info",
    bursar: "badge-warning",
    registrar: "badge-default",
    teacher: "badge-teacher"
  };
  return map[role] || "badge-default";
}

function getStatusBadgeClass(status) {
  const map = {
    active: "badge-success",
    inactive: "badge-danger",
    on_leave: "badge-warning"
  };
  return map[status] || "badge-default";
}

function getPayStatusBadgeClass(status) {
  const map = {
    paid: "badge-success",
    partial: "badge-warning",
    unpaid: "badge-danger"
  };
  return map[status] || "badge-default";
}

function formatStaffType(type) {
  if (!type) return "—";

  const map = {
    full_time: t("Full-time"),
    part_time: t("Part-time"),
    contract: t("Contract"),
    volunteer: t("Volunteer"),
  };

  return map[type] || type;
}

function formatDepartment(dept) {
  if (!dept) return "—";

  const map = {
    teaching: t("Teaching"),
    admin: t("Admin"),
    finance: t("Finance"),
    it: t("IT"),
  };

  return map[dept] || dept;
}

function formatMonthName(num) {
  const months = ["", "January", "February", "March", "April", "May", "June",
                  "July", "August", "September", "October", "November", "December"];
  return months[num] || num;
}

function formatCurrency(amount, currency) {
  const symbols = { NGN: "₦", USD: "$", EUR: "€", GBP: "£" };
  const sym = symbols[currency] || currency || "₦";
  return `${sym}${Number(amount || 0).toLocaleString()}`;
}

function setDashboardGreeting() {
  const role = sessionStorage.getItem("role");
  const name = sessionStorage.getItem("full_name");
  const greetingEl = document.getElementById("dashboardGreeting");
  if (!greetingEl) return;
  const welcome = t("Welcome");
  const formattedRole = formatRole(role);
  greetingEl.innerText = name
    ? `${welcome}, ${formattedRole} – ${name} 👋`
    : `${welcome}, ${formattedRole} 👋`;
}

async function updateUnreadCounter() {
  const { count } = await db
    .from("contact_messages")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false)
    .eq("deleted", false);
  const counter = document.getElementById("unreadCounter");
  if (counter) counter.textContent = count || 0;
}

// ===========================
// STATS
// ===========================
async function loadStaffStats() {
  try {
    const { data: allStaff } = await db
      .from("profiles")
      .select("status, monthly_salary")
      .not("role", "is", null);

    if (!allStaff) return;

    const total = allStaff.length;
    const active = allStaff.filter(s => s.status === "active").length;
    const payroll = allStaff
      .filter(s => s.status === "active")
      .reduce((sum, s) => sum + Number(s.monthly_salary || 0), 0);

    const totalEl = document.getElementById("totalStaff");
    const activeEl = document.getElementById("activeStaff");
    const payrollEl = document.getElementById("totalPayroll");

    if (totalEl) totalEl.textContent = total;
    if (activeEl) activeEl.textContent = active;
    if (payrollEl) payrollEl.textContent = "₦" + payroll.toLocaleString();
  } catch (e) {
    console.error("Stats error:", e);
  }
}

// ===========================
// LOAD STAFF TABLE
// ===========================
let allStaffData = [];

async function loadStaff() {
  const tbody = document.querySelector("#staff-table tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="14" class="empty-row">
    <i class="fa-solid fa-spinner fa-spin"></i> ${t("Loading...")}
  </td></tr>`;

  try {
    // Registered staff (already have a profiles row)
    const { data: profilesData, error: profilesError } = await db
      .from("profiles")
      .select("id, full_name, role, staff_type, status, monthly_salary, passport_url, email, phone, date_joined, department")
      .not("role", "is", null)
      .order("full_name", { ascending: true });

    if (profilesError) throw profilesError;

    // Pending invites (not yet registered)
    const { data: invitesData, error: invitesError } = await db
      .from("staff_invites")
      .select("id, full_name, role, staff_type, status, monthly_salary, passport_url, email, phone, date_joined, department, registered, registered_at")
      .eq("registered", false)
      .order("full_name", { ascending: true });

    if (invitesError) throw invitesError;

    const registeredRows = (profilesData || []).map(s => ({
      ...s,
      _source: "profile",
      _registered: true
    }));

    const pendingRows = (invitesData || []).map(inv => ({
      ...inv,
      _source: "invite",
      _registered: false
    }));

    allStaffData = [...registeredRows, ...pendingRows];
    renderStaffTable(allStaffData);
    window.reTranslate?.();

  } catch (e) {
    console.error("Load staff error:", e);
    tbody.innerHTML = `<tr><td colspan="14" class="empty-row">${t("Failed to load staff")}</td></tr>`;
  }
}

function renderStaffTable(data) {
  const tbody = document.querySelector("#staff-table tbody");
  if (!tbody) return;

  const canManage = ["mudeer", "assistant_mudeer"].includes(window.currentRole);
  const canPay = ["mudeer", "assistant_mudeer", "bursar"].includes(window.currentRole);

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="14" class="empty-row">${t("No staff yet")}</td></tr>`;
    return;
  }

  tbody.innerHTML = "";

  data.forEach(s => {
    const tr = document.createElement("tr");
    const roleTag = getRoleTag(s.role);
    const roleBadge = getRoleBadgeClass(s.role);
    const statusBadge = getStatusBadgeClass(s.status);
    const isPending = s._source === "invite";

    const regBadge = isPending
      ? `<span class="badge badge-warning">${t("Pending")}</span>`
      : `<span class="badge badge-success">${t("Registered")}</span>`;

    // View action: only for registered profiles (pending rows have no auth/profile yet)
    const viewAction = isPending
      ? "—"
      : `<button class="btn btn-edit" onclick="openViewStaffModal('${s.id}')">
           <i class="fa-solid fa-eye"></i> ${t("View")}
         </button>`;

    // Pay action: only for registered profiles
    const payAction = (!isPending && canPay)
      ? `<button class="btn btn-pay pay-only" onclick="openPaymentModalForStaff('${s.id}', '${(s.full_name || "").replace(/'/g, "\\'")}')">
           <i class="fa-solid fa-money-bill"></i> ${t("Pay")}
         </button>`
      : "—";

    // Invite action: only for pending invites, admin-only
    const inviteAction = (isPending && canManage)
      ? `<button class="btn btn-invite admin-only" onclick="sendStaffInvite('${s.id}', '${(s.email || "").replace(/'/g, "\\'")}')">
           <i class="fa-solid fa-paper-plane"></i> ${t("Invite")}
         </button>`
      : "—";

    // Delete action: profiles -> deleteStaff, invites -> deleteStaffInvite
    const deleteAction = canManage
      ? (isPending
          ? `<button class="btn btn-delete admin-only" onclick="deleteStaffInvite('${s.id}')">
               <i class="fa-solid fa-trash"></i>
             </button>`
          : `<button class="btn btn-delete admin-only" onclick="deleteStaff('${s.id}')">
               <i class="fa-solid fa-trash"></i>
             </button>`)
      : "—";

    tr.innerHTML = `
      <td>
        ${s.passport_url
          ? `<img src="${s.passport_url}" class="passport-thumb" 
               onclick="openStaffPassportModal('${s.passport_url}')" 
               style="cursor:pointer;">`
          : `<img src="passport-placeholder.png" class="passport-thumb">`}
      </td>
      <td>${s.full_name || "—"}</td>
      <td><span class="badge ${roleBadge}">${roleTag}</span></td>
      <td>${t(formatStaffType(s.staff_type))}</td>
      <td>${t(formatDepartment(s.department))}</td>
      <td>${s.email || "—"}</td>
      <td>${s.phone || "—"}</td>
      <td>${s.date_joined || "—"}</td>
      <td>₦${Number(s.monthly_salary || 0).toLocaleString()}</td>
      <td><span class="badge ${statusBadge}">${t(s.status || "active")}</span></td>
      <td>${regBadge}</td>
      <td>${viewAction}</td>
      <td>${payAction}${inviteAction}</td>
      <td>${deleteAction}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ===========================
// FILTER / SEARCH
// ===========================
function filterStaffTable() {
  const search = document.getElementById("searchStaff")?.value.toLowerCase() || "";
  const roleFilter = document.getElementById("filterRole")?.value || "";
  const statusFilter = document.getElementById("filterStatus")?.value || "";

  const filtered = allStaffData.filter(s => {
    const matchSearch =
      (s.full_name || "").toLowerCase().includes(search) ||
      (s.email || "").toLowerCase().includes(search) ||
      (s.phone || "").toLowerCase().includes(search) ||
      (s.department || "").toLowerCase().includes(search);

    const matchRole = roleFilter ? s.role === roleFilter : true;
    const matchStatus = statusFilter ? s.status === statusFilter : true;

    return matchSearch && matchRole && matchStatus;
  });

  renderStaffTable(filtered);
}

// ===========================
// ROLE TAG PREVIEW (Add modal)
// ===========================
function updateRoleTagPreview() {
  const role = document.getElementById("staffRole")?.value;
  const preview = document.getElementById("staffTagPreview");
  const badge = document.getElementById("staffTagBadge");
  if (!preview || !badge) return;

  if (!role) {
    preview.style.display = "none";
    return;
  }

  badge.textContent = getRoleTag(role);
  badge.className = `badge ${getRoleBadgeClass(role)}`;
  preview.style.display = "flex";
}

function updateViewRoleTagPreview() {
  const role = document.getElementById("viewStaffRole")?.value;
  const badge = document.getElementById("viewStaffRoleTag");
  if (!badge || !role) return;
  badge.textContent = getRoleTag(role);
  badge.className = `badge staff-role-badge ${getRoleBadgeClass(role)}`;
}

// ===========================
// ADD STAFF (profiles INSERT only)
// ===========================
async function saveStaff() {
  const btn = document.getElementById("saveStaffBtn");
  setLoading(btn, true);

  try {
    const full_name = document.getElementById("staffName")?.value.trim();
    const email = document.getElementById("staffEmail")?.value.trim();
    const phone = document.getElementById("staffPhone")?.value.trim();
    const role = document.getElementById("staffRole")?.value;
    const staff_type = document.getElementById("staffType")?.value;
    const department = document.getElementById("staffDepartment")?.value;
    const date_joined = document.getElementById("staffDateJoined")?.value;
    const monthly_salary = document.getElementById("staffSalary")?.value;
    const status = document.getElementById("staffStatus")?.value;
    const passportFile = document.getElementById("staffPassport")?.files[0];

    if (!full_name || !email || !role) {
      alert(t("Full name, email and role are required"));
      return;
    }

    // Upload passport if provided
    let passport_url = null;
    let passport_path = null;

    if (passportFile) {
      if (!passportFile.type.startsWith("image/")) {
        alert(t("Only image files are allowed"));
        return;
      }
      if (passportFile.size > 2 * 1024 * 1024) {
        alert(t("Passport must not exceed 2MB"));
        return;
      }

      const fileExt = passportFile.name.split(".").pop();
      const fileName = `staff_${Date.now()}_${Math.floor(Math.random() * 9999)}.${fileExt}`;

      const { error: uploadError } = await db.storage
        .from("passports")
        .upload(fileName, passportFile, { cacheControl: "3600" });

      if (uploadError) throw uploadError;

      const { data: publicData } = db.storage
        .from("passports")
        .getPublicUrl(fileName);

      passport_url = publicData.publicUrl;
      passport_path = fileName;
    }

    // INSERT into profiles
    // Note: id will be set when the staff member self-registers
    // We use a placeholder approach — insert with a generated uuid for record keeping
    // The staff member must register with the same email to get access
    const { error } = await db.from("staff_invites").insert([{
  full_name,
  email,
  phone,
  role,
  staff_type,
  department,
  date_joined: date_joined || null,
  monthly_salary: monthly_salary ? Number(monthly_salary) : null,
  status: status || "active",
  registered: false,
  ...(passport_url ? { passport_url, passport_path } : {})
}]);

    if (error) throw error;

    showToast(t("Staff record created successfully"));
    closeModal("staffModal");
    resetStaffModal();
    await loadStaff();
    await loadStaffStats();

  } catch (e) {
    console.error("Save staff error:", e);
    alert(t("Failed to save staff record. See console."));
  } finally {
    setLoading(btn, false);
  }
}

function resetStaffModal() {
  ["staffName","staffEmail","staffPhone","staffSalary","staffDateJoined"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  ["staffRole","staffType","staffDepartment","staffStatus"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = el.id === "staffStatus" ? "active" : "";
  });
  const passportInput = document.getElementById("staffPassport");
  if (passportInput) passportInput.value = "";
  const preview = document.getElementById("staffTagPreview");
  if (preview) preview.style.display = "none";
}

// ===========================
// SEND STAFF INVITE EMAIL
// ===========================
// Calls the "invite-staff" Supabase Edge Function, which securely
// uses the service_role key (server-side only) to send a real
// Supabase Auth invite email to the staff member.
async function sendStaffInvite(inviteId, email) {
  if (!email) {
    alert(t("This invite has no email address on file"));
    return;
  }

  if (!confirm(t("Send registration invite email to") + " " + email + "?")) return;

  try {
    const { data, error } = await window.supabaseClient.functions.invoke("invite-staff", {
  body: { invite_id: inviteId, email, redirect_origin: window.location.origin }
});

    if (error) throw error;

    if (data?.error) {
      throw new Error(data.error);
    }

    showToast(t("Invite email sent to") + " " + email);
    await loadStaff();

  } catch (e) {
  console.error("FULL INVITE ERROR:", e);

  if (e.context) {
    console.error("FUNCTION RESPONSE:", await e.context.text());
  }

  alert(e.message || "Invite failed");
  }
}

// ===========================
// DELETE STAFF INVITE (pending, not yet registered)
// ===========================
async function deleteStaffInvite(inviteId) {
  if (!confirm(t("Delete this pending invite? This cannot be undone."))) return;

  try {
    const { error } = await db
      .from("staff_invites")
      .delete()
      .eq("id", inviteId);

    if (error) throw error;

    showToast(t("Invite deleted"));
    await loadStaff();
    await loadStaffStats();

  } catch (e) {
    console.error("Delete invite error:", e);
    alert(t("Failed to delete invite. See console."));
  }
}

// ===========================
// VIEW / EDIT STAFF MODAL
// ===========================
async function openViewStaffModal(staffId) {
  currentStaffId = staffId;

  const { data: s, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", staffId)
    .single();

  if (error || !s) {
    showToast(t("Could not load staff record"));
    return;
  }

  // Photo
  const photoEl = document.getElementById("viewStaffPhoto");
  if (photoEl) photoEl.src = s.passport_url || "passport-placeholder.png";

  // Role tag badge
  const roleTagEl = document.getElementById("viewStaffRoleTag");
  if (roleTagEl) {
    roleTagEl.textContent = getRoleTag(s.role);
    roleTagEl.className = `badge staff-role-badge ${getRoleBadgeClass(s.role)}`;
  }

  // Name, type/dept, status
  const nameEl = document.getElementById("viewStaffName");
  if (nameEl) nameEl.textContent = s.full_name || "—";

  const typeDeptEl = document.getElementById("viewStaffTypeDept");
  if (typeDeptEl) typeDeptEl.textContent = `${formatStaffType(s.staff_type)} · ${formatDepartment(s.department)}`;

  const statusBadgeEl = document.getElementById("viewStaffStatusBadge");
  if (statusBadgeEl) {
    statusBadgeEl.textContent = t(s.status || "active");
    statusBadgeEl.className = `badge ${getStatusBadgeClass(s.status)}`;
  }

  // Form fields
  document.getElementById("viewStaffFullName").value = s.full_name || "";
  document.getElementById("viewStaffEmail").value = s.email || "";
  document.getElementById("viewStaffPhone").value = s.phone || "";
  document.getElementById("viewStaffRole").value = s.role || "";
  document.getElementById("viewStaffType").value = s.staff_type || "";
  document.getElementById("viewStaffDepartment").value = s.department || "";
  document.getElementById("viewStaffDateJoined").value = s.date_joined || "";
  document.getElementById("viewStaffSalary").value = s.monthly_salary || "";
  document.getElementById("viewStaffStatus").value = s.status || "active";

  // Check permissions — lock editing if not allowed
  const canManage = ["mudeer", "assistant_mudeer"].includes(window.currentRole);
  ["viewStaffFullName","viewStaffEmail","viewStaffPhone","viewStaffRole",
   "viewStaffType","viewStaffDepartment","viewStaffDateJoined","viewStaffSalary","viewStaffStatus"]
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = !canManage;
    });

  const saveBtn = document.querySelector("#tabDetails .btn-save");
  if (saveBtn) saveBtn.style.display = canManage ? "" : "none";

  // Default to details tab
  switchStaffTab("details", document.querySelector(".staff-tab.active") || document.querySelectorAll(".staff-tab")[0]);

  openModal("viewStaffModal");
}

async function updateStaff() {
  if (!currentStaffId) return;

  const btn = document.querySelector("#tabDetails .btn-save");
  setLoading(btn, true);

  try {
    const full_name = document.getElementById("viewStaffFullName")?.value.trim();
    const email = document.getElementById("viewStaffEmail")?.value.trim();
    const phone = document.getElementById("viewStaffPhone")?.value.trim();
    const role = document.getElementById("viewStaffRole")?.value;
    const staff_type = document.getElementById("viewStaffType")?.value;
    const department = document.getElementById("viewStaffDepartment")?.value;
    const date_joined = document.getElementById("viewStaffDateJoined")?.value;
    const monthly_salary = document.getElementById("viewStaffSalary")?.value;
    const status = document.getElementById("viewStaffStatus")?.value;

    if (!full_name || !role) {
      alert(t("Full name and role are required"));
      return;
    }

    const { error } = await db
      .from("profiles")
      .update({
        full_name,
        email,
        phone,
        role,
        staff_type,
        department,
        date_joined: date_joined || null,
        monthly_salary: monthly_salary ? Number(monthly_salary) : null,
        status
      })
      .eq("id", currentStaffId);

    if (error) throw error;

    showToast(t("Staff updated successfully"));
    closeModal("viewStaffModal");
    await loadStaff();
    await loadStaffStats();

  } catch (e) {
    console.error("Update staff error:", e);
    alert(t("Failed to update staff. See console."));
  } finally {
    setLoading(btn, false);
  }
}

// ===========================
// DELETE STAFF
// ===========================
async function deleteStaff(staffId) {
  if (!confirm(t("Are you sure you want to delete this staff record? This cannot be undone."))) return;

  try {
    // Get passport path first to clean up storage
    const { data: s } = await db
      .from("profiles")
      .select("passport_path, full_name")
      .eq("id", staffId)
      .single();

    if (s?.passport_path) {
      await db.storage.from("passports").remove([s.passport_path]);
    }

    const { error } = await db
      .from("profiles")
      .delete()
      .eq("id", staffId);

    if (error) throw error;

    showToast(t("Staff record deleted"));
    await loadStaff();
    await loadStaffStats();

  } catch (e) {
    console.error("Delete staff error:", e);
    alert(t("Failed to delete staff. See console."));
  }
}

// ===========================
// TABS (View Modal)
// ===========================
function switchStaffTab(tab, btn) {
  // Update tab buttons
  document.querySelectorAll(".staff-tab").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  // Show/hide content
  document.getElementById("tabDetails").style.display = tab === "details" ? "block" : "none";
  document.getElementById("tabPayments").style.display = tab === "payments" ? "block" : "none";

  if (tab === "payments" && currentStaffId) {
    loadPaymentHistory(currentStaffId);
  }
}

// ===========================
// PAYMENT MODAL (from table row)
// ===========================
function openPaymentModalForStaff(staffId, staffName) {
  currentStaffId = staffId;
  editingPaymentId = null;

  const titleEl = document.getElementById("paymentModalTitle");
  if (titleEl) titleEl.textContent = t("Record Payment");

  const nameEl = document.getElementById("paymentStaffName");
  if (nameEl) nameEl.textContent = staffName;

  // Reset fields
  document.getElementById("payMonth").value = new Date().getMonth() + 1;
  document.getElementById("payYear").value = new Date().getFullYear();
  document.getElementById("payAmount").value = "";
  document.getElementById("payCurrency").value = "NGN";
  document.getElementById("payStatus").value = "paid";
  document.getElementById("payDate").value = new Date().toISOString().split("T")[0];
  document.getElementById("payNote").value = "";

  openModal("paymentModal");
}

// Called from inside View modal payment tab
function openPaymentModal() {
  if (!currentStaffId) return;

  // Get staff name from view modal
  const staffName = document.getElementById("viewStaffName")?.textContent || "";
  openPaymentModalForStaff(currentStaffId, staffName);
}

// ===========================
// SAVE PAYMENT
// ===========================
async function savePayment() {
  const btn = document.getElementById("savePaymentBtn");
  setLoading(btn, true);

  try {
    const month = parseInt(document.getElementById("payMonth")?.value);
    const year = parseInt(document.getElementById("payYear")?.value);
    const amount_paid = parseFloat(document.getElementById("payAmount")?.value) || 0;
    const currency = document.getElementById("payCurrency")?.value;
    const status = document.getElementById("payStatus")?.value;
    const paid_on = document.getElementById("payDate")?.value || null;
    const note = document.getElementById("payNote")?.value.trim();

    if (!month || !year) {
      alert(t("Month and year are required"));
      return;
    }

    if (editingPaymentId) {
      // UPDATE
      const { error } = await db
        .from("staff_payments")
        .update({ month, year, amount_paid, currency, status, paid_on, note })
        .eq("id", editingPaymentId);

      if (error) throw error;
      showToast(t("Payment updated"));

    } else {
      // INSERT
      const { error } = await db
        .from("staff_payments")
        .insert([{
          staff_id: currentStaffId,
          month,
          year,
          amount_paid,
          currency,
          status,
          paid_on,
          note
        }]);

      if (error) throw error;
      showToast(t("Payment recorded"));
    }

    editingPaymentId = null;
    closeModal("paymentModal");

    // Refresh payment history if view modal is open
    if (document.getElementById("viewStaffModal")?.classList.contains("show")) {
      loadPaymentHistory(currentStaffId);
    }

  } catch (e) {
    console.error("Save payment error:", e);
    alert(t("Failed to save payment. See console."));
  } finally {
    setLoading(btn, false);
  }
}

// ===========================
// LOAD PAYMENT HISTORY
// ===========================
async function loadPaymentHistory(staffId) {
  const tbody = document.getElementById("paymentHistoryBody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="9" class="empty-row">
    <i class="fa-solid fa-spinner fa-spin"></i> ${t("Loading...")}
  </td></tr>`;

  try {
    const { data, error } = await db
      .from("staff_payments")
      .select("*")
      .eq("staff_id", staffId)
      .order("year", { ascending: false })
      .order("month", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-row">${t("No payments yet")}</td></tr>`;
      return;
    }

    tbody.innerHTML = "";

    data.forEach(p => {
      const canPay = ["mudeer", "assistant_mudeer", "bursar"].includes(window.currentRole);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${t(formatMonthName(p.month))}</td>
        <td>${p.year}</td>
        <td>${formatCurrency(p.amount_paid, p.currency)}</td>
        <td>${p.currency || "NGN"}</td>
        <td><span class="badge ${getPayStatusBadgeClass(p.status)}">${t(p.status)}</span></td>
        <td>${p.paid_on || "—"}</td>
        <td>${p.note || "—"}</td>
        <td>
          ${canPay
            ? `<button class="btn btn-edit btn-small" onclick="editPayment('${p.id}', ${JSON.stringify(p).replace(/"/g, "&quot;")})">
                 <i class="fa-solid fa-pen"></i>
               </button>`
            : "—"}
        </td>
        <td>
          ${canPay
            ? `<button class="btn btn-delete btn-small" onclick="deletePayment('${p.id}')">
                 <i class="fa-solid fa-trash"></i>
               </button>`
            : "—"}
        </td>
      `;
      tbody.appendChild(tr);
    });

    window.reTranslate?.();

  } catch (e) {
    console.error("Load payment history error:", e);
    tbody.innerHTML = `<tr><td colspan="9" class="empty-row">${t("Failed to load payments")}</td></tr>`;
  }
}

// ===========================
// EDIT PAYMENT
// ===========================
function editPayment(paymentId, paymentData) {
  editingPaymentId = paymentId;

  const titleEl = document.getElementById("paymentModalTitle");
  if (titleEl) titleEl.textContent = t("Edit Payment");

  const staffName = document.getElementById("viewStaffName")?.textContent || "";
  const nameEl = document.getElementById("paymentStaffName");
  if (nameEl) nameEl.textContent = staffName;

  document.getElementById("payMonth").value = paymentData.month;
  document.getElementById("payYear").value = paymentData.year;
  document.getElementById("payAmount").value = paymentData.amount_paid || "";
  document.getElementById("payCurrency").value = paymentData.currency || "NGN";
  document.getElementById("payStatus").value = paymentData.status || "paid";
  document.getElementById("payDate").value = paymentData.paid_on || "";
  document.getElementById("payNote").value = paymentData.note || "";

  openModal("paymentModal");
}

// ===========================
// DELETE PAYMENT
// ===========================
async function deletePayment(paymentId) {
  if (!confirm(t("Delete this payment record?"))) return;

  const { error } = await db
    .from("staff_payments")
    .delete()
    .eq("id", paymentId);

  if (error) {
    alert(t("Failed to delete payment"));
    return;
  }

  showToast(t("Payment deleted"));
  loadPaymentHistory(currentStaffId);
}

// ===========================
// PASSPORT PREVIEW MODAL
// ===========================
function openStaffPassportModal(url) {
  const modal = document.getElementById("staffPassportModal");
  const preview = document.getElementById("staffPassportPreview");
  if (!modal || !preview) return;
  preview.src = url;
  modal.classList.add("show");
}

function closeStaffPassportModal() {
  const modal = document.getElementById("staffPassportModal");
  const preview = document.getElementById("staffPassportPreview");
  if (modal) modal.classList.remove("show");
  if (preview) preview.src = "";
}

window.addEventListener("click", (e) => {
  const modal = document.getElementById("staffPassportModal");
  if (e.target === modal) closeStaffPassportModal();
});
