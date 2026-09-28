// ============================================
// STUDENT GUARD
// Logs a student out if their account has been soft-deleted since they
// logged in. Include on every student page, AFTER the supabase-js script:
//   <script src="student-guard.js"></script>
// Self-contained: it creates its own client, so it works regardless of what
// each page calls its own (db / sb / supabaseClient).
// ============================================

(function () {
  const SUPABASE_URL = "https://cjrpjekmqrckozrbtwps.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_nR5kvC32lYVX0OflJM8sUA_tBaqRy1b";

  function clearStudentSession() {
    sessionStorage.clear();
    localStorage.removeItem("studentSession");
    localStorage.removeItem("currentAssessmentId");
  }

  async function checkStudentStillActive() {
    const role   = sessionStorage.getItem("role");
    const matric = sessionStorage.getItem("matric");

    // Not a student session (or the page's own guard will handle it)
    if (role !== "student" || !matric) return;
    if (!window.supabase || !window.supabase.createClient) return;

    try {
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

      const { data, error } = await client
        .from("students")
        .select("deleted")
        .eq("matric_number", matric)
        .maybeSingle();

      // Fail open on lookup problems so a network blip never logs anyone out
      if (error) return;

      // Row gone entirely (permanently deleted) or soft-deleted
      if (!data || data.deleted === true) {
        clearStudentSession();
        const msg = (typeof t === "function")
          ? t("Your account is no longer active. Please contact the institute.")
          : "Your account is no longer active. Please contact the institute.";
        alert(msg);
        window.location.href = "login.html";
      }
    } catch (e) {
      console.error("Student guard check failed:", e);
    }
  }

  document.addEventListener("DOMContentLoaded", checkStudentStillActive);
})();