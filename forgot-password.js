console.log("Forgot password JS loaded");

const form = document.getElementById("forgotForm");
const emailInput = document.getElementById("email");
const errorMsg = document.querySelector(".error-msg");
const successMsg = document.querySelector(".success-msg");

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    if (!email) return alert(t("Please enter your email"));

    try {
      // 1️⃣ Check if student exists
      const { data: student, error: fetchError } = await sb
        .from("students")
        .select("*")
        .eq("email", email)
        .single();

      if (fetchError || !student) {
        errorMsg.textContent = t("No student found with this email.");
        errorMsg.style.color = "red";
        successMsg.textContent = "";
        return;
      }

      // 2️⃣ Generate temp password
      const tempPassword = Math.random().toString(36).slice(-8); // random 8 chars

      // 3️⃣ Update password in Supabase & mark password_changed = true
      const { error: updateError } = await sb
        .from("students")
        .update({ password: tempPassword, password_changed: true })
        .eq("email", email);

      if (updateError) {
        errorMsg.textContent = t("Failed to reset password. Try again later.");
        errorMsg.style.color = "red";
        successMsg.textContent = "";
        return;
      }

      // 4️⃣ Insert notification (for student dashboard)
      await sb.from("notifications").insert([{
        matric_number: student.matric_number,
        title: "Password Reset",
        message: `Your temporary password is: ${tempPassword}`,
        created_at: new Date().toISOString()
      }]);

      // 5️⃣ Display fancy temp password box
      successMsg.innerHTML = `
        Temporary password generated:
        <div style="display:flex; align-items:center; margin-top:5px;">
          <input type="password" id="tempPass" value="${tempPassword}" readonly style="flex:1; padding:5px; border:1px solid var(--border-color); border-radius:5px; margin-right:5px;">
          <button type="button" id="toggleTempPass" style="margin-right:5px;">👁️</button>
          <button type="button" id="copyTempPass">📋</button>
        </div>
      `;
      successMsg.style.color = "green";
      errorMsg.textContent = "";

      // Reset email input
      emailInput.value = "";

      // 6️⃣ Show/hide temp password
      const tempPassInput = document.getElementById("tempPass");
      const toggleBtn = document.getElementById("toggleTempPass");
      toggleBtn.addEventListener("click", () => {
        tempPassInput.type = tempPassInput.type === "password" ? "text" : "password";
      });

      // 7️⃣ Copy temp password
      const copyBtn = document.getElementById("copyTempPass");
      copyBtn.addEventListener("click", () => {
        tempPassInput.select();
        tempPassInput.setSelectionRange(0, 99999); // mobile support
        document.execCommand("copy");
        alert(t("Temporary password copied to clipboard!"));
      });

    } catch (err) {
      console.error("Forgot password error:", err);
      errorMsg.textContent = "Something went wrong. Check console.";
      errorMsg.style.color = "red";
      successMsg.textContent = "";
    }
  });
}