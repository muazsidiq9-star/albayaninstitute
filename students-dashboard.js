// ===========================
// Student Guard (with DEV bypass)
// ===========================
const DEV_BYPASS = false; // 🔴 switch to true skips login
const matric = sessionStorage.getItem("matric");

(function () {
  if (DEV_BYPASS) return;
  const role = sessionStorage.getItem("role");
  if (role !== "student" || !matric) {
    alert(t("Student login required"));
    window.location.href = "login.html";
  }
})();

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
  banner.style.background = "#4CAF50";
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

    whatsappBtn.href = `https://wa.me/2348110705054?text=${message}`;

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

async function loadNotifications(matric) {  
  const list = document.querySelector(".notifications-list");
  const latest = document.querySelector(".notification-latest");
  if (!list || !latest) return;  

  try {  
    const { data, error } = await sb  
      .from("notifications")  
      .select("message, title, created_at")  
      .eq("matric_number", matric)  
      .order("created_at", { ascending: false })  
      .limit(5);  

    if (error) throw error;  

    if (!data || data.length === 0) {
      list.innerHTML = `<p>${"No notifications yet."}</p>`;
      latest.innerHTML = `<p style="margin:0;">${"No notifications"}</p><span class="dropdown-arrow">▼</span>`;
      return;
    }

    // Build latest notification as a full card
    const latestNotif = data[0];
    let typeClass = "";
    let borderColor = "";
    let icon = "🔔";

    const t = latestNotif.title.toLowerCase();
    if (t.includes("schedule")) { typeClass = "schedule"; borderColor = "#fcbb08"; icon="📅"; }
    else if (t.includes("payment")) { typeClass = "payments"; borderColor = "#00ff55"; icon="💰"; }
    else if (t.includes("grade")) { typeClass = "grades"; borderColor = "#0011ff"; icon="⭐"; }
    else { 
      const hash = Array.from(t).reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const colors = ["#9b59b6", "#1abc9c", "#e74c3c", "#f1c40f", "#34495e"];
      borderColor = colors[hash % colors.length]; 
      icon="🔔";
    }

    latest.innerHTML = `
  <div class="notifications-card ${typeClass}" style="border-left:5px solid ${borderColor}; display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
    <span style="margin-right:8px;font-size:18px;">${icon}</span>
    <p style="margin:0; flex:1;">${renderMessage(latestNotif.message)}</p>
    <span class="time" style="font-size:12px; color:#cc0202;">${new Date(latestNotif.created_at).toLocaleString()}</span>
    <span class="dropdown-arrow">▼</span>
  </div>
`;

    // Populate dropdown list (all notifications)
    list.innerHTML = data
      .map((n) => {
        let typeClass = "";
        let borderColor = "";
        let icon = "🔔";

        const t = n.title.toLowerCase();
        if (t.includes("schedule")) { typeClass = "schedule"; borderColor = "#fcbb08"; icon="📅"; }
        else if (t.includes("payment")) { typeClass = "payments"; borderColor = "#00ff55"; icon="💰"; }
        else if (t.includes("grade")) { typeClass = "grades"; borderColor = "#0011ff"; icon="⭐"; }
        else { 
          const hash = Array.from(t).reduce((acc, char) => acc + char.charCodeAt(0), 0);
          const colors = ["#9b59b6", "#1abc9c", "#e74c3c", "#f1c40f", "#34495e"];
          borderColor = colors[hash % colors.length]; 
          icon="🔔";
        }

        return `
          <div class="notifications-card" style="border-left: 5px solid ${borderColor};">
            <span style="margin-right:8px;font-size:18px;">${icon}</span>
            <p>${renderMessage(n.message)}</p>
            <span class="time">${new Date(n.created_at).toLocaleString()}</span>
          </div>
        `;
      })
      .join("");  

  } catch (err) {  
    console.error("Notifications error:", err);  
   list.innerHTML = `<p style='color:red'>"Failed to load notifications"</p>`; 
    latest.innerHTML = `<p style='color:red;margin:0'>Failed to load</p><span class="dropdown-arrow">▼</span>`;
  }  
}
console.log("LANG:", localStorage.getItem("lang"));
// ===========================
// Logout
// ===========================
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    sessionStorage.clear();
    localStorage.removeItem("rememberedEmail");
    window.location.href = "login.html";
  });
}