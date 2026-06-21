// ===========================
// ATTENDANCE PAGE LOGIC
// ===========================

document.addEventListener("DOMContentLoaded", () => {
  const supabase = window.supabase;

  // ---- DOM refs for each state panel ----
  const states = {
    loading: document.getElementById("state-loading"),
    notLoggedIn: document.getElementById("state-not-logged-in"),
    invalidLink: document.getElementById("state-invalid-link"),
    ready: document.getElementById("state-ready"),
    success: document.getElementById("state-success"),
    already: document.getElementById("state-already"),
    blocked: document.getElementById("state-blocked"),
  };

  function showState(name) {
    Object.values(states).forEach(el => { if (el) el.style.display = "none"; });
    if (states[name]) states[name].style.display = "block";
  }

  // ===========================
  // STEP 1 — Read token from URL
  // ===========================
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  if (!token) {
    showState("invalidLink");
    return;
  }

  // ===========================
  // STEP 2 — Check student login (localStorage, 7/14-day persistence)
  // ===========================
  function getActiveStudentSession() {
    const raw = localStorage.getItem("studentSession");
    if (!raw) return null;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return null;
    }

    if (!parsed.expiresAt || Date.now() > parsed.expiresAt) {
      localStorage.removeItem("studentSession");
      return null;
    }

    let currentStudent;
    try {
      currentStudent = JSON.parse(parsed.currentStudent);
    } catch (e) {
      return null;
    }

    return currentStudent; // { matric_number, fullname, email, level, ... }
  }

  const student = getActiveStudentSession();

  if (!student) {
    // Send them to login, but remember where to come back to.
    const returnUrl = window.location.pathname + window.location.search;
    sessionStorage.setItem("postLoginRedirect", returnUrl);

    const loginBtn = document.getElementById("loginRedirectBtn");
    if (loginBtn) {
      loginBtn.href = "login.html";
    }
    showState("notLoggedIn");
    return;
  }

  // ===========================
  // STEP 3 — Look up the session by token
  // ===========================
  async function loadSession() {
    showState("loading");

    const { data, error } = await supabase.rpc("get_session_by_token", {
      p_token: token
    });

    if (error || !data || data.found === false) {
      showState("invalidLink");
      return;
    }

    const now = new Date();
    const opensAt = new Date(data.opens_at);
    const closesAt = new Date(data.closes_at);

    document.getElementById("sessionTitle").textContent = data.title;
    document.getElementById("sessionLevel").textContent = data.level;
    document.getElementById("studentNameLine").textContent =
      `${t("Marking attendance as:")} ${student.fullname} (${student.matric_number})`;

    if (!data.is_active) {
      showBlocked(
        t("Session Inactive"),
        t("This attendance session has been deactivated by the admin.")
      );
      return;
    }

    if (now < opensAt) {
      showBlocked(
        t("Not Open Yet"),
        `${t("This session opens at")} ${opensAt.toLocaleString()}.`
      );
      return;
    }

    if (now > closesAt) {
      showBlocked(
        t("Attendance Window Closed"),
        `${t("This session closed at")} ${closesAt.toLocaleString()}.`
      );
      return;
    }

    // Looks good client-side — show the button.
    // (Final authority is still the server-side RPC on click.)
    showState("ready");
  }

  function showBlocked(title, message) {
    document.getElementById("blockedTitle").textContent = title;
    document.getElementById("blockedMessage").textContent = message;
    showState("blocked");
  }

  // ===========================
  // STEP 4 — Handle the "Mark Me Present" click
  // ===========================
  const markBtn = document.getElementById("markAttendanceBtn");
  const readyError = document.getElementById("readyError");

  markBtn?.addEventListener("click", async () => {
    markBtn.disabled = true;
    markBtn.textContent = t("Marking...");
    readyError.style.display = "none";

    try {
      const { data, error } = await supabase.rpc("mark_attendance", {
        p_token: token,
        p_matric_number: student.matric_number,
        p_ip_address: null,
        p_user_agent: navigator.userAgent
      });

      if (error) {
        readyError.textContent = t("Something went wrong. Please try again.");
        readyError.style.display = "block";
        markBtn.disabled = false;
        markBtn.textContent = t("✅ Mark Me Present");
        return;
      }

      if (!data.success) {
        switch (data.reason) {
          case "not_open_yet":
            showBlocked(
              t("Not Open Yet"),
              `${t("This session opens at")} ${new Date(data.opens_at).toLocaleString()}.`
            );
            break;
          case "closed":
            showBlocked(
              t("Attendance Window Closed"),
              `${t("This session closed at")} ${new Date(data.closes_at).toLocaleString()}.`
            );
            break;
          case "session_inactive":
            showBlocked(
              t("Session Inactive"),
              t("This attendance session has been deactivated by the admin.")
            );
            break;
          case "invalid_token":
            showState("invalidLink");
            break;
          default:
            readyError.textContent = t("Could not mark attendance. Please try again.");
            readyError.style.display = "block";
            markBtn.disabled = false;
            markBtn.textContent = t("✅ Mark Me Present");
        }
        return;
      }

      // Success path
      const joinBtnSuccess = document.getElementById("joinClassBtnSuccess");
      const joinBtnAlready = document.getElementById("joinClassBtnAlready");

      if (data.already_marked) {
        document.getElementById("alreadyMessage").textContent =
          `${t("You were already marked present for")} "${data.session_title}".`;

        if (data.platform_link) {
          joinBtnAlready.href = data.platform_link;
          joinBtnAlready.style.display = "flex";
        } else {
          joinBtnAlready.style.display = "none";
        }

        showState("already");
      } else {
        document.getElementById("successMessage").textContent =
          `${t("You've been marked present for")} "${data.session_title}".`;

        if (data.platform_link) {
          joinBtnSuccess.href = data.platform_link;
          joinBtnSuccess.style.display = "flex";
        } else {
          joinBtnSuccess.style.display = "none";
        }

        showState("success");
      }

    } catch (err) {
      console.error("ATTENDANCE ERROR:", err);
      readyError.textContent = t("Something went wrong. Please try again.");
      readyError.style.display = "block";
      markBtn.disabled = false;
      markBtn.textContent = t("✅ Mark Me Present");
    }
  });

  // Kick off
  loadSession();
});