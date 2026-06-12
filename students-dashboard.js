// ===========================
// Student Session Restore + Guard
// ===========================
const DEV_BYPASS = false;

(function () {
  if (DEV_BYPASS) return;

  // Try to restore from localStorage if sessionStorage is empty
  const role = sessionStorage.getItem("role");
  if (!role) {
    const raw = localStorage.getItem("studentSession");
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        if (saved.expiresAt && Date.now() < saved.expiresAt) {
          sessionStorage.setItem("role", saved.role);
          sessionStorage.setItem("matric", saved.matric);
          sessionStorage.setItem("currentStudent", saved.currentStudent);
        } else {
          // Expired — clean up
          localStorage.removeItem("studentSession");
        }
      } catch (e) {
        localStorage.removeItem("studentSession");
      }
    }
  }

  const restoredRole = sessionStorage.getItem("role");
  const restoredMatric = sessionStorage.getItem("matric");

  if (restoredRole !== "student" || !restoredMatric) {
    alert(t("Student login required"));
    window.location.href = "login.html";
  }
})();

const matric = sessionStorage.getItem("matric");

// ===========================
// Students Dashboard JS
// ===========================
document.addEventListener("DOMContentLoaded", () => {
  const message = sessionStorage.getItem("welcomeMessage");
  if (!message) return;

  const banner = document.createElement("div");
  banner.innerHTML = `<strong>${message}</strong>`;

  banner.style.position = "fixed";
  banner.style.top = "0";
  banner.style.left = "0";
  banner.style.width = "100%";
  banner.style.background = "linear-gradient(135deg, #3b82f6, #2563eb)";
  banner.style.color = "#fff";
  banner.style.fontSize = "1.2rem";
  banner.style.fontWeight = "bold";
  banner.style.textAlign = "center";
  banner.style.padding = "1rem 0";
  banner.style.zIndex = "9999";
  banner.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
  banner.style.transition = "opacity 0.7s ease";

  document.body.appendChild(banner);

  // Stay longer on dashboard
  setTimeout(() => {
    banner.style.opacity = "0";
    setTimeout(() => banner.remove(), 700);
  }, 5000); // 👈 5 seconds here

  // Clear so it doesn’t show again on refresh
  sessionStorage.removeItem("welcomeMessage");
});

document.addEventListener("DOMContentLoaded", async () => {
  const statsContainer = document.getElementById("stats-cards");
  const notificationsList = document.querySelector(".notifications-list");

  if (!matric) return;

  await loadStats(matric, statsContainer);
  await loadNotifications(matric, notificationsList);
});

// ===========================
// Error Logger
// ===========================
function logError(label, error) {
  if (error) console.error(label, error.message || error);
}

// ===========================
// Load Stats
// ===========================
let redirectTimer;
async function loadStats(matric, container) {
  if (!container) return;

  try {
    // ===========================
    // Get Student Level
    // ===========================
    const { data: student } = await sb
      .from("students")
      .select("level_arabic")
      .eq("matric_number", matric)
      .single();

    const level = student?.level_arabic || t("Not assigned");

    // ===========================
    // Current Month Name
    // ===========================
    const now = new Date();
    const monthName = now.toLocaleString("default", { month: "long" });

    // ===========================
    // Fetch THIS MONTH Payments
    // ===========================
    const { data: monthlyPayments } = await sb
      .from("payments")
      .select("amount")
      .eq("matric_number", matric)
      .eq("status", "paid")
      .eq("deleted", false)
      .eq("month", monthName);

    // ===========================
    // Monthly Total
    // ===========================
    const monthlyTotal = monthlyPayments?.length
      ? monthlyPayments.reduce((sum, p) => sum + Number(p.amount), 0)
      : 0;

    // ===========================
    // Payment Status
    // ===========================
    const paymentStatus = monthlyTotal > 0 
  ? "✅ Paid" 
  : "❌ Unpaid";

    // ===========================
    // Latest Grade
    // ===========================
    const { data: grades } = await sb
      .from("grades")
      .select("total_score, created_at")
      .eq("matric_number", matric)
      .eq("released", true)
      .order("created_at", { ascending: false })
      .limit(1);

    const latestGrade = grades?.length ? grades[0].total_score : "--";

    // ===========================
// Fetch Outstanding Fees
// ===========================
const { data: outstanding } = await sb
  .from("student_fee_status")
  .select("month, amount_due")
  .eq("matric_number", matric)
  .eq("status", "unpaid");

// Remove duplicates (just in case)
const uniqueMonths = [...new Set((outstanding || []).map(o => o.month))];

const totalOutstanding = outstanding?.reduce(
  (sum, item) => sum + Number(item.amount_due),
  0
) || 0;

const outstandingMonths = uniqueMonths.join(", ");

// ===========================
// REMINDER (DASHBOARD - ALWAYS ON LOGIN)
// ===========================
if (totalOutstanding > 0) {
  const reminderText = document.getElementById("reminderText");
  const modal = document.getElementById("reminderModal");
  const whatsappBtn = document.getElementById("whatsappReminder");

  if (reminderText && modal && whatsappBtn) {
  reminderText.innerHTML = tmpl("payment_reminder", {
    amount: `₦${totalOutstanding.toLocaleString()}`,
    months: outstandingMonths
  });
  
    const message = encodeURIComponent(
      `Hello Sir/Madam, Please I will complete my payment for ${outstandingMonths} soon in sha Allah.`
    );

    whatsappBtn.href = `https://wa.me/2347054711066?text=${message}`;

    modal.classList.remove("hidden");

    // auto redirect (optional)
    redirectTimer = setTimeout(() => {
      window.location.href = "payment.html";
    }, 10000);
  }
}


  const outstandingHTML = totalOutstanding > 0
  ? `
    <div class="fee-alert">
      <div class="fee-alert-icon">⚠️</div>

      <div>
        <strong>${tmpl("outstanding_payment")}</strong><br>

        ${tmpl("outstanding_message", {
          amount: `<span class="amount-red">₦${totalOutstanding.toLocaleString()}</span>`,
          months: `<b>${outstandingMonths}</b>`
        })}
      </div>

      <button class="pay-btn" onclick="goToPayments()">
        ${tmpl("pay_now")}
      </button>
    </div>
  `
  : "";

    // ===========================
    // Render UI
    // ===========================
    container.innerHTML = `
  ${outstandingHTML}

  <div class="card">
    <div class="icon">🎓</div>
    <div class="details">
      <h3>${level}</h3>
      <p>Arabic Level</p>
    </div>
  </div>

      <div class="card">
        <div class="icon">💳</div>
        <div class="details">
          <h3>${paymentStatus}</h3>
          <p>${tmpl("month_payment", { month: monthName })}</p>
        </div>
      </div>

      <div class="card">
        <div class="icon">💰</div>
        <div class="details">
          <h3>₦${monthlyTotal.toLocaleString()}</h3>
          <p>${tmpl("month_amount", { month: monthName })}</p>
        </div>
      </div>

      <div class="card">
        <div class="icon">📝</div>
        <div class="details">
          <h3>${latestGrade}</h3>
          <p>Latest Grade</p>
        </div>
      </div>
    `;
    if (window.reTranslate) reTranslate();
  } catch (err) {
    logError("Stats error:", err);
    container.innerHTML = `<p style='color:red'>${t("Failed to load stats")}</p>`;
  }
}

function goToPayments() {
  document.querySelector(".amount-red")?.classList.remove("amount-red");
  window.location.href = "payment.html";
}

function closeReminder() {
  document.getElementById("reminderModal").classList.add("hidden");
  clearTimeout(redirectTimer);
}

// ===== Translate Hub Cards =====
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".hub-card .card-text").forEach(span => {
    // Trim text just in case there are spaces/newlines
    const original = span.textContent.trim();
    // Replace with translated text
    span.textContent = t(original);
  });
});

// ===========================  
// Load Notifications with dynamic border colors
// ===========================  
function toggleNotifications() {
  const list = document.querySelector(".notifications-list");
  const arrow = document.querySelector(".dropdown-arrow");
  if (!list) return;

  const isOpen = list.style.display === "block";
  list.style.display = isOpen ? "none" : "block";
  arrow.classList.toggle("open", !isOpen);
}

function renderMessage(message) {
  try {
    const parsed = JSON.parse(message);
    return tmpl(parsed.key, parsed.data);
  } catch {
    return message;
  }
}

function getHiddenNotifications() {
  return JSON.parse(
    localStorage.getItem("hiddenNotifications") || "[]"
  );
}

function hideNotification(id) {

  let hidden = getHiddenNotifications();

  if (!hidden.includes(id)) {
    hidden.push(id);
  }

  localStorage.setItem(
    "hiddenNotifications",
    JSON.stringify(hidden)
  );

  loadNotifications(matric);
}

function restoreNotifications() {

  localStorage.removeItem("hiddenNotifications");

  loadNotifications(matric);
}

async function loadNotifications(matric) {

  const list =
    document.querySelector(".notifications-list");

  const latest =
    document.querySelector(".notification-latest");

  const cardsContainer =
    document.getElementById("notificationCards");

  if (!list || !latest) return;

  try {

    const { data, error } = await sb
      .from("notifications")
      .select("message,title,created_at")
      .eq("matric_number", matric)
      .order("created_at", { ascending: false })
      .limit(15);

    if (error) throw error;

    const hidden = getHiddenNotifications();

    const visibleNotifications =
      (data || []).filter(
        n => !hidden.includes(n.created_at)
      );

    if (visibleNotifications.length === 0) {

      latest.innerHTML = `
        <p style="margin:0;">No notifications</p>
        <span class="dropdown-arrow">▼</span>
      `;

      cardsContainer.innerHTML =
        `<p>No notifications available.</p>`;

      return;
    }

    const latestNotif =
      visibleNotifications[0];

    let typeClass = "";
    let borderColor = "";
    let icon = "🔔";

    const title =
      latestNotif.title.toLowerCase();

    if (title.includes("schedule")) {
      borderColor = "#fcbb08";
      icon = "📅";
    }
    else if (title.includes("payment")) {
      borderColor = "#00ff55";
      icon = "💰";
    }
    else if (title.includes("grade")) {
      borderColor = "#0011ff";
      icon = "⭐";
    }
    else {
      const hash =
        Array.from(title)
        .reduce((a,c)=>a+c.charCodeAt(0),0);

      const colors = [
        "#9b59b6",
        "#1abc9c",
        "#e74c3c",
        "#f1c40f",
        "#34495e"
      ];

      borderColor =
        colors[hash % colors.length];
    }

    latest.innerHTML = `
      <div
        class="notifications-card"
        style="border-left:5px solid ${borderColor}; display:flex; align-items:center;"
      >
        <span style="font-size:18px;">
          ${icon}
        </span>

        <p style="margin:0; flex:1;">
          ${renderMessage(latestNotif.message)}
        </p>

        <span
          class="time"
          style="color:#cc0202;"
        >
          ${new Date(
            latestNotif.created_at
          ).toLocaleString()}
        </span>

        <span class="dropdown-arrow">
          ▼
        </span>
      </div>
    `;

    cardsContainer.innerHTML =
      visibleNotifications.map(n => {

        let borderColor = "";
        let icon = "🔔";

        const t =
          n.title.toLowerCase();

        if (t.includes("schedule")) {
          borderColor = "#fcbb08";
          icon = "📅";
        }
        else if (t.includes("payment")) {
          borderColor = "#00ff55";
          icon = "💰";
        }
        else if (t.includes("grade")) {
          borderColor = "#0011ff";
          icon = "⭐";
        }
        else {

          const hash =
            Array.from(t)
            .reduce(
              (a,c)=>a+c.charCodeAt(0),
              0
            );

          const colors = [
            "#9b59b6",
            "#1abc9c",
            "#e74c3c",
            "#f1c40f",
            "#34495e"
          ];

          borderColor =
            colors[hash % colors.length];
        }

        return `
          <div
            class="notifications-card"
            style="border-left:5px solid ${borderColor};"
          >

            <span style="font-size:18px;">
              ${icon}
            </span>

            <p>
              ${renderMessage(n.message)}
            </p>

            <span class="time">
              ${new Date(
                n.created_at
              ).toLocaleString()}
            </span>

            <button
              class="notif-remove"
              onclick="hideNotification('${n.created_at}')"
              title="Hide notification"
            >
              ✕
            </button>

          </div>
        `;
      }).join("");

  }
  catch (err) {

    console.error(
      "Notifications error:",
      err
    );

    latest.innerHTML = `
      <p style="color:red;">
        Failed to load
      </p>
      <span class="dropdown-arrow">
        ▼
      </span>
    `;

    cardsContainer.innerHTML = `
      <p style="color:red;">
        Failed to load notifications
      </p>
    `;
  }
}

document.addEventListener(
  "input",
  function(e) {

    if (
      e.target.id !==
      "notificationSearch"
    ) return;

    const term =
      e.target.value.toLowerCase();

    document
      .querySelectorAll(
        "#notificationCards .notifications-card"
      )
      .forEach(card => {

        card.style.display =
          card.innerText
            .toLowerCase()
            .includes(term)
            ? "flex"
            : "none";

      });

  }
);

// ===========================
// Logout
// ===========================
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
  sessionStorage.clear();
  localStorage.removeItem("rememberedEmail");
  localStorage.removeItem("studentSession"); // 👈 add this
  window.location.href = "login.html";
});
}
